// 🤝 Дошка дуелі дня: КОМУ належить запис. Чистий доменний юніт воркера — сюди не
// заходить жоден клієнтський модуль, тож тест не залежить від src/ і біжить за мілісекунди.
// Правила дошки живуть у mergeDuel (worker/relay-worker.js); нік чистить worker/nick.mjs.
// node --test test/duel-owner-unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanNickSrv } from '../worker/nick.mjs';

const workerDir = new URL('../worker/', import.meta.url);
const workerSrc = readFileSync(new URL('relay-worker.js', workerDir), 'utf8')
  .replace(/ from '\.\//g, ` from '${workerDir}`);
const { mergeDuel, DUEL_BOARD_MAX, DUEL_MS_MAX, DUEL_PER_IP } =
  await import('data:text/javascript;base64,' + Buffer.from(workerSrc).toString('base64'));

// Власник запису — cid і мережа ТОГО САМОГО пінга; за замовчуванням «дитина з дому»
const merge = (board, raw, cid = 'cid-vlad-0001', ip = '203.0.113.7') =>
  mergeDuel(board, raw, cleanNickSrv, { cid, ip });

test('сміттєва спроба дошку не чіпає', () => {
  const board = [];
  assert.equal(merge(board, {}), board, 'без режиму — той самий масив');
  assert.equal(merge(board, { nick: 'Влад', mode: '<script>' }), board, 'вигаданий режим відкидається');
  assert.equal(merge(board, { nick: 'Влад' }), board, 'без режиму нічого не пишемо');
  assert.equal(mergeDuel(board, { nick: 'Влад', mode: 'bank', won: true }, cleanNickSrv, null), board,
    'пінг без cid власника — записувати нікому');
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

test('один запис на пару «cid + режим», і це КРАЩА спроба дня', () => {
  let b = merge([], { nick: 'Влад', mode: 'bank', ms: 90_000, won: true });
  b = merge(b, { nick: 'Влад', mode: 'bank', ms: 120_000, won: true });
  assert.equal(b.length, 1, 'другий забіг не додає рядок');
  assert.equal(b[0].ms, 90_000, 'слабший пізніший забіг не затирає ранковий результат');
  b = merge(b, { nick: 'Влад', mode: 'bank', ms: 60_000, won: true });
  assert.equal(b[0].ms, 60_000, 'швидший забіг оновлює');
  // інший режим того самого гравця — окремий рядок (біля півночі UTC у комірці два режими)
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
  // кожен гравець — свій cid і своя мережа (стеля на мережу перевіряється окремо)
  for (let i = 0; i < DUEL_BOARD_MAX + 5; i++) {
    b = merge(b, { nick: 'Гравець' + i, mode: 'bank', ms: (i + 1) * 1000, won: true }, 'cid-' + i, 'ip-' + i);
  }
  assert.equal(b.length, DUEL_BOARD_MAX);
  assert.equal(b[0].ms, 1000, 'найшвидший угорі');
  const withLoss = merge([
    { nick: 'А', m: 'bank', ms: 0, w: false, c: 'cid-a', ip: 'ip-a' },
  ], { nick: 'Б', mode: 'bank', ms: 5000, won: true });
  assert.equal(withLoss[0].nick, 'Б', 'той, хто пройшов, вище за того, хто спробував');
});

// ---------- власник запису ----------

test('запис належить cid, а не ніку', () => {
  const b = merge([], { nick: 'Влад', mode: 'bank', ms: 60_000, won: true });
  // чужий пристрій виписує результат ПІД НІКОМ Влада: свій рядок — так, підміна — ні
  const b2 = merge(b, { nick: 'Влад', mode: 'bank', ms: 1, won: true }, 'cid-fake-0001', '198.51.100.9');
  assert.equal(b2.length, 2, 'чужий нік не дає влізти в чужий рядок');
  assert.ok(b2.some((e) => e.c === 'cid-vlad-0001' && e.ms === 60_000), 'результат Влада на місці');
  // а свій рядок оновлюється навіть після зміни ніка (нік — лише підпис)
  const b3 = merge(b, { nick: 'Владислав', mode: 'bank', ms: 30_000, won: true });
  assert.equal(b3.length, 1);
  assert.equal(b3[0].ms, 30_000);
  assert.equal(b3[0].nick, 'Владислав');
});

test('двоє дітей без ніка — два рядки, а не один', () => {
  // соліст ніка не має за конструкцією, тож обидва шлють «Гравець»
  let b = merge([], { nick: 'Гравець', mode: 'bank', ms: 65_000, won: true }, 'cid-solo-0001');
  b = merge(b, { nick: 'Гравець', mode: 'bank', ms: 90_000, won: true }, 'cid-solo-0002');
  assert.equal(b.length, 2, 'різні cid — різні гравці, навіть з однаковим ніком');
});

test('одна мережа не забиває дошку і не витісняє справжніх', () => {
  let b = [];
  // сценарій рев'ю: 16 пінгів won:true, ms:1..16 — кожен зі свіжим cid, усі з одного браузера
  for (let i = 1; i <= DUEL_BOARD_MAX; i++) {
    b = merge(b, { nick: 'Фейк' + i, mode: 'bank', ms: i, won: true }, 'cid-fake-000' + i, '198.51.100.9');
  }
  assert.equal(b.length, DUEL_PER_IP, 'одна мережа тримає лише свої DUEL_PER_IP місць');
  // справжня дитина з іншої мережі все ще потрапляє на дошку, хай і повільніша
  b = merge(b, { nick: 'Влад', mode: 'bank', ms: 120_000, won: true });
  assert.ok(b.some((e) => e.nick === 'Влад'), 'справжню дитину фейки не витіснили');
  // а брат і сестра за тим самим роутером — теж (у межах DUEL_PER_IP)
  for (let i = 0; i < DUEL_PER_IP - 1; i++) {
    b = merge(b, { nick: 'Брат' + i, mode: 'bank', ms: 100_000, won: true }, 'cid-brat-000' + i);
  }
  assert.equal(b.filter((e) => e.nick.startsWith('Брат')).length, DUEL_PER_IP - 1,
    'кілька дітей за одним роутером на дошку потрапляють');
});

test('нік для дошки чиститься від кутових дужок ще на сервері', () => {
  // дошка малюється через innerHTML, і esc() там один-єдиний — сервер не має покладатись
  // на нього, як не покладається cleanTitleSrv
  assert.equal(cleanNickSrv('<img src=x>Влад'), 'Влад');
  assert.equal(cleanNickSrv('Влад<b>'), 'Влад');
  assert.equal(cleanNickSrv('5<3'), '53');
  assert.equal(cleanNickSrv('<script>'), 'Гравець', 'самі теги — ніка не лишилось');
  assert.equal(cleanNickSrv('Влад'), 'Влад', 'нормальний нік не постраждав');
  assert.equal(cleanNickSrv('  Влад   Другий  '), 'Влад Другий', 'нормалізація пробілів на місці');
  const [row] = merge([], { nick: '<b>Оля</b>', mode: 'bank', ms: 1000, won: true });
  assert.equal(row.nick, 'Оля', 'на дошку кутові дужки не потрапляють');
});
