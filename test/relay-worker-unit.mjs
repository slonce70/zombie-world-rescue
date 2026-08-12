// 🛡️ Два гарди воркера (worker/relay-worker.js), обидва без мережі:
//  • Ліга: переповнена (mode, country) більше не витісняє чужі записи за рангом;
//  • Кімната: гілка create=1 не віддає слот хоста чужому у вікні грейсу.
// relay-worker.js — ESM у commonjs-пакеті, тож тягнемо його через data-URL
// (як test/relay-allowlist.mjs), переписавши відносні імпорти в абсолютні.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const workerDir = new URL('../worker/', import.meta.url);
const source = readFileSync(new URL('relay-worker.js', workerDir), 'utf8')
  .replace(/ from '\.\//g, ` from '${workerDir}`);
const { League, Room } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// ── Ліга ─────────────────────────────────────────────────────────────────────
// SQLite-шим під інтерфейс Durable Object storage.sql (exec(...args) → {toArray})
function newLeague() {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec(query, ...args) {
      const st = db.prepare(query);
      if (/^\s*SELECT/i.test(query)) return { toArray: () => st.all(...args) };
      st.run(...args);
      return { toArray: () => [] };
    },
  };
  return new League({ storage: { sql } }, {});
}

const storm = (cid, score, nick = 'Гравець') => ({ cid, nick, mode: 'storm', country: 'UKR', score });
const rows = (league) => league.sql.exec("SELECT cid, score FROM entries WHERE mode = 'storm' AND country = 'UKR'").toArray();

test('переповнена ліга не стирає чужі рекорди', async () => {
  const league = newLeague();
  // 500 справжніх гравців зі скромними результатами
  for (let i = 0; i < 500; i++) assert.equal((await league.submit(storm(`cid-real-${i}`, 3))).status, 200);
  assert.equal(rows(league).length, 500);

  // накрутка: 50 нових cid з максимальним балом — жоден не має нікого виносити
  for (let i = 0; i < 50; i++) await league.submit(storm(`cid-cheat-${i}`, 200, 'Читер'));
  const after = rows(league);
  assert.equal(after.length, 500, 'таблиця лишається на стелі, а не росте');
  assert.equal(after.filter((r) => r.cid.startsWith('cid-real-')).length, 500,
    'жоден реальний запис не видалено');
  assert.ok(!after.some((r) => r.cid.startsWith('cid-cheat-')), 'новий cid у повну таблицю не пускаємо');
});

test('свій запис у повній таблиці оновлюється як раніше', async () => {
  const league = newLeague();
  for (let i = 0; i < 500; i++) await league.submit(storm(`cid-real-${i}`, 3));
  league._lastSubmit.clear(); // замість 10с реального чекання анти-спаму
  const res = await league.submit(storm('cid-real-7', 42));
  assert.equal(res.status, 200);
  assert.equal(rows(league).find((r) => r.cid === 'cid-real-7').score, 42, 'кращий результат записався');
  assert.equal(rows(league).length, 500);
  const body = await res.json();
  assert.equal(body.me.score, 42);
  assert.equal(body.top[0].score, 42);
});

test('анти-спам /league/submit не змінився', async () => {
  const league = newLeague();
  const post = () => league.fetch(new Request('https://x/league/submit', {
    method: 'POST', body: JSON.stringify(storm('cid-spammer-1', 5)),
  }));
  assert.equal((await post()).status, 200);
  const second = await post();
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, 'slow');
});

// ── Кімната ──────────────────────────────────────────────────────────────────
// Мінімальні шими Workers-рантайму: сокети, storage, WebSocketPair, Response(101).
class FakeSocket {
  constructor() { this.att = null; this.sent = []; this.closed = null; }
  serializeAttachment(a) { this.att = a; }
  deserializeAttachment() { return this.att; }
  send(d) { this.sent.push(d); }
  close(code, reason) { this.closed = reason; }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new FakeSocket(); this[1] = new FakeSocket(); } };
const RealResponse = globalThis.Response;
class WsResponse {
  constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.webSocket = init.webSocket ?? null; }
}

function newRoom() {
  const store = new Map();
  const sockets = [];
  const room = new Room({
    getWebSockets: () => sockets,
    acceptWebSocket: (ws) => sockets.push(ws),
    storage: {
      async get(k) { return store.get(k); },
      async put(k, v) { store.set(k, v); },
      async delete(k) { store.delete(k); },
      async deleteAll() { store.clear(); },
      async setAlarm(t) { store.set('alarm', t); },
      async deleteAlarm() { store.delete('alarm'); },
    },
  });
  room._store = store;
  room._sockets = sockets;
  return room;
}

// один вхід у кімнату; повертає {status, you, rk, socket}
async function connect(room, query) {
  globalThis.Response = WsResponse;
  let res;
  try {
    res = await room.fetch({ url: `https://x/ws?room=CODE&${query}`, headers: { get: (h) => (h === 'Upgrade' ? 'websocket' : null) } });
  } finally { globalThis.Response = RealResponse; }
  const server = room._sockets[room._sockets.length - 1];
  const hello = res.status === 101 && server && server.sent.length ? JSON.parse(server.sent[0]) : null;
  return { status: res.status, you: hello && hello.you, rk: hello && hello.rk, socket: server, err: hello && hello.code };
}

