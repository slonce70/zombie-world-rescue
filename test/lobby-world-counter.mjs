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
const { Lobby, clampSaved, SAVED_PER_PING, SAVED_PER_DAY } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// Мінімальний шим DO storage: get/put/delete(ключ або масив)/list({prefix}).
// Один store переживає кілька Lobby — саме так і перевіряємо перезапуск воркера.
function newStore() { return new Map(); }
function newLobby(store) {
  return new Lobby({
    storage: {
      async get(k) { return store.get(k); },
      async put(k, v) { store.set(k, v); },
      async delete(k) { for (const key of Array.isArray(k) ? k : [k]) store.delete(key); },
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
// вичерпати добову квоту cid: за один пінг більше за SAVED_PER_PING не проходить
async function fillQuota(lobby, now, cid) {
  for (let i = 0; i < Math.ceil(SAVED_PER_DAY / SAVED_PER_PING) + 2; i++) {
    await lobby._recordSaved(now, cid, SAVED_PER_PING);
  }
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
  assert.equal(clampSaved(10, SAVED_PER_DAY - 4), 4, 'залишок добової квоти');
  assert.equal(clampSaved(10, SAVED_PER_DAY), 0, 'квота вичерпана');
  assert.equal(clampSaved(10, SAVED_PER_DAY + 999), 0, 'переповнена квота не дає відʼємного');
});

// ── лічильник у DO ───────────────────────────────────────────────────────────
test('внесок рахується і видно у _view', async () => {
  const lobby = newLobby(newStore());
  await lobby._recordSaved(T0, CID, 3);
  await lobby._recordSaved(T0, 'cid-player-0002', 5);
  assert.equal(lobby._view(T0).worldSaved, 8);
  assert.equal(lobby._view(T0).worldSavedWeek, 8);
});

test('один клієнт не накрутить більше за стелю ні за пінг, ні за добу', async () => {
  const lobby = newLobby(newStore());
  await lobby._recordSaved(T0, CID, 1_000_000);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_PING, 'один пінг обрізано до стелі пінгу');
  await fillQuota(lobby, T0, CID);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY, 'добова квота cid не пробивається');
  // чесний сусід усе ще додає своє — стеля персональна, не глобальна
  await lobby._recordSaved(T0, 'cid-player-0002', 4);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY + 4);
});

test('паралельні пінги одного cid не обходять квоту', async () => {
  const lobby = newLobby(newStore());
  // конвеєр: усі читання storage стартують до першого запису
  const n = Math.ceil(SAVED_PER_DAY / SAVED_PER_PING) + 10;
  await Promise.all(Array.from({ length: n }, () => lobby._recordSaved(T0, CID, SAVED_PER_PING)));
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY, 'гонка read-modify-write не пробиває стелю');
});

test('число переживає перезапуск воркера', async () => {
  const store = newStore();
  const before = newLobby(store);
  await before._recordSaved(T0, CID, 7);
  assert.equal(before._view(T0).worldSaved, 7);

  const after = newLobby(store); // DO прокинувся після гібернації: памʼять порожня
  await after._loadTop3(T0);
  assert.equal(after._view(T0).worldSaved, 7, 'лічильник піднявся зі storage');
  // і квота cid теж пережила перезапуск: 7 до перезапуску входять у ті самі SAVED_PER_DAY
  await fillQuota(after, T0, CID);
  assert.equal(after._view(T0).worldSaved, SAVED_PER_DAY, 'квота рахує й внесок до перезапуску');
});

test('опівночі UTC починається новий відлік, вчорашнє не тече в сьогодні', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  await fillQuota(lobby, T0, CID);
  assert.equal(lobby._view(T0).worldSaved, SAVED_PER_DAY);

  const tomorrow = T0 + DAY_MS;
  await lobby._loadTop3(tomorrow);
  assert.equal(lobby._view(tomorrow).worldSaved, 0, 'нова доба — нуль');
  // вчорашні ключі прибрані, добова квота cid теж почалася заново
  assert.ok(![...store.keys()].some((k) => k.startsWith('sv:2026-08-12:')), 'вчорашні sv:-ключі прибрано');
  assert.ok(![...store.keys()].some((k) => k === 'day:2026-08-12'), 'вчорашня комірка прибрана');
  await lobby._recordSaved(tomorrow, CID, 9);
  assert.equal(lobby._view(tomorrow).worldSaved, 9);
  // тиждень пам'ятає обидві доби
  assert.equal(lobby._view(tomorrow).worldSavedWeek, SAVED_PER_DAY + 9);
});

test('тижневий підсумок тримає рівно 7 останніх діб', async () => {
  const store = newStore();
  const lobby = newLobby(store);
  for (let i = 0; i < 10; i++) {
    const now = T0 + i * DAY_MS;
    await lobby._loadTop3(now);
    await lobby._recordSaved(now, `cid-player-${1000 + i}`, 10);
  }
  assert.equal(lobby._view(T0 + 9 * DAY_MS).worldSavedWeek, 70, 'старші за тиждень доби випали');
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

test('стара комірка day: з голим масивом топ-3 не губиться', async () => {
  const store = newStore();
  const day = new Date(T0).toISOString().slice(0, 10);
  store.set('day:' + day, [{ nick: 'Влад', score: 40 }]); // формат до v780
  const lobby = newLobby(store);
  await lobby._loadTop3(T0);
  assert.deepEqual(lobby._view(T0).top3, [{ nick: 'Влад', score: 40 }]);
  assert.equal(lobby._view(T0).worldSaved, 0);
  await lobby._recordSaved(T0, CID, 5);
  // у комірці доби разом із топ-3 і лічильником світу лежить ще й дошка «дуелі дня»
  assert.deepEqual(store.get('day:' + day), { top3: [{ nick: 'Влад', score: 40 }], saved: 5, duel: [] });
});
