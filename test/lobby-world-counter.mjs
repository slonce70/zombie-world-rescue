// 🌍 Лічильник світу в Lobby DO (worker/relay-worker.js): клампи проти накрутки,
// переживання перезапуску воркера і перемикання доби опівночі UTC.
// relay-worker.js — ESM у commonjs-пакеті, тож тягнемо його через data-URL
// (як test/relay-worker-unit.mjs), переписавши відносні імпорти в абсолютні.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workerDir = new URL('../worker/', import.meta.url);
const source = readFileSync(new URL('relay-worker.js', workerDir), 'utf8')
  .replace(/ from '\.\//g, ` from '${workerDir}`);
const { Lobby, clampSaved, trimWeek, SAVED_PER_PING, SAVED_PER_DAY, SAVED_PER_DAY_IP } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// Мінімальний шим DO storage: get/put/delete(ключ або масив)/list({prefix}).
// Один store переживає кілька Lobby — саме так і перевіряємо перезапуск воркера.
// delete() тримає СПРАВЖНІЙ ліміт Durable Objects — 128 ключів за виклик: без нього
// тест не помітив би, що прибирання доби падає на 129-му ключі.
const DO_DELETE_MAX = 128;
function newStore() { return new Map(); }
function newLobby(store) {
  return new Lobby({
    storage: {
      async get(k) { return store.get(k); },
      async put(k, v) { store.set(k, v); },
      async delete(k) {
        const keys = Array.isArray(k) ? k : [k];
        if (keys.length > DO_DELETE_MAX) throw new Error(`DO delete: ${keys.length} keys > ${DO_DELETE_MAX}`);
        for (const key of keys) store.delete(key);
      },
      async list({ prefix }) {
        const out = new Map();
        for (const [k, v] of store) if (k.startsWith(prefix)) out.set(k, v);
        return out;
      },
    },
  });
}

const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 7, 12, 10, 0, 0); // 2026-08-12, середина доби UTC
const CID = 'cid-player-0001';
const IP = '203.0.113.7';                   // домашній роутер однієї родини
// вичерпати добову квоту одного cid: за один пінг більше за SAVED_PER_PING не проходить
async function fillQuota(lobby, now, cid, ip = IP) {
  for (let i = 0; i < Math.ceil(SAVED_PER_DAY / SAVED_PER_PING) + 2; i++) {
    await lobby._recordSaved(now, cid, ip, SAVED_PER_PING);
  }
}
// накрутка «як у рев'ю»: щоразу свіжий cid із того самого браузера
async function rotateCids(lobby, now, ip, n) {
  for (let i = 0; i < n; i++) await lobby._recordSaved(now, `fake-cid-${i}-xxxxxxxx`, ip, SAVED_PER_PING);
}

// ── чиста логіка клампа ──────────────────────────────────────────────────────
test('стеля на пінг виведена з гри, а не з голови', () => {
  // за один рівень фізично рятується щонайбільше 11 людей (3 хлів + 3 замок + 5 маєток),
  // найдовший забіг — експедиція з 5 етапів → 55. Менша стеля різала б чесного гравця,
  // набагато більша — робила б обмеження декоративним.
  assert.ok(SAVED_PER_PING >= 55, `стеля ${SAVED_PER_PING} менша за чесний максимум забігу (55)`);
  assert.ok(SAVED_PER_PING <= 100, `стеля ${SAVED_PER_PING} завелика: один пінг не рятує стільки`);
  assert.ok(SAVED_PER_DAY >= SAVED_PER_PING && SAVED_PER_DAY <= 2000);
});

test('стеля мережі має запас на кількох дітей за одним роутером', () => {
  // брат, сестра, гості, планшет і ноутбук — щонайменше 4 дитини на СВОЇЙ добовій стелі
  assert.ok(SAVED_PER_DAY_IP >= 4 * SAVED_PER_DAY,
    `стеля мережі ${SAVED_PER_DAY_IP} не витримує навіть 4 дітей по ${SAVED_PER_DAY}`);
  // але лишається стелею: один браузер за добу не має важити як ціле місто
  assert.ok(SAVED_PER_DAY_IP <= 10 * SAVED_PER_DAY, `стеля мережі ${SAVED_PER_DAY_IP} декоративна`);
});

test('clampSaved відсікає сміття і накрутку', () => {
  assert.equal(clampSaved(3, 0), 3);
  assert.equal(clampSaved(0, 0), 0);
  assert.equal(clampSaved(-5, 0), 0);
  assert.equal(clampSaved(2.9, 0), 2, 'дробове — вниз до цілого');
  assert.equal(clampSaved(NaN, 0), 0);
  assert.equal(clampSaved(Infinity, 0), 0);
  assert.equal(clampSaved('999999', 0), SAVED_PER_PING, 'рядок-накрутка ріжеться до стелі пінгу');
  assert.equal(clampSaved(null, 0), 0);
  assert.equal(clampSaved({}, 0), 0);
  assert.equal(clampSaved(10, SAVED_PER_DAY - 4), 4, 'залишок добової квоти cid');
  assert.equal(clampSaved(10, SAVED_PER_DAY), 0, 'квота cid вичерпана');
  assert.equal(clampSaved(10, SAVED_PER_DAY + 999), 0, 'переповнена квота не дає відʼємного');
  assert.equal(clampSaved(10, 0, SAVED_PER_DAY_IP - 3), 3, 'залишок квоти мережі');
  assert.equal(clampSaved(10, 0, SAVED_PER_DAY_IP), 0, 'квота мережі вичерпана');
  assert.equal(clampSaved(10, 0, SAVED_PER_DAY_IP + 999), 0, 'переповнена квота мережі не дає відʼємного');
});

test('trimWeek лишає 7 календарних діб, а не 7 останніх записів', () => {
  const week = { '2026-06-01': 5, '2026-08-05': 7, '2026-08-06': 1, '2026-08-12': 3 };
  assert.deepEqual(trimWeek(week, '2026-08-12'), { '2026-08-06': 1, '2026-08-12': 3 },
    'доба на 7 днів старша за поточну випадає, як і торішня');
  assert.deepEqual(trimWeek({}, '2026-08-12'), {});
  assert.deepEqual(trimWeek(null, '2026-08-12'), {}, 'порожній storage не валить');
  assert.deepEqual(trimWeek({ '2026-08-13': 9 }, '2026-08-12'), {}, 'доба з майбутнього не рахується');
});

// ── лічильник у DO ───────────────────────────────────────────────────────────
test('внесок рахується і видно у _view', async () => {
  const lobby = newLobby(newStore());
  await lobby._recordSaved(T0, CID, IP, 3);
  await lobby._recordSaved(T0, 'cid-player-0002', IP, 5);
  assert.equal(lobby._view(T0).worldSaved, 8);
  assert.equal(lobby._view(T0).worldSavedWeek, 8);
});

test('один клієнт не накрутить більше за стелю ні за пінг, ні за добу', async () => {
  const lobby = newLobby(newStore());
  await lobby._recordSaved(T0, CID, IP, 1_000_000);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_PING, 'один пінг обрізано до стелі пінгу');
  await fillQuota(lobby, T0, CID);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY, 'добова квота cid не пробивається');
  // чесний сусід усе ще додає своє — стеля персональна, не глобальна
  await lobby._recordSaved(T0, 'cid-player-0002', '198.51.100.9', 4);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY + 4);
});

test('ротація cid більше не дає свіжої квоти: стеля тримається на мережі', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  // рівно сценарій рев'ю: 200 пінгів по SAVED_PER_PING, кожен зі своїм cid
  await rotateCids(lobby, T0, IP, 200);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY_IP,
    'новий cid не відкриває нову квоту — стелю тримає IP');
  // і сховище не заросло ключем на кожен cid: один ключ на мережу за добу
  assert.deepEqual([...store.keys()].filter((k) => k.startsWith('sv:')), [`sv:2026-08-12:${IP}`]);
});

test('кілька дітей за одним роутером не блокують одне одного', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  // брат, сестра і двоє гостей — усі з одного вайфаю, кожен грає до своєї стелі
  for (const cid of ['cid-brat-0001', 'cid-sestra-01', 'cid-gost-0001', 'cid-gost-0002']) {
    await fillQuota(lobby, T0, cid);
  }
  assert.equal(lobby._view(T0).worldSaved, 4 * SAVED_PER_DAY,
    'четверта дитина за тим самим роутером теж потрапила в лічильник');
  assert.ok(4 * SAVED_PER_DAY <= SAVED_PER_DAY_IP);
});

test('число і стеля мережі переживають перезапуск воркера', async () => {
  const store = newStore();
  const before = newLobby(store);
  await before._recordSaved(T0, CID, IP, 7);
  assert.equal(before._view(T0).worldSaved, 7);

  const after = newLobby(store); // DO прокинувся після гібернації: памʼять порожня
  await after._loadTop3(T0);
  assert.equal(after._view(T0).worldSaved, 7, 'лічильник піднявся зі storage');
  // накрутка після гібернації теж упирається в ту саму добову стелю мережі
  await rotateCids(after, T0, IP, 100);
  assert.equal(after._view(T0).worldSaved, SAVED_PER_DAY_IP, 'квота мережі пережила перезапуск');
});

test('паралельні пінги одного cid не обходять квоту', async () => {
  const lobby = newLobby(newStore());
  // конвеєр: усі читання storage стартують до першого запису
  const n = Math.ceil(SAVED_PER_DAY / SAVED_PER_PING) + 10;
  await Promise.all(Array.from({ length: n }, () => lobby._recordSaved(T0, CID, IP, SAVED_PER_PING)));
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY, 'гонка read-modify-write не пробиває стелю');
});

test('опівночі UTC починається новий відлік, вчорашнє не тече в сьогодні', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  await fillQuota(lobby, T0, CID);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY);

  const tomorrow = T0 + DAY_MS;
  await lobby._loadTop3(tomorrow);
  assert.equal(lobby._view(tomorrow).worldSaved, 0, 'нова доба — нуль');
  // вчорашні ключі прибрані, добова квота теж почалася заново
  assert.ok(![...store.keys()].some((k) => k.startsWith('sv:2026-08-12:')), 'вчорашні sv:-ключі прибрано');
  assert.ok(![...store.keys()].some((k) => k === 'day:2026-08-12'), 'вчорашня комірка прибрана');
  await lobby._recordSaved(tomorrow, CID, IP, 9);
  assert.equal(lobby._view(tomorrow).worldSaved, 9);
  // тиждень пам'ятає обидві доби
  assert.equal(lobby._view(tomorrow).worldSavedWeek, SAVED_PER_DAY + 9);
});

test('прибирання доби не падає на 500+ вчорашніх ключах', async () => {
  const store = newStore();
  const yday = new Date(T0 - DAY_MS).toISOString().slice(0, 10);
  for (let i = 0; i < 500; i++) store.set(`sv:${yday}:198.51.${i >> 8}.${i & 255}`, 42);
  store.set('day:' + yday, { top3: [], saved: 12345, duel: [] });
  const lobby = newLobby(store);
  // до правки шим кидав «DO delete: 501 keys > 128», і перший пінг доби відповідав 400
  await lobby._loadTop3(T0);
  assert.equal([...store.keys()].filter((k) => k.includes(yday)).length, 0,
    'усі вчорашні ключі прибрані, а не лише перші 128');
  // і сам пінг живий: внесок нової доби рахується
  await lobby._recordSaved(T0, CID, IP, 5);
  assert.equal(lobby._view(T0).worldSaved, 5);
});

test('тижневий підсумок тримає рівно 7 останніх діб', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  for (let i = 0; i < 10; i++) {
    const now = T0 + i * DAY_MS;
    await lobby._loadTop3(now);
    await lobby._recordSaved(now, `cid-player-${1000 + i}`, IP, 10);
  }
  assert.equal(lobby._view(T0 + 9 * DAY_MS).worldSavedWeek, 70, 'старші за тиждень доби випали');
});

test('«тиждень» рахує календар, а не останні дні з грою', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  await lobby._recordSaved(T0, CID, IP, 30);           // пограли 12 серпня
  const later = T0 + 60 * DAY_MS;                      // і повернулись аж за два місяці
  await lobby._loadTop3(later);
  await lobby._recordSaved(later, CID, IP, 10);
  assert.equal(lobby._view(later).worldSaved, 10);
  assert.equal(lobby._view(later).worldSavedWeek, 10, 'серпневі 30 не тягнуться в жовтневий «тиждень»');
});

test('після місяця без гри «тиждень» не показує старе число', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  await lobby._recordSaved(T0, CID, IP, 30);
  const later = T0 + 40 * DAY_MS;
  await lobby._loadTop3(later); // ніхто не грав, дитина просто відкрила глобус
  assert.equal(lobby._view(later).worldSavedWeek, 0, 'на читанні тиждень теж обрізаний за віком');
});

// ── контракт із клієнтом ─────────────────────────────────────────────────────
test('/lobby/ping приймає saved і віддає число разом зі старими полями', async () => {
  const lobby = newLobby(newStore());
  const now = Date.now();
  const res = await lobby.fetch(new Request('https://x/lobby/ping', {
    method: 'POST',
    body: JSON.stringify({ cid: CID, nick: 'Влад', saved: 3, day: { score: 12 } }),
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.worldSaved, 3);
  assert.equal(body.worldSavedWeek, 3);
  // наявні поля _view не зламані
  assert.equal(body.online, 1);
  assert.equal(body.today, 1);
  assert.deepEqual(body.top3, [{ nick: 'Влад', score: 12 }]);
  assert.deepEqual(body.players, ['Влад']);
  assert.equal(body.rooms.length, 0);
  assert.equal(body.profiles.length, 1);

  const state = await (await lobby.fetch(new Request(`https://x/lobby/state?t=${now}`))).json();
  assert.equal(state.worldSaved, 3, '/lobby/state віддає те саме число');
  assert.deepEqual(state.top3, [{ nick: 'Влад', score: 12 }]);
});

