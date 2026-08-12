// Cloudflare Worker + Durable Object: relay-сервер кооперативу.
// Кімната = один Durable Object (ім'я = код кімнати). Протокол ідентичний
// relay/dev-relay.mjs: {to, d} → {from, d}; службові relay/peer/err.
//
// Деплой:  cd worker && npx wrangler deploy
// Адреса потім вписується у src/net/transport.js (DEFAULT_RELAY).
import { cleanNickSrv, cleanCountrySrv } from './nick.mjs';
import { cleanProfileSrv, safeInt } from './profile.mjs';
import { routeBatch } from './route.mjs';
import { sanitizeFrontMetric } from './frontmetrics.mjs';
import { COMMUNITY_BODY_BYTES, COMMUNITY_PUBLISH_BODY_BYTES, Community } from './community.mjs';
export { Community };

const MAX_PLAYERS = 4;
const MAX_WS_BYTES = 65536;   // ліміт одного ws-повідомлення (звичайна пачка — сотні байт)
const MAX_BATCH_ITEMS = 128;  // ліміт елементів у пачці
const MAX_BODY_BYTES = 4096;  // ліміт тіла POST для Ліги/Лобі
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MSGS = 400;    // ~40 повідомлень/с — у 4 рази більше за чесний максимум
const utf8Bytes = (value) => new TextEncoder().encode(value).byteLength;
const utf8Decoder = new TextDecoder();
async function readJsonBody(request, limit) {
  const bytes = await request.arrayBuffer();
  return bytes.byteLength > limit
    ? { tooBig: true }
    : { tooBig: false, value: JSON.parse(utf8Decoder.decode(bytes)) };
}

// CORS: гра живе на github.io, Ліга — тут
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const SAVE_CORS = {
  ...CORS,
  'Access-Control-Allow-Origin': 'https://slonce70.github.io',
};
const FRONT_METRICS_CORS = SAVE_CORS;
const COMMUNITY_CORS = SAVE_CORS;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 🏆 Ліга рекордів
    if (url.pathname.startsWith('/league/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const id = env.LEAGUE.idFromName('league');
      return env.LEAGUE.get(id).fetch(request);
    }
    // 🟢 Лобі: онлайн і відкриті кімнати
    if (url.pathname.startsWith('/lobby/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const id = env.LOBBY.idFromName('lobby');
      return env.LOBBY.get(id).fetch(request);
    }
    // 💾 Хмарний сейв
    if (url.pathname.startsWith('/save/')) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== SAVE_CORS['Access-Control-Allow-Origin']) return new Response('forbidden origin', { status: 403 });
      if (request.method === 'OPTIONS') return new Response(null, { headers: SAVE_CORS });
      const id = env.SAVE.idFromName('save');
      return env.SAVE.get(id).fetch(request);
    }
    // 🗺️ Каталог пользовательских карт: один глобальный SQLite DO.
    if (url.pathname.startsWith('/community/')) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== COMMUNITY_CORS['Access-Control-Allow-Origin']) {
        return new Response('forbidden origin', { status: 403 });
      }
      if (request.method === 'OPTIONS') return new Response(null, { headers: COMMUNITY_CORS });
      const limit = url.pathname === '/community/publish' ? COMMUNITY_PUBLISH_BODY_BYTES : COMMUNITY_BODY_BYTES;
      if ((parseInt(request.headers.get('content-length'), 10) || 0) > limit) {
        return new Response('{"error":"big"}', {
          status: 413, headers: { 'Content-Type': 'application/json', ...COMMUNITY_CORS },
        });
      }
      const id = env.COMMUNITY.idFromName('community');
      return env.COMMUNITY.get(id).fetch(request);
    }
    // 🛰️ Opt-in Front metrics: only aggregate counters, no cid/nick/free text/time/location.
    if (url.pathname.startsWith('/front-metrics/')) {
      const origin = request.headers.get('Origin');
      if (origin !== FRONT_METRICS_CORS['Access-Control-Allow-Origin']) return new Response('forbidden origin', { status: 403 });
      if (request.method === 'OPTIONS') return new Response(null, { headers: FRONT_METRICS_CORS });
      const id = env.METRICS.idFromName('front-metrics');
      return env.METRICS.get(id).fetch(request);
    }
    if (url.pathname !== '/ws') return new Response('zr-relay ok', { status: 200 });
    const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!code) return new Response('bad room', { status: 400 });
    const id = env.ROOM.idFromName(code);
    return env.ROOM.get(id).fetch(request);
  },
};

export class FrontMetrics {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this._rate = new Map();
    this.sql.exec(`CREATE TABLE IF NOT EXISTS counters (
      event TEXT NOT NULL, version INTEGER NOT NULL, cohort TEXT NOT NULL,
      platform TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER NOT NULL,
      PRIMARY KEY (event, version, cohort, platform, lang)
    )`);
  }

  _allowed(ip) {
    const now = Date.now();
    let row = this._rate.get(ip);
    if (!row || now - row.t0 > 60_000) row = { n: 0, t0: now };
    row.n++;
    this._rate.set(ip, row);
    if (this._rate.size > 2000) this._rate.clear();
    return row.n <= 20;
  }

  json(value, status = 200) {
    return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...FRONT_METRICS_CORS } });
  }

  async fetch(request) {
    if (request.method !== 'POST') return this.json({ error: 'method' }, 405);
    const length = parseInt(request.headers.get('content-length') || '0', 10);
    if (length > 512) return this.json({ error: 'big' }, 413);
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    if (!this._allowed(ip)) return this.json({ error: 'rate' }, 429);
    const text = await request.text();
    if (text.length > 512) return this.json({ error: 'big' }, 413);
    let metric;
    try { metric = sanitizeFrontMetric(JSON.parse(text)); } catch (e) { metric = null; }
    if (!metric) return this.json({ error: 'bad' }, 400);
    this.sql.exec(
      `INSERT INTO counters (event, version, cohort, platform, lang, n) VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT (event, version, cohort, platform, lang) DO UPDATE SET n = n + 1`,
      metric.event, metric.version, metric.cohort, metric.platform, metric.lang
    );
    return this.json({ ok: true });
  }
}

