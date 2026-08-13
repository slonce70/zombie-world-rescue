// 🤝 Дуель дня: детермінованість вибору дня і дошка результатів.
// Без браузера — модулі вантажимо з підміненими імпортами (як world-saved-unit.mjs
// і lobby-world-counter.mjs), бо під Node .js у цьому пакеті — CJS.
// node --test test/duel-day-unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeMapSize, sanitizeMapStyle } from '../worker/community-schema.mjs';

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const stub = (code) => asData(code);
const T = stub('export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);');

const modesSrc = readFileSync(new URL('../src/modes.js', import.meta.url), 'utf8')
  .replace("from './i18n.js'", `from '${T}'`)
  .replace("from './countries.js'", `from '${stub('export const CAMPAIGN_ORDER = [];')}'`)
  .replace("from './net/cloudsave.js'", `from '${stub('export const hasLiberated = () => false;')}'`)
  .replace("from './chapter.js'", `from '${stub('export const CHAPTER2_UNLOCK_COUNTRIES = 3;')}'`)
  .replace("from './knockout.js'", `from '${stub('export const OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES = 3;')}'`)
  .replace("from './defense.js'", `from '${stub('export const OVERLOADED_DEFENSE_UNLOCK_COUNTRIES = 3;')}'`)
  .replace("from './pvp.js'", `from '${stub('export const OVERLOADED_PVP_UNLOCK_COUNTRIES = 3;')}'`)
  .replace("from './humans.js'", `from '${stub('export const OVERLOADED_HUMANS_UNLOCK_COUNTRIES = 3;')}'`);
const { DAILY_CHALLENGE_POOL, DUEL_MAP, dailyChallengeFor, MODE_START_OPTS } = await import(asData(modesSrc));

const lobbySrc = readFileSync(new URL('../src/net/lobby.js', import.meta.url), 'utf8')
  .replace("from './transport.js'", `from '${stub("export const apiBase = () => 'https://relay.test';")}'`)
  .replace("from './league.js'", `from '${stub('export const ensureCid = () => "cid-1";')}'`)
  .replace("from './cloudsave.js'", `from '${stub('export const liberatedCount = () => 0;')}'`)
  .replace("from './coop.js'", `from '${stub('let n = "Влад"; export const loadNick = () => n; export const saveNick = (v) => { n = v; }; export const cleanNick = (s) => String(s || "");')}'`)
  .replace("from '../i18n.js'", `from '${T}'`)
  .replace("from '../titles.js'", `from '${stub('export const syncTitles = () => {}; export const titleName = () => "";')}'`);
const { duelRows, duelTime } = await import(asData(lobbySrc));

