// 🧭 Порядок пріоритетів компаса «що далі». Головна підказка гри мусить вести по
// кампанії, а не у вітрину: 🎯 на товарі в магазині не сміє перебивати наступну країну.
// src/main.js тягне Three.js і браузер, тож беремо ЛИШЕ тіло _nextActionInfo() з
// живого файлу (той самий прийом, що в missionpool-prompt-unit.mjs) і годуємо його
// двійниками залежностей — без рендера й без DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = src.indexOf('  _nextActionInfo() {');
const end = src.indexOf('\n  }\n', start) + 4;
assert.ok(start > 0 && end > start, 'метод _nextActionInfo() знайдено в src/main.js');
const body = src.slice(start, end).replace('_nextActionInfo() {', 'function nextActionInfo() {');

const CAMPAIGN_ORDER = ['UKR', 'POL', 'DEU'];
const COUNTRIES = {
  UKR: { flag: '🇺🇦', name: 'Україна' },
  POL: { flag: '🇵🇱', name: 'Польща' },
  DEU: { flag: '🇩🇪', name: 'Німеччина' },
};
// двійник t(): переклад не цікавить, але підстановку {f}/{n} робимо як справжній i18n
const t = (s, params) => (params
  ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m))
  : s);
const SOLO_MODES = [];

// goalInfo повертає незавершену ціль магазину — саме вона раніше стояла першою.
// far — накопичено 30% ціни, near — 90%: правило «майже зібрано» пускає вперед лише near.
const shopGoal = { done: false, need: 1000, have: 300, remaining: 700, item: { icon: '🔫', name: 'Автомат' } };
const shopGoalNear = { done: false, need: 1000, have: 900, remaining: 100, item: { icon: '🔫', name: 'Автомат' } };
// 🐣 гейт «перших п'яти хвилин» — той самий, що в src/firststeps.js
const isFirstSteps = (liberated) => !Object.values(liberated || {}).some(Boolean);
const build = (goal) => new Function(
  'goalInfo', 't', 'seasonState', 'CAMPAIGN_ORDER', 'COUNTRIES', 'SOLO_MODES', 'isFirstSteps',
  `${body}\nreturn nextActionInfo;`,
)(() => goal, t, () => ({ claimable: 0, next: null, index: 0 }), CAMPAIGN_ORDER, COUNTRIES, SOLO_MODES, isFirstSteps);

const fakeGame = (liberated) => ({
  save: { liberated, infected: { done: true }, weekly: {} },
  quests: { list: [] },
  _weekIndex: () => 1000,
  weeklyChallengeId: () => '__none',
  dailyChallengeId: () => '__none',
});

test('крок кампанії стоїть вище за ціль магазину', () => {
  const info = build(shopGoal).call(fakeGame({}));
  assert.equal(info.icon, '🧭', `компас повів не в кампанію: ${JSON.stringify(info)}`);
  assert.equal(info.title, 'Далі');
  assert.ok(info.text.includes('Україна'), 'кличе у першу незвільнену країну');
});

test('ціль магазину лишається підказкою — але вже після кампанії', () => {
  const lib = { UKR: true, POL: true, DEU: true, LOST: true, LAB: true };
  const info = build(shopGoal).call(fakeGame(lib));
  assert.equal(info.title, 'Ціль магазину', `ціль магазину зникла: ${JSON.stringify(info)}`);
});

test('без цілі магазину кампанія веде так само', () => {
  const info = build(null).call(fakeGame({ UKR: true }));
  assert.equal(info.icon, '🧭');
  assert.ok(info.text.includes('Польща'), 'наступна незвільнена — Польща');
});

// v760: до першої звільненої країни компас веде РІВНО в Україну (розділи ще сховані),
// тож «майже зібрану ціль» перевіряємо з другої країни — саме там правило й працює.
test('майже зібрана ціль магазину не мовчить до кінця кампанії', () => {
  const info = build(shopGoalNear).call(fakeGame({ UKR: true }));
  assert.equal(info.title, 'Ціль магазину', `майже зібрана ціль не спливла: ${JSON.stringify(info)}`);
  assert.ok(info.text.includes('100'), 'показує, скільки лишилось докопити');
});

test('рівно на межі 80% ціль уже підказують, нижче — ні', () => {
  const at80 = { done: false, need: 1000, have: 800, remaining: 200, item: { icon: '🔫', name: 'Автомат' } };
  const below = { done: false, need: 1000, have: 799, remaining: 201, item: { icon: '🔫', name: 'Автомат' } };
  assert.equal(build(at80).call(fakeGame({ UKR: true })).title, 'Ціль магазину');
  assert.equal(build(below).call(fakeGame({ UKR: true })).icon, '🧭', 'далека ціль кампанію не перебиває');
});

test('перші п\'ять хвилин: до першої країни компас показує рівно одну ціль', () => {
  const info = build(shopGoalNear).call(fakeGame({}));
  assert.equal(info.icon, '🧭', `новачка повели не в Україну: ${JSON.stringify(info)}`);
  assert.ok(info.text.includes('Україна'), 'ціль одна — перша країна кампанії');
});