export class Room {
  constructor(state) {
    this.state = state;
    // Hibernation API: сокети живуть, DO спить — простій кімнати безкоштовний
    this._rate = new Map(); // id -> {n, t0}; обнуляється при гібернації — це ок
  }

  // true = перебір: понад RATE_MAX_MSGS за вікно — флудера відключаємо
  _overRate(id) {
    const now = Date.now();
    let r = this._rate.get(id);
    if (!r || now - r.t0 > RATE_WINDOW_MS) { r = { n: 0, t0: now }; this._rate.set(id, r); }
    return ++r.n > RATE_MAX_MSGS;
  }

  _peers() {
    const out = new Map();
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att) out.set(att.id, ws);
    }
    return out;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const create = url.searchParams.get('create') === '1';
    const resume = parseInt(url.searchParams.get('resume') || '0', 10);
    const resumeKey = url.searchParams.get('resumeKey') || '';
    const peers = this._peers();

    let id, validResume = false;
    if (create) {
      if (peers.has(1)) return new Response('taken', { status: 409 });
      // 🛡️ create НЕ обходить анти-перехоплення слота хоста: якщо кімната ще жива і секрет
      // слота 1 уже виданий, то це не «нова кімната», а вікно грейсу зниклого хоста
      // (30с до alarm). Слот 1 у ньому дістає лише той, хто принесе той самий секрет,
      // решта — 409 (клієнт create() перебирає інший код кімнати).
      const claimed = (await this.state.storage.get('alive')) && (await this.state.storage.get('key:1'));
      if (claimed) {
        if (!resumeKey || resumeKey !== claimed) return new Response('taken', { status: 409 });
        validResume = true; // хост повернувся зі своїм ключем — лишаємо той самий секрет
      }
      id = 1;
      // nextId скидаємо ЛИШЕ для справді нової кімнати: у живій кімнаті гості вже мають
      // свої pid, і скидання в 2 видало б наступному гостю чужий id (колізія).
      if (!(await this.state.storage.get('nextId'))) await this.state.storage.put('nextId', 2);
      await this.state.storage.put('alive', true);
    } else {
      const alive = await this.state.storage.get('alive');
      if (!alive) return this._rejectSocket('noroom');
      // resume чесний лише з правильним СЕКРЕТНИМ ключем цього pid (видається при першому вході).
      // Без нього будь-хто з кодом кімнати міг би вибити конкретного гостя й зайняти його слот
      // (impersonation), тож невалідний resume трактуємо як звичайне нове приєднання.
      // id===1 (хост) теж може resume — тим самим секретним ключем слота (видається при create):
      // тихий reconnect хоста повертає АВТОРИТЕТНИЙ слот 1 у межах грейсу (анти-перехоплення як у гостей).
      if ((resume === 1 || resume >= 2) && resumeKey) {
        const stored = await this.state.storage.get('key:' + resume);
        if (stored && resumeKey === stored) validResume = true;
      }
      if (validResume) {
        // resume замінює старий сокет тим самим id навіть якщо кімната формально повна.
        if (!peers.has(resume) && peers.size >= MAX_PLAYERS) return this._rejectSocket('full');
        id = resume;
      } else {
        if (peers.size >= MAX_PLAYERS) return this._rejectSocket('full');
        id = (await this.state.storage.get('nextId')) || 2;
        await this.state.storage.put('nextId', id + 1);
      }
    }

    // секрет слота: при валідному resume лишаємо той самий, інакше — новий невгадуваний
    let key = validResume ? await this.state.storage.get('key:' + id) : null;
    if (!key) key = crypto.randomUUID();
    await this.state.storage.put('key:' + id, key);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id, key });
    // 🔌 хост повернувся (resume=1) у межах грейсу: знімаємо смертний таймер кімнати
    if (id === 1) {
      await this.state.storage.delete('hostGoneAt');
      await this.state.storage.deleteAlarm();
    }
    server.send(JSON.stringify({
      t: 'relay', you: id, isHost: id === 1, rk: key,
      peers: [...peers.keys()].filter((p) => p !== id),
    }));
    const replaced = validResume ? peers.get(id) : null;
    if (replaced) {
      try { replaced.close(1000, 'resume'); } catch (e) { /* ignore */ }
    }
    for (const [pid, sock] of peers) {
      if (pid !== id) this._safeSend(sock, JSON.stringify({ t: 'peer', id, on: true }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // кімнати немає / повна: відповідаємо через сокет, щоб клієнт побачив код помилки
  _rejectSocket(codeStr) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.send(JSON.stringify({ t: 'err', code: codeStr }));
    server.close(1008, codeStr);
    return new Response(null, { status: 101, webSocket: client });
  }

  _safeSend(ws, data) {
    try { ws.send(data); } catch (e) { /* сокет уже мертвий */ }
  }

  async webSocketMessage(ws, raw) {
    if ((typeof raw === 'string' ? raw.length : raw.byteLength) > MAX_WS_BYTES) return;
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const att = ws.deserializeAttachment();
    if (!att) return;
    if (this._overRate(att.id)) {
      try { ws.close(1008, 'flood'); } catch (e) { /* ignore */ }
      return;
    }
    const peers = this._peers();
    // 📦 пачка {t:'b', m:[{to,d},…]}: групуємо по отримувачах, кожному — одне ws-повідомлення
    if (msg && msg.t === 'b' && Array.isArray(msg.m)) {
      for (const { pid, msg: env2 } of routeBatch(msg.m, att.id, [...peers.keys()], (p) => peers.has(p), MAX_BATCH_ITEMS)) {
        const sock = peers.get(pid);
        if (!sock) continue;
        this._safeSend(sock, JSON.stringify(env2));
      }
      return;
    }
    if (!msg || msg.d === undefined) return;
    const env = JSON.stringify({ from: att.id, d: msg.d });
    if (msg.to === 0) {
      for (const [pid, sock] of peers) if (pid !== att.id) this._safeSend(sock, env);
    } else {
      const target = peers.get(msg.to | 0);
      if (target) this._safeSend(target, env);
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att) return;
    // 🔌 реконект (resume) міг уже прив'язати цей id до НОВОГО сокета — тоді запізніле закриття
    // старого сокета НЕ має слати peer-off (інакше хост викине щойно повернутого гостя).
    // Дзеркалить гард dev-relay (`room.sockets.get(id) !== ws`).
    for (const other of this.state.getWebSockets()) {
      if (other === ws) continue;
      const oa = other.deserializeAttachment();
      if (oa && oa.id === att.id) return; // id уже перебрав живий сокет — нічого не робимо
    }
    const peers = this._peers();
    peers.delete(att.id);
    // НЕ видаляємо 'key:'+id тут: інакше гонка «close побачили раніше за resume» лишає гостя
    // без ключа → новий pid → екран завантаження + втрата позиції (dev-relay тримає ключ у
    // room.keys так само). Ключі прибирає alarm()→deleteAll() при зникненні хоста.
    // ponytail: за вічно-живого хоста ключі ростуть з nextId; для родинного коопу (≤4) це дрібниця.
    for (const [, sock] of peers) this._safeSend(sock, JSON.stringify({ t: 'peer', id: att.id, on: false }));
    if (att.id === 1) {
      // хост зник: грейс ~30с на тихий reconnect (resume=1 у fetch() зніме цей alarm).
      // Якщо не повернувся — alarm() закриває кімнату й чистить ключі.
      await this.state.storage.put('hostGoneAt', Date.now());
      await this.state.storage.setAlarm(Date.now() + 30_000);
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    const peers = this._peers();
    if (peers.has(1)) return; // хост повернувся
    for (const [, sock] of peers) {
      this._safeSend(sock, JSON.stringify({ t: 'err', code: 'hostgone' }));
      try { sock.close(1000, 'hostgone'); } catch (e) { /* ignore */ }
    }
    await this.state.storage.deleteAll();
  }
}


// ============================================================
// 🟢 Лобі: один DO на весь світ. Хто зараз у мультиплеєрі + відкриті кімнати.
// Все в пам'яті: клієнти пінгують кожні ~8с, записи живуть 40с — якщо DO
// перезапуститься, картина відновиться за один пінг. Нічого не платимо за сховище.
// ============================================================
const LOBBY_TTL = 40_000;
// повний перелік режимів, які хост реально анонсує (MODE_ICON у src/ui/coopui.js);
// невідомий режим коерситься в 'campaign' — радіація більше не прикидається кампанією
const LOBBY_MODES = new Set(['campaign', 'expedition', 'storm', 'arena', 'radiation', 'turretwar', 'worldboss',
  'front', 'community-map', 'friendly-knockout', 'friendly-defense', 'friendly-zone-defense', 'weekly-coop']);

// 🌍 «Скільки людей світ урятував сьогодні» — публічне число на глобусі, тож клієнт
// тут НЕДОВІРЕНЕ джерело (як гість для хоста): усе клампиться на боці воркера.
//
// Стеля на ОДИН пінг виведена з гри, а не зі стелі. За один рівень фізично рятується
// щонайбільше 11 людей: хлів/місячний модуль `rescue` — 3 (spawnCivilians),
// підземелля замку `castle` — 3 (_rescueCastlePeople), маєток `manor` — 5
// (_spawnManorCivilians); корабель TUR і музиканти — теж по 3. Найдовший забіг —
// експедиція з EXPEDITION_STEPS = 5 етапів → 5 × 11 = 55. Округлено вгору до 60,
// щоб чесний гравець ніколи не впирався, навіть якщо клієнт шле внесок раз на забіг.
export const SAVED_PER_PING = 60;
// Стеля на добу з одного cid: 45 забігів по 11 людей — це вже ~4 години суцільної гри,
// більше за реальний день дитини. Округлено до 500.
export const SAVED_PER_DAY = 500;
const SAVED_WEEK_DAYS = 7;
// Скільки з цього пінгу справді зарахувати: сміття → 0, забагато → стеля,
// вичерпана добова квота cid → 0. Чиста функція — її й перевіряє юніт.
export function clampSaved(raw, already) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(n, SAVED_PER_PING, SAVED_PER_DAY - Math.max(0, already | 0)));
}