// хост «згорнув вкладку»: сокет пропадає з getWebSockets, далі webSocketClose ставить грейс
async function dropHost(room, socket) {
  room._sockets.splice(room._sockets.indexOf(socket), 1);
  await room.webSocketClose(socket);
}

test('нова кімната створюється як раніше', async () => {
  const room = newRoom();
  const host = await connect(room, 'create=1');
  assert.equal(host.status, 101);
  assert.equal(host.you, 1);
  assert.ok(host.rk, 'хост отримав секрет слота');
  assert.equal(room._store.get('alive'), true);
  assert.equal(room._store.get('nextId'), 2);

  const guest = await connect(room, '');
  assert.equal(guest.you, 2, 'звичайний вхід гостя не зачеплено');
});

test('чужак у вікні грейсу не дістає слот хоста', async () => {
  const room = newRoom();
  const host = await connect(room, 'create=1');
  await connect(room, ''); // живий гість pid=2
  await dropHost(room, host.socket);
  assert.ok(room._store.get('hostGoneAt'), 'грейс запущено');

  const thief = await connect(room, 'create=1');
  assert.equal(thief.status, 409, 'create без ключа хоста — відмова');
  assert.equal(room._store.get('key:1'), host.rk, 'секрет хоста не перезаписано');
  assert.ok(room._store.get('alarm'), 'смертний таймер кімнати лишився');

  // так само нічого не дає підроблений ключ і спроба через resume
  assert.equal((await connect(room, 'create=1&resumeKey=nope')).status, 409);
  const fakeResume = await connect(room, 'resume=1&resumeKey=nope');
  assert.notEqual(fakeResume.you, 1, 'resume з чужим ключем не віддає слот 1');
});

test('справжній хост повертається зі своїм ключем', async () => {
  const room = newRoom();
  const host = await connect(room, 'create=1');
  await connect(room, ''); // гість pid=2
  await connect(room, ''); // гість pid=3
  await dropHost(room, host.socket);

  const back = await connect(room, `create=1&resumeKey=${encodeURIComponent(host.rk)}`);
  assert.equal(back.status, 101);
  assert.equal(back.you, 1);
  assert.equal(back.rk, host.rk, 'секрет слота лишився тим самим');
  assert.equal(room._store.get('hostGoneAt'), undefined, 'грейс знято');
  assert.equal(room._store.get('alarm'), undefined, 'смертний таймер знято');
  assert.equal(room._store.get('nextId'), 4, 'create не скинув nextId при живих гостях');

  const guest = await connect(room, '');
  assert.equal(guest.you, 4, 'наступний гість не отримує чужий pid');
});

test('тихий reconnect хоста через resume=1 працює як раніше', async () => {
  const room = newRoom();
  const host = await connect(room, 'create=1');
  await dropHost(room, host.socket);
  const back = await connect(room, `resume=1&resumeKey=${encodeURIComponent(host.rk)}`);
  assert.equal(back.you, 1);
  assert.equal(back.rk, host.rk);
});
