// 🤝 Дуель дня: детермінованість вибору дня і дошка результатів.
// Без браузера — модулі вантажимо з підміненими імпортами (як world-saved-unit.mjs
// і lobby-world-counter.mjs), бо під Node .js у цьому пакеті — CJS.
// node --test test/duel-day-unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanNickSrv } from '../worker/nick.mjs';
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
  .replace("from './coop.js'", `from '${stub('export const loadNick = () => "Влад"; export const cleanNick = (s) => String(s || "");')}'`)
  .replace("from '../i18n.js'", `from '${T}'`)
  .replace("from '../titles.js'", `from '${stub('export const syncTitles = () => {}; export const titleName = () => "";')}'`);
const { duelRows, duelTime } = await import(asData(lobbySrc));

const workerDir = new URL('../worker/', import.meta.url);
const workerSrc = readFileSync(new URL('relay-worker.js', workerDir), 'utf8')
  .replace(/ from '\.\//g, ` from '${workerDir}`);
const { mergeDuel, DUEL_BOARD_MAX, DUEL_MS_MAX, DUEL_MODES } =
  await import(asData(workerSrc));

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

const merge = (board, raw) => mergeDuel(board, raw, cleanNickSrv);

test('білий список режимів воркера не розійшовся з пулом дня', () => {
  assert.deepEqual([...DUEL_MODES].sort(), [...DAILY_CHALLENGE_POOL].sort(),
    'DUEL_MODES у relay-worker.js — дзеркало DAILY_CHALLENGE_POOL у src/modes.js');
});

test('сміттєва спроба дошку не чіпає', () => {
  const board = [];
  assert.equal(merge(board, {}), board, 'без режиму — той самий масив');
  assert.equal(merge(board, { nick: 'Влад', mode: '<script>' }), board, 'вигаданий режим відкидається');
  assert.equal(merge(board, { nick: 'Влад' }), board, 'без режиму нічого не пишемо');
});

test('час клампиться, режим чиститься до [a-z-]', () => {
  const [row] = merge([], { nick: 'Влад', mode: 'ZONE-defense!!', ms: 9e9, won: true });
  assert.equal(row.m, 'zone-defense');
  assert.equal(row.ms, DUEL_MS_MAX, 'година — стеля часу');
  const [neg] = merge([], { nick: 'Влад', mode: 'bank', ms: -5, won: true });
  assert.equal(neg.ms, 0, 'відʼємний час → 0');
  const [nan] = merge([], { nick: 'Влад', mode: 'bank', ms: 'abc', won: true });
  assert.equal(nan.ms, 0, 'нечисло → 0');
});

test('один запис на пару «нік + режим», і це КРАЩА спроба дня', () => {
  let b = merge([], { nick: 'Влад', mode: 'bank', ms: 90_000, won: true });
  b = merge(b, { nick: 'Влад', mode: 'bank', ms: 120_000, won: true });
  assert.equal(b.length, 1, 'другий забіг не додає рядок');
  assert.equal(b[0].ms, 90_000, 'слабший пізніший забіг не затирає ранковий результат');
  b = merge(b, { nick: 'Влад', mode: 'bank', ms: 60_000, won: true });
  assert.equal(b[0].ms, 60_000, 'швидший забіг оновлює');
  // інший режим того самого ніка — окремий рядок (біля півночі UTC у комірці два режими)
  b = merge(b, { nick: 'Влад', mode: 'maze', ms: 30_000, won: true });
  assert.equal(b.length, 2);
});

test('програш не карається: спроба лишається на дошці, але перемога її замінює', () => {
  let b = merge([], { nick: 'Влад', mode: 'bank', ms: 0, won: false });
  assert.equal(b.length, 1, 'той, хто не пройшов, теж видно — друг має бачити, що ти грав');
  assert.equal(b[0].w, false);
  b = merge(b, { nick: 'Влад', mode: 'bank', ms: 70_000, won: true });
  assert.equal(b[0].w, true, 'пройдений забіг б\'є непройдений');
  b = merge(b, { nick: 'Влад', mode: 'bank', ms: 0, won: false });
  assert.equal(b[0].w, true, 'наступний програш не забирає вже здобутий результат');
});

test('дошка має стелю і сортована: пройшли (швидші вгорі), потім спробували', () => {
  let b = [];
  for (let i = 0; i < DUEL_BOARD_MAX + 5; i++) b = merge(b, { nick: 'Гравець' + i, mode: 'bank', ms: (i + 1) * 1000, won: true });
  assert.equal(b.length, DUEL_BOARD_MAX);
  assert.equal(b[0].ms, 1000, 'найшвидший угорі');
  const withLoss = merge([
    { nick: 'А', m: 'bank', ms: 0, w: false },
  ], { nick: 'Б', mode: 'bank', ms: 5000, won: true });
  assert.equal(withLoss[0].nick, 'Б', 'той, хто пройшов, вище за того, хто спробував');
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

test('результат словами — без принизливих формулювань', () => {
  assert.equal(duelTime(83_000, true), '1:23');
  assert.equal(duelTime(0, true), 'пройшов', 'режим без виміру часу (оборона в зоні)');
  assert.equal(duelTime(0, false), 'спробував', 'не «програв» — це гра для дітей, а не рейтинг');
  assert.equal(duelTime(99_000, false), 'спробував', 'час програного забігу нікого не соромить');
});