export class Lobby {
  constructor(state) {
    this.state = state;
    this.players = new Map(); // cid -> {nick, ts}
    this.profiles = new Map(); // cid -> {nick, countries, coins, crystals, kills, star, prestige, title, ts}
    this.rooms = new Map();   // code -> {cid, host, mode, country, n, state, build, ts}
    this._ping = new Map();   // ip -> {n, t0} (анти-флуд пінгів, як _claimAllowed у SaveVault)
    // 📅 скільки УНІКАЛЬНИХ гравців зайшло грати разом сьогодні (UTC).
    // ponytail: у памʼяті — скидається при гібернації DO (довгий простій); для лічильника-флагмана
    // цього досить. Точність через storage (seen:<day>:<cid>) — якщо колись знадобиться.
    this.day = '';
    this.todaySet = new Set();
    // 🏆 «топ-3 сьогодні»: денний список кращих штормових результатів. Живе у DO storage
    // (ключ day:<UTC-дата>), щоб пережити гібернацію; у памʼяті — гарячий кеш для швидкого _view.
    this._top3 = [];        // [{nick, score}] відсортовано за спаданням
    this._top3Day = '';     // яку добу тримає кеш
    this._top3Loaded = false;
    // 🌍 лічильник світу: ще одне поле тієї самої добової комірки day:<UTC-дата>.
    this._saved = 0;              // скільки людей врятовано сьогодні (кеш комірки)
    this._savedByCid = new Map(); // cid -> зараховано сьогодні; дзеркало ключів sv:<день>:<cid>
    this._savedWeek = {};         // день -> підсумок, останні 7 діб (щоб клієнт мав ціль тижня)
    this._savedQueue = null;      // хвіст черги внесків (див. _recordSaved)
  }