test('дошка дуелі не віддає назовні cid і IP власника', async () => {
  const lobby = newLobby(newStore());
  const res = await lobby.fetch(new Request('https://x/lobby/ping', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': IP },
    body: JSON.stringify({ cid: CID, nick: 'Влад', duel: { mode: 'bank', ms: 60_000, won: true } }),
  }));
  const body = await res.json();
  assert.equal(body.duel.length, 1);
  assert.deepEqual(Object.keys(body.duel[0]).sort(), ['m', 'ms', 'nick', 'w'],
    'cid — це «пароль» хмарного сейва, у публічній відповіді його бути не може');
  assert.equal(body.duel[0].nick, 'Влад');
});

test('дошка дуелі належить cid: чужий пінг не переписує запис', async () => {
  const lobby = newLobby(newStore());
  const ping = (cid, ip, duel) => lobby.fetch(new Request('https://x/lobby/ping', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip },
    body: JSON.stringify({ cid, nick: duel.nick, duel }),
  }));
  await ping(CID, IP, { nick: 'Влад', mode: 'bank', ms: 60_000, won: true });
  // чужий пристрій виписує результат ПІД НІКОМ Влада — це має бути ОКРЕМИЙ рядок,
  // а не підміна вже здобутого часу
  const res = await ping('cid-fake-00001', '198.51.100.9', { nick: 'Влад', mode: 'bank', ms: 1, won: true });
  const board = (await res.json()).duel;
  assert.equal(board.length, 2, 'чужий нік створює свій рядок, а не затирає чужий');
  assert.ok(board.some((e) => e.ms === 60_000), 'справжній результат Влада на місці');
});
