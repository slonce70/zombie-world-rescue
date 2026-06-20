// Cloudflare Worker + Durable Object: relay-сервер кооперативу.
// Кімната = один Durable Object (ім'я = код кімнати). Протокол ідентичний
// relay/dev-relay.mjs: {to, d} → {from, d}; службові relay/peer/err.
//
// Деплой:  cd worker && npx wrangler deploy
// Адреса потім вписується у src/net/transport.js (DEFAULT_RELAY).
import { cleanNickSrv } from './nick.mjs';

const MAX_PLAYERS = 4;
const MAX_WS_BYTES = 65536;   // ліміт одного ws-повідомлення (звичайна пачка — сотні байт)
const MAX_BATCH_ITEMS = 128;  // ліміт елементів у пачці
const MAX_BODY_BYTES = 4096;  // ліміт тіла POST для Ліги/Лобі
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MSGS = 400;    // ~40 повідомлень/с — у 4 рази більше за чесний максимум

// CORS: гра живе на github.io, Ліга — тут
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const id = env.SAVE.idFromName('save');
      return env.SAVE.get(id).fetch(request);
    }
    if (url.pathname !== '/ws') return new Response('zr-relay ok', { status: 200 });
    const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!code) return new Response('bad room', { status: 400 });
    const id = env.ROOM.idFromName(code);
    return env.ROOM.get(id).fetch(request);
  },
};

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
      id = 1;
      await this.state.storage.put('nextId', 2);
      await this.state.storage.put('alive', true);
    } else {
      const alive = await this.state.storage.get('alive');
      if (!alive) return this._rejectSocket('noroom');
      // resume чесний лише з правильним СЕКРЕТНИМ ключем цього pid (видається при першому вході).
      // Без нього будь-хто з кодом кімнати міг би вибити конкретного гостя й зайняти його слот
      // (impersonation), тож невалідний resume трактуємо як звичайне нове приєднання.
      if (resume >= 2 && resumeKey) {
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
      const per = new Map(); // pid -> [d, …] у порядку надсилання
      for (const it of msg.m.slice(0, MAX_BATCH_ITEMS)) {
        if (!it || it.d === undefined) continue;
        if (it.to === 0) {
          for (const pid of peers.keys()) {
            if (pid === att.id) continue;
            if (!per.has(pid)) per.set(pid, []);
            per.get(pid).push(it.d);
          }
        } else {
          const pid = it.to | 0;
          if (pid === att.id || !peers.has(pid)) continue;
          if (!per.has(pid)) per.set(pid, []);
          per.get(pid).push(it.d);
        }
      }
      for (const [pid, list] of per) {
        const sock = peers.get(pid);
        if (!sock) continue;
        this._safeSend(sock, JSON.stringify(
          list.length === 1 ? { from: att.id, d: list[0] } : { from: att.id, b: list }
        ));
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
    for (const [, sock] of peers) this._safeSend(sock, JSON.stringify({ t: 'peer', id: att.id, on: false }));
    if (att.id === 1) {
      // хост зник: реконекту хоста немає, тому грейс короткий — щоб гості
      // не висіли в «чекаємо хоста» довше за 30с
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
const LOBBY_MODES = new Set(['campaign', 'storm', 'arena']);

export class Lobby {
  constructor(state) {
    this.state = state;
    this.players = new Map(); // cid -> {nick, ts}
    this.rooms = new Map();   // code -> {cid, host, mode, country, n, state, build, ts}
    this._ping = new Map();   // ip -> {n, t0} (анти-флуд пінгів, як _claimAllowed у SaveVault)
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
  }

  _view(now) {
    this._prune(now);
    const players = [];
    for (const p of this.players.values()) {
      players.push(p.nick);
      if (players.length >= 60) break;
    }
    const rooms = [...this.rooms.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 20)
      .map(([code, r]) => ({
        code, host: r.host, mode: r.mode, country: r.country,
        n: r.n, state: r.state, build: r.build,
      }));
    return { online: this.players.size, players, rooms };
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
      if (url.pathname === '/lobby/state') return this.json(this._view(now));
      if (url.pathname === '/lobby/ping' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!this._pingAllowed(ip)) return this.json({ error: 'rate' }, 429);
        const _raw = await request.text();
        if (_raw.length > MAX_BODY_BYTES) return this.json({ error: 'big' }, 413);
        const d = JSON.parse(_raw);
        const cid = String(d.cid || '').slice(0, 40);
        if (cid.length < 8) return this.json({ error: 'bad' }, 400);
        this.players.set(cid, { nick: cleanNickSrv(d.nick), ts: now });
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
              country: String(d.room.country || 'UKR').toUpperCase().slice(0, 4),
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
const SAVE_MAX_BYTES = 24 * 1024;   // сейв ~2-3 КБ, стеля з запасом
const SAVE_BODY_BYTES = 32 * 1024;
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
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  _cid(raw) {
    const cid = String(raw || '').slice(0, 40);
    return cid.length >= 8 ? cid : null;
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
        const d = await request.json();
        const cid = this._cid(d.cid);
        const data = typeof d.data === 'string' ? d.data : '';
        if (!cid || !data || data.length > SAVE_MAX_BYTES) return this.json({ error: 'bad' }, 400);
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
        const d = await request.json();
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
        const d = await request.json();
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
const MODES = { storm: 'desc', arena: 'asc' }; // як сортувати score

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
    if (mode === 'arena' && !(score >= 30000 && score <= 3600000)) return this.json({ error: 'score' }, 400);
    // анти-спам: не частіше за раз на 10с НА РЕЖИМ (шторм і арена не заважають одне одному)
    const now = Date.now();
    const rlKey = `${cid}|${mode}|${country}`;
    const last = this._lastSubmit.get(rlKey) || 0;
    if (now - last < 10000) return this.json({ error: 'slow' }, 429);
    this._lastSubmit.set(rlKey, now);
    if (this._lastSubmit.size > 5000) this._lastSubmit.clear();
    const team = JSON.stringify((Array.isArray(d.team) ? d.team : []).slice(0, 4).map(cleanNickSrv));
    // тримаємо найкращий результат
    const cur = this.sql.exec(
      'SELECT score FROM entries WHERE cid = ? AND mode = ? AND country = ?', cid, mode, country
    ).toArray();
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
    // показуємо лише топ-50 → тримаємо щонайбільше 500 на (mode,country), решту прибираємо
    const ord = MODES[mode] === 'desc' ? 'DESC' : 'ASC';
    const cnt = this.sql.exec('SELECT COUNT(*) AS n FROM entries WHERE mode = ? AND country = ?', mode, country).toArray();
    if ((cnt[0].n | 0) > 500) {
      this.sql.exec(
        `DELETE FROM entries WHERE mode = ? AND country = ? AND cid IN (
           SELECT cid FROM entries WHERE mode = ? AND country = ? ORDER BY score ${ord} LIMIT -1 OFFSET 500)`,
        mode, country, mode, country
      );
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