  _dayKey(now) {
    return new Date(now).toISOString().slice(0, 10);
  }

  _recordToday(now, cid) {
    const day = this._dayKey(now);
    if (day !== this.day) { this.day = day; this.todaySet = new Set(); }
    if (cid && this.todaySet.size < 100000) this.todaySet.add(cid);
  }

  // Ліниво піднімаємо денний топ зі storage у кеш (раз на добу / після гібернації).
  // Single-flight: DO однопоточний, але await віддає хід — два паралельні пінги
  // без цього читали storage удвох, і друге читання ЗАТИРАЛО в кеші рахунок,
  // який перший пінг щойно додав (реальна втрата day-score при in-flight пінгу).
  async _loadTop3(now) {
    const day = this._dayKey(now);
    while (!(this._top3Loaded && this._top3Day === day)) {
      if (this._top3Loading) { await this._top3Loading; continue; }
      this._top3Loading = this._readTop3(day);
      try { await this._top3Loading; } finally { this._top3Loading = null; }
    }
  }

  async _readTop3(day) {
    const stored = await this.state.storage.get('day:' + day);
    // сумісність: до v780 в комірці лежав ГОЛИЙ масив топ-3, тепер — {top3, saved}
    const cell = Array.isArray(stored) ? { top3: stored } : (stored && typeof stored === 'object' ? stored : {});
    this._top3 = Array.isArray(cell.top3) ? cell.top3 : [];
    this._saved = Math.max(0, cell.saved | 0);
    this._savedByCid = new Map(); // нова доба / після гібернації — квоти беремо зі storage
    const week = await this.state.storage.get('savedWeek');
    this._savedWeek = (week && typeof week === 'object') ? { ...week } : {};
    this._top3Day = day;
    this._top3Loaded = true;
    // прибираємо вчорашні ключі, щоб storage не ріс нескінченно
    const stale = [];
    const old = await this.state.storage.list({ prefix: 'day:' });
    for (const key of old.keys()) if (key !== 'day:' + day) stale.push(key);
    const oldSaved = await this.state.storage.list({ prefix: 'sv:' });
    for (const key of oldSaved.keys()) if (!key.startsWith('sv:' + day + ':')) stale.push(key);
    if (stale.length) await this.state.storage.delete(stale);
  }

  // добова комірка: топ-3 і лічильник світу лежать разом, один запис
  async _saveDayCell(day) {
    await this.state.storage.put('day:' + day, { top3: this._top3, saved: this._saved });
  }

  // 🌍 внесок гравця у лічильник світу. Беремо мінімум із того, що каже клієнт,
  // стелі на пінг і залишку добової квоти цього cid.
  // Внески йдуть ЧЕРГОЮ: квота — це read-modify-write, і конвеєр паралельних пінгів
  // прочитав би storage ще до першого запису, тобто обійшов би добову стелю.
  // ponytail: черга одна на весь DO; чесний клієнт шле внесок раз на забіг, тож дешево.
  // Якщо колись стане вузьким місцем — черга по cid.
  _recordSaved(now, cid, raw) {
    const next = Promise.resolve(this._savedQueue).then(() => this._recordSavedNow(now, cid, raw));
    this._savedQueue = next.catch(() => {});
    return next;
  }

  async _recordSavedNow(now, cid, raw) {
    await this._loadTop3(now);
    const day = this._dayKey(now);
    const key = `sv:${day}:${cid}`;
    // квоту тримаємо і в памʼяті, і в storage: памʼять — гарячий кеш,
    // storage переживає гібернацію DO і перезапуск воркера.
    const already = Math.max(this._savedByCid.get(cid) | 0, (await this.state.storage.get(key)) | 0);
    const add = clampSaved(raw, already);
    if (!add) return;
    if (this._savedByCid.size > 5000) this._savedByCid.clear();
    this._savedByCid.set(cid, already + add);
    this._saved += add;
    this._savedWeek[day] = this._saved;
    const days = Object.keys(this._savedWeek).sort();
    for (const d of days.slice(0, Math.max(0, days.length - SAVED_WEEK_DAYS))) delete this._savedWeek[d];
    await this.state.storage.put(key, already + add);
    await this._saveDayCell(day);
    await this.state.storage.put('savedWeek', this._savedWeek);
  }