const workerDir = new URL('../worker/', import.meta.url);
const workerSrc = readFileSync(new URL('relay-worker.js', workerDir), 'utf8')
  .replace(/ from '\.\//g, ` from '${workerDir}`);
const { DUEL_MODES } = await import(asData(workerSrc));

// ---------- сід дня: те, на чому стоїть чесність дуелі ----------

test('режим дня — чиста функція від дати: той самий день дає той самий режим', () => {
  for (const day of [0, 1, 733_204, 999_999]) {
    assert.equal(dailyChallengeFor(day), dailyChallengeFor(day), 'двічі поспіль — одне й те саме');
    assert.ok(DAILY_CHALLENGE_POOL.includes(dailyChallengeFor(day)), 'режим із пулу');
  }
  // повний оберт пулу: наступний день дає НАСТУПНИЙ режим, через len — той самий
  const d = 733_204;
  assert.notEqual(dailyChallengeFor(d), dailyChallengeFor(d + 1), 'сусідні дні різні');
  assert.equal(dailyChallengeFor(d), dailyChallengeFor(d + DAILY_CHALLENGE_POOL.length), 'пул циклиться');
});

test('індекс дня не ламається на сміттєвому вводі', () => {
  assert.ok(DAILY_CHALLENGE_POOL.includes(dailyChallengeFor(-1)), 'відʼємний індекс не дає undefined');
  assert.ok(DAILY_CHALLENGE_POOL.includes(dailyChallengeFor(0)));
});

test('карта дуелі фіксована й валідна — не з налаштувань гравця', () => {
  assert.equal(sanitizeMapSize(DUEL_MAP.mapSize), DUEL_MAP.mapSize, 'розмір карти валідний');
  assert.equal(sanitizeMapStyle(DUEL_MAP.mapStyle), DUEL_MAP.mapStyle, 'стиль карти валідний');
  // Саме ці два поля startLevel бере з opts ПЕРЕД сейвом, тож пін мусить їх перекривати
  assert.deepEqual(Object.keys(DUEL_MAP).sort(), ['mapSize', 'mapStyle']);
});

test('увесь пул дня стартує кімнатним режимом без арґументів (тобто завжди UKR)', () => {
  for (const id of DAILY_CHALLENGE_POOL) {
    const make = MODE_START_OPTS[id];
    assert.equal(typeof make, 'function', `${id} має старт-опції`);
    // опції режиму не залежать від жодного стану гравця — двічі поспіль однакові
    assert.deepEqual(make(), make(), `${id}: опції старту детерміновані`);
  }
});

// ---------- дошка результатів у воркері ----------
// Самі правила дошки (кому належить запис, стеля на мережу, клампи) живуть у
// test/duel-owner-unit.mjs — там воркер без жодного клієнтського імпорту. Тут лишається
// єдина перевірка, якій потрібні ОБИДВА боки: щоб списки режимів не розійшлись.

test('білий список режимів воркера не розійшовся з пулом дня', () => {
  assert.deepEqual([...DUEL_MODES].sort(), [...DAILY_CHALLENGE_POOL].sort(),
    'DUEL_MODES у relay-worker.js — дзеркало DAILY_CHALLENGE_POOL у src/modes.js');
});

// ---------- дошка на боці клієнта ----------

test('дошка показує ЛИШЕ режим свого дня (доба воркера — UTC, режим — локальний)', () => {
  const d = {
    duel: [
      { nick: 'Влад', m: 'bank', ms: 60_000, w: true },
      { nick: 'Тарас', m: 'maze', ms: 10_000, w: true },
      { nick: 'Оля', m: 'bank', ms: 30_000, w: true },
      { nick: '', m: 'bank', ms: 1, w: true },
    ],
  };
  const rows = duelRows(d, 'bank');
  assert.deepEqual(rows.map((r) => r.nick), ['Оля', 'Влад'], 'чужий режим і порожній нік відсіяні, швидший угорі');
  assert.deepEqual(duelRows(null, 'bank'), [], 'без інтернету — порожньо, без падіння');
  assert.deepEqual(duelRows({ duel: 'нісенітниця' }, 'bank'), []);
});

test('той, хто пройшов, стоїть вище за того, хто спробував', () => {
  const d = { duel: [{ nick: 'А', m: 'bank', ms: 0, w: false }, { nick: 'Б', m: 'bank', ms: 99_000, w: true }] };
  assert.deepEqual(duelRows(d, 'bank').map((r) => r.nick), ['Б', 'А']);
});

test('«мій рядок» — це прапорець me від сервера, а не збіг ніка', () => {
  // двоє друзів назвались однаково: за ніком дитину підсвітило б ЧУЖИМ часом,
  // а тост «ти — так, друг — так» порівняв би її з нею ж
  const d = { duel: [
    { nick: 'Соломія', m: 'bank', ms: 40_000, w: true },
    { nick: 'Соломія', m: 'bank', ms: 90_000, w: true, me: true },
  ] };
  const rows = duelRows(d, 'bank');
  assert.deepEqual(rows.map((r) => !!r.me), [false, true], 'прапорець їде наскрізь і не міняє порядку');
  assert.equal(rows.find((e) => !e.me).ms, 40_000, 'тост бере рядок ДРУГА, а не свій-однойменний');
  // GET /lobby/state прапорця не має взагалі — тоді «свого» рядка просто немає
  const plain = duelRows({ duel: [{ nick: 'Соломія', m: 'bank', ms: 40_000, w: true }] }, 'bank');
  assert.equal(plain.some((e) => e.me), false, 'без cid сервер нічого не позначає — і клієнт не вгадує');
});

test('результат словами — без принизливих формулювань і БЕЗ роду', () => {
  assert.equal(duelTime(83_000, true), '1:23');
  // рядок дошки читається «Соломія — пройдено», а не «Соломія — пройшов»:
  // чіпляти чоловічий рід до чужого імені не можна
  assert.equal(duelTime(0, true), 'пройдено', 'режим без виміру часу (оборона в зоні)');
  assert.equal(duelTime(0, false), 'спроба', 'не «програв» — це гра для дітей, а не рейтинг');
  assert.equal(duelTime(99_000, false), 'спроба', 'час програного забігу нікого не соромить');
  for (const s of [duelTime(0, true), duelTime(0, false)]) {
    assert.ok(!/(ла|в)$/.test(s), `«${s}» має рід — на дошці стоять і дівчата, і хлопці`);
  }
});