  // Приймаємо «денний результат» {nick, score} і тримаємо топ-3 за сьогодні у storage.
  async _recordDayScore(now, nick, score) {
    await this._loadTop3(now);
    const day = this._dayKey(now);
    // ігноруємо відсутній/сміттєвий скор — інакше safeInt дав би підлогу 1 і засмітив топ
    if (!Number.isFinite(Number(score)) || Number(score) < 1) return;
    const cleaned = cleanNickSrv(nick);
    const sc = safeInt(score, 1, 200); // штормова хвиля: та сама стеля, що й у Лізі
    if (!cleaned) return;
    // один запис на нік — КРАЩИЙ: клієнт шле результат після кожного забігу,
    // слабший пізніший забіг не сміє затерти ранковий рекорд
    const prev = this._top3.find((e) => e.nick === cleaned);
    const best = prev ? Math.max(prev.score, sc) : sc;
    const list = this._top3.filter((e) => e.nick !== cleaned);
    list.push({ nick: cleaned, score: best });
    list.sort((a, b) => b.score - a.score);
    this._top3 = list.slice(0, 3);
    this._top3Day = day;
    await this._saveDayCell(day);
  }

  // нормальний клієнт пінгує раз на ~8с; 30/10с з однієї IP — щедрий запас, але стеля проти флуду
  _pingAllowed(ip) {
    const now = Date.now();
    let r = this._ping.get(ip);
    if (!r || now - r.t0 > 10_000) { r = { n: 0, t0: now }; this._ping.set(ip, r); }
    if (this._ping.size > 5000) this._ping.clear();
    return ++r.n <= 30;
  }

  _prune(now) {
    for (const [cid, p] of this.players) if (now - p.ts > LOBBY_TTL) this.players.delete(cid);
    for (const [code, r] of this.rooms) if (now - r.ts > LOBBY_TTL) this.rooms.delete(code);
    // жорстка стеля: якщо після прибирання простроченого мапа все одно завелика
    // (флуд унікальними cid у межах TTL) — викидаємо найстаріші записи
    if (this.players.size > 800) {
      const old = [...this.players.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < old.length - 800; i++) this.players.delete(old[i][0]);
    }
    if (this.profiles.size > 800) {
      const old = [...this.profiles.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < old.length - 800; i++) this.profiles.delete(old[i][0]);
    }
  }

  // safeInt — спільний із dev-relay у worker/profile.mjs

  // 📇 правила чистки профілю — спільні з dev-relay у worker/profile.mjs

  _view(now) {
    this._prune(now);
    const players = [];
    for (const p of this.players.values()) {
      players.push(p.nick);
      if (players.length >= 60) break;
    }
    const profiles = [...this.profiles.values()].sort((a, b) => b.ts - a.ts).slice(0, 60);
    const rooms = [...this.rooms.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 20)
      .map(([code, r]) => ({
        code, host: r.host, mode: r.mode, country: r.country,
        n: r.n, state: r.state, build: r.build,
      }));
    // worldSaved — сьогодні, worldSavedWeek — останні 7 діб (порожній світ виглядає
    // сумно: клієнт показує тижневе, коли добове замале)
    const week = Object.values(this._savedWeek).reduce((sum, n) => sum + Math.max(0, n | 0), 0);
    return {
      online: this.players.size, today: this.todaySet.size, top3: this._top3,
      worldSaved: this._saved, worldSavedWeek: week, players, profiles, rooms,
    };
  }

  json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    if ((parseInt(request.headers.get('content-length'), 10) || 0) > MAX_BODY_BYTES) {
      return this.json({ error: 'big' }, 413);
    }
    try {
      if (url.pathname === '/lobby/state') { await this._loadTop3(now); return this.json(this._view(now)); }
      if (url.pathname === '/lobby/ping' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!this._pingAllowed(ip)) return this.json({ error: 'rate' }, 429);
        const _raw = await request.text();
        if (_raw.length > MAX_BODY_BYTES) return this.json({ error: 'big' }, 413);
        const d = JSON.parse(_raw);
        const cid = String(d.cid || '').slice(0, 40);
        if (cid.length < 8) return this.json({ error: 'bad' }, 400);
        const nick = cleanNickSrv(d.nick);
        this.players.set(cid, { nick, ts: now });
        this.profiles.set(cid, cleanProfileSrv(nick, d.profile, now));
        this._recordToday(now, cid); // 📅 рахуємо унікального гравця за сьогодні
        // 🏆 денний результат для «топ-3 сьогодні» (клієнт шле свій кращий штормовий за сьогодні)
        if (d.day && typeof d.day === 'object') await this._recordDayScore(now, d.day.nick || nick, d.day.score);
        else await this._loadTop3(now); // однаково піднімаємо кеш, щоб _view повернув свіжий top3
        // 🌍 внесок у лічильник світу: скільки людей гравець урятував за забіг
        if (d.saved) await this._recordSaved(now, cid, d.saved);
        if (this.players.size > 500) this._prune(now);
        // хост закрив кімнату — прибираємо одразу, не чекаючи TTL
        if (d.close) {
          const code = String(d.close).toUpperCase().slice(0, 8);
          const r = this.rooms.get(code);
          if (r && r.cid === cid) this.rooms.delete(code);
        }
        // хост анонсує публічну кімнату
        if (d.room && d.room.code) {
          const code = String(d.room.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
          const mode = LOBBY_MODES.has(d.room.mode) ? d.room.mode : 'campaign';
          // не дозволяємо перехопити чужий лістинг: оновлювати запис коду може лише cid,
          // який його вперше анонсував (інакше можна було б підмінити країну/режим/стан чужої кімнати)
          const existing = this.rooms.get(code);
          if (code && (!existing || existing.cid === cid)) {
            this.rooms.set(code, {
              cid, host: cleanNickSrv(d.nick), mode,
              country: mode === 'community-map' ? 'CUSTOM' : cleanCountrySrv(d.room.country),
              n: Math.min(4, Math.max(1, d.room.n | 0)),
              state: d.room.state === 'game' ? 'game' : 'lobby',
              build: d.room.build | 0, ts: now,
            });
          }
        }
        return this.json(this._view(now));
      }
    } catch (e) {
      return this.json({ error: 'bad' }, 400);
    }
    return this.json({ error: 'notfound' }, 404);
  }
}


// ============================================================
// 💾 Хмарний сейв: один DO на весь світ, SQLite. Прогрес гравця лежить за його
// cid (довгий випадковий рядок із localStorage — він і є «пароль»). У кожного
// cid є ПОСТІЙНИЙ код відновлення (8 знаків): запиши його раз — і повернеш
// прогрес на будь-якому пристрої навіть після чищення браузера.
// ============================================================
const SAVE_MAX_BYTES = 64 * 1024;
const SAVE_BODY_BYTES = 96 * 1024;
const SAVE_PUT_COOLDOWN = 15_000;
const CLAIM_MAX_PER_MIN = 10;       // анти-перебір кодів з однієї IP
const LINK_ALPHABET = 'ABCDEFHJKLMNPRSTUVWXYZ23456789'; // без схожих O/0, I/1, G/6, Q

function randomCode(n) {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < n; i++) s += LINK_ALPHABET[buf[i] % LINK_ALPHABET.length];
  return s;
}

export class SaveVault {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS saves (
      cid TEXT PRIMARY KEY, data TEXT NOT NULL, ts INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS links (
      code TEXT PRIMARY KEY, cid TEXT NOT NULL, ts INTEGER NOT NULL
    )`);
    this._lastPut = new Map(); // cid -> ts (анти-спам, у пам'яті — ок)
    this._claims = new Map();  // ip -> {n, t0} (анти-перебір кодів)
    this._putIp = new Map(); // ip -> {n,t0}
  }

  _putAllowed(ip) {
    const now = Date.now();
    let r = this._putIp.get(ip);
    if (!r || now - r.t0 > 60_000) { r = { n: 0, t0: now }; this._putIp.set(ip, r); }
    if (this._putIp.size > 2000) this._putIp.clear();
    return ++r.n <= 30; // 30 збережень/хв/IP (норм клієнт пушить раз на 25с)
  }

  _claimAllowed(ip) {
    const now = Date.now();
    let r = this._claims.get(ip);
    if (!r || now - r.t0 > 60_000) { r = { n: 0, t0: now }; this._claims.set(ip, r); }
    if (this._claims.size > 2000) this._claims.clear();
    return ++r.n <= CLAIM_MAX_PER_MIN;
  }

  json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json', ...SAVE_CORS },
    });
  }

  _cid(raw) {
    const cid = String(raw || '');
    return /^[A-Za-z0-9_-]{8,40}$/.test(cid) ? cid : null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if ((parseInt(request.headers.get('content-length'), 10) || 0) > SAVE_BODY_BYTES) {
      return this.json({ error: 'big' }, 413);
    }
    const now = Date.now();
    try {
      // зберегти прогрес: {cid, data: "<рядок JSON сейва>"}
      if (url.pathname === '/save/put' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'x';
        if (!this._putAllowed(ip)) return this.json({ error: 'rate' }, 429);
        const body = await readJsonBody(request, SAVE_BODY_BYTES);
        if (body.tooBig) return this.json({ error: 'big' }, 413);
        const d = body.value;
        const cid = this._cid(d.cid);
        const data = typeof d.data === 'string' ? d.data : '';
        if (!cid || !data || utf8Bytes(data) > SAVE_MAX_BYTES) return this.json({ error: 'bad' }, 400);
        JSON.parse(data); // не-JSON не приймаємо (кине → catch → 400)
        const last = this._lastPut.get(cid) || 0;
        if (now - last < SAVE_PUT_COOLDOWN) return this.json({ error: 'slow' }, 429);
        this._lastPut.set(cid, now);
        if (this._lastPut.size > 5000) this._lastPut.clear();
        this.sql.exec(
          `INSERT INTO saves (cid, data, ts) VALUES (?, ?, ?)
           ON CONFLICT (cid) DO UPDATE SET data = excluded.data, ts = excluded.ts`,
          cid, data, now
        );
        return this.json({ ok: true, ts: now });
      }
      // забрати свій прогрес (новий пристрій із тим самим cid або відновлення)
      if (url.pathname === '/save/get') {
        const cid = this._cid(url.searchParams.get('cid'));
        if (!cid) return this.json({ error: 'bad' }, 400);
        const rows = this.sql.exec('SELECT data, ts FROM saves WHERE cid = ?', cid).toArray();
        if (!rows.length) return this.json({ error: 'none' }, 404);
        return this.json({ data: rows[0].data, ts: rows[0].ts });
      }
      // постійний код відновлення: {cid} → {code} (один на гравця, не згорає)
      if (url.pathname === '/save/link' && request.method === 'POST') {
        const body = await readJsonBody(request, SAVE_BODY_BYTES);
        if (body.tooBig) return this.json({ error: 'big' }, 413);
        const d = body.value;
        const cid = this._cid(d.cid);
        if (!cid) return this.json({ error: 'bad' }, 400);
        const has = this.sql.exec('SELECT cid FROM saves WHERE cid = ?', cid).toArray();
        if (!has.length) return this.json({ error: 'none' }, 404);
        const old = this.sql.exec('SELECT code FROM links WHERE cid = ?', cid).toArray();
        if (old.length) return this.json({ code: old[0].code });
        // колізія не сміє ВКРАСТИ чужий код: перевіряємо зайнятість, без REPLACE
        let code = '';
        for (let attempt = 0; attempt < 5 && !code; attempt++) {
          const candidate = randomCode(8);
          const clash = this.sql.exec('SELECT code FROM links WHERE code = ?', candidate).toArray();
          if (!clash.length) code = candidate;
        }
        if (!code) return this.json({ error: 'busy' }, 503);
        this.sql.exec('INSERT INTO links (code, cid, ts) VALUES (?, ?, ?)', code, cid, now);
        return this.json({ code });
      }
      // новий пристрій вводить код → отримує cid і сейв (код лишається дійсним)
      if (url.pathname === '/save/claim' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'x';
        if (!this._claimAllowed(ip)) return this.json({ error: 'slow' }, 429);
        const body = await readJsonBody(request, SAVE_BODY_BYTES);
        if (body.tooBig) return this.json({ error: 'big' }, 413);
        const d = body.value;
        const code = String(d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (code.length !== 8) return this.json({ error: 'bad' }, 400);
        const rows = this.sql.exec('SELECT cid FROM links WHERE code = ?', code).toArray();
        if (!rows.length) return this.json({ error: 'none' }, 404);
        const cid = rows[0].cid;
        const save = this.sql.exec('SELECT data, ts FROM saves WHERE cid = ?', cid).toArray();
        if (!save.length) return this.json({ error: 'none' }, 404);
        return this.json({ cid, data: save[0].data, ts: save[0].ts });
      }
    } catch (e) {
      return this.json({ error: 'bad' }, 400);
    }
    return this.json({ error: 'notfound' }, 404);
  }
}


// ============================================================
// 🏆 Ліга рекордів: один DO на весь світ, SQLite-таблиця рекордів.
// Кращий результат на гравця (cid) у кожному режимі+країні.
// ============================================================
const MODES = { storm: 'desc', arena: 'asc', coopstorm: 'desc' }; // як сортувати score
// 🛡️ Стеля записів на (mode, country) — лише запобіжник від нескінченного росту таблиці:
// відколи ми нікого не витісняємо, старе значення 500 замикало популярну пару назавжди
// (реальний гравець уже ніколи не потрапляв у таблицю). 50 000 унікальних cid на один
// режим+країну живий гравець не набере, а сканування без індексу лишається обмеженим.
// Показуємо, як і раніше, лише топ-50.
const MAX_ENTRIES = 50_000;
// 🤝 командні режими: запис показуємо лише коли реально грали разом (team ≥ 2)
const TEAM_MODES = new Set(['coopstorm']);

export class League {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS entries (
      cid TEXT NOT NULL, mode TEXT NOT NULL, country TEXT NOT NULL,
      nick TEXT NOT NULL, score INTEGER NOT NULL, team TEXT NOT NULL, ts INTEGER NOT NULL,
      PRIMARY KEY (cid, mode, country)
    )`);
    this._lastSubmit = new Map(); // cid -> ts (анти-спам)
    this._subIp = new Map(); // ip -> {n,t0}
  }

  _ipAllowed(ip) {
    const now = Date.now();
    let r = this._subIp.get(ip);
    if (!r || now - r.t0 > 60_000) { r = { n: 0, t0: now }; this._subIp.set(ip, r); }
    if (this._subIp.size > 2000) this._subIp.clear();
    return ++r.n <= 20; // 20 сабмітів/хв/IP
  }

  json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if ((parseInt(request.headers.get('content-length'), 10) || 0) > MAX_BODY_BYTES) {
      return this.json({ error: 'big' }, 413);
    }
    try {
      if (url.pathname === '/league/submit' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'x';
        if (!this._ipAllowed(ip)) return this.json({ error: 'rate' }, 429);
        const _raw = await request.text();
        if (_raw.length > MAX_BODY_BYTES) return this.json({ error: 'big' }, 413);
        return this.submit(JSON.parse(_raw));
      }
      if (url.pathname === '/league/top') {
        return this.top(url.searchParams);
      }
      // адмін: повне скидання таблиці. Ключ — ТІЛЬКИ секрет оточення
      // (npx wrangler secret put ADMIN_KEY); без секрета ендпоінт вимкнено.
      if (url.pathname === '/league/reset' && request.method === 'POST') {
        const adminKey = this.env && this.env.ADMIN_KEY;
        const d = await request.json();
        if (!adminKey || d.key !== adminKey) return this.json({ error: 'no' }, 403);
        this.sql.exec('DELETE FROM entries');
        return this.json({ ok: true });
      }
    } catch (e) {
      return this.json({ error: 'bad' }, 400);
    }
    return this.json({ error: 'notfound' }, 404);
  }

  submit(d) {
    const cid = String(d.cid || '').slice(0, 40);
    const mode = String(d.mode || '');
    const country = String(d.country || '').slice(0, 4).toUpperCase();
    const nick = cleanNickSrv(d.nick);
    const score = Math.round(Number(d.score));
    if (!cid || cid.length < 8 || !MODES[mode] || !/^[A-Z]{3}$|^ALL$/.test(country)) {
      return this.json({ error: 'bad' }, 400);
    }
    // здоровий глузд: шторм — хвилі, арена — мілісекунди
    if (mode === 'storm' && !(score >= 1 && score <= 200)) return this.json({ error: 'score' }, 400);
    if (mode === 'coopstorm' && !(score >= 1 && score <= 200)) return this.json({ error: 'score' }, 400);
    if (mode === 'arena' && !(score >= 30000 && score <= 3600000)) return this.json({ error: 'score' }, 400);
    // 🤝 команда: чистимо ніки і прибираємо дублі ЩЕ ДО перевірки «грали ≥2» —
    // ростер після реконекту може тримати той самий нік двічі, а «Влад + Влад»
    // у таблиці виглядає як брехня. Командний рекорд = щонайменше 2 РІЗНІ ніки.
    const teamNicks = [...new Set((Array.isArray(d.team) ? d.team : []).map(cleanNickSrv).filter(Boolean))].slice(0, 4);
    if (TEAM_MODES.has(mode) && teamNicks.length < 2) {
      return this.json({ error: 'team' }, 400);
    }
    // анти-спам: не частіше за раз на 10с НА РЕЖИМ (шторм і арена не заважають одне одному)
    const now = Date.now();
    const rlKey = `${cid}|${mode}|${country}`;
    const last = this._lastSubmit.get(rlKey) || 0;
    if (now - last < 10000) return this.json({ error: 'slow' }, 429);
    this._lastSubmit.set(rlKey, now);
    if (this._lastSubmit.size > 5000) this._lastSubmit.clear();
    const team = JSON.stringify(teamNicks);
    // тримаємо найкращий результат
    const cur = this.sql.exec(
      'SELECT score FROM entries WHERE cid = ? AND mode = ? AND country = ?', cid, mode, country
    ).toArray();
    // 🛡️ стеля таблиці тримається на кількості УНІКАЛЬНИХ cid, а не на витісненні найгірших:
    // новий гравець не потрапляє у переповнену (mode, country), але й НІКОГО звідти не виносить.
    // Раніше надлишок різався за рангом — і накрутка стирала рекорди справжніх гравців назавжди.
    // Накрутити СВОЄ місце все ще можна: рахунок без підпису — свідомо прийнята ціна (TODO.md).
    if (!cur.length) {
      const full = this.sql.exec(
        'SELECT COUNT(*) AS n FROM entries WHERE mode = ? AND country = ?', mode, country
      ).toArray();
      if ((full[0].n | 0) >= MAX_ENTRIES) return this.rankResponse(mode, country, cid);
    }
    const better = !cur.length || (MODES[mode] === 'desc' ? score > cur[0].score : score < cur[0].score);
    if (better) {
      this.sql.exec(
        `INSERT INTO entries (cid, mode, country, nick, score, team, ts) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (cid, mode, country) DO UPDATE SET nick = excluded.nick, score = excluded.score,
         team = excluded.team, ts = excluded.ts`,
        cid, mode, country, nick, score, team, now
      );
    } else {
      // нік міг змінитись — оновлюємо м'яко
      this.sql.exec('UPDATE entries SET nick = ? WHERE cid = ? AND mode = ? AND country = ?', nick, cid, mode, country);
    }
    return this.rankResponse(mode, country, cid);
  }

  top(params) {
    const mode = String(params.get('mode') || 'storm');
    const country = String(params.get('country') || 'UKR').slice(0, 4).toUpperCase();
    const cid = String(params.get('cid') || '').slice(0, 40); // та сама межа, що й у submit
    if (!MODES[mode]) return this.json({ error: 'bad' }, 400);
    return this.rankResponse(mode, country, cid);
  }

  rankResponse(mode, country, cid) {
    const ord = MODES[mode] === 'desc' ? 'DESC' : 'ASC';
    const top = this.sql.exec(
      `SELECT nick, score, team, ts, cid FROM entries WHERE mode = ? AND country = ?
       ORDER BY score ${ord}, ts ASC LIMIT 50`, mode, country
    ).toArray().map((r, i) => ({
      rank: i + 1, nick: r.nick, score: r.score,
      team: JSON.parse(r.team || '[]'), me: r.cid === cid,
    }));
    let me = null;
    if (cid) {
      const mine = this.sql.exec(
        'SELECT score FROM entries WHERE cid = ? AND mode = ? AND country = ?', cid, mode, country
      ).toArray();
      if (mine.length) {
        const myScore = mine[0].score;
        const beat = this.sql.exec(
          MODES[mode] === 'desc'
            ? 'SELECT COUNT(*) AS n FROM entries WHERE mode = ? AND country = ? AND score > ?'
            : 'SELECT COUNT(*) AS n FROM entries WHERE mode = ? AND country = ? AND score < ?',
          mode, country, myScore
        ).toArray();
        me = { rank: (beat[0].n | 0) + 1, score: myScore };
      }
    }
    return this.json({ top, me });
  }
}
