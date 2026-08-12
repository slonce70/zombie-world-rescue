// 🐣 Гейт «перших п'яти хвилин»: доки не звільнено жодної країни — половина меню схована,
// після першої країни повертається все. Ключова вимога релізу: гейт рахується від ФАКТУ
// звільнення, тож наявний гравець нічого не втрачає. Тест без браузера й без Three.js:
// src/firststeps.js навмисно без імпортів, тож вантажимо його як data-URL (пакет — CJS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const firstStepsSrc = read('src/firststeps.js');
const { isFirstSteps, FIRST_STEPS_HIDDEN } = await import(
  'data:text/javascript;base64,' + Buffer.from(firstStepsSrc).toString('base64'));

// що саме ховається на екрані за поточного сейва
const hiddenNow = (liberated) => (isFirstSteps(liberated) ? FIRST_STEPS_HIDDEN : []);

test('Україна не звільнена → ховаємо всі перелічені розділи', () => {
  assert.equal(isFirstSteps({}), true);
  assert.equal(isFirstSteps(undefined), true);
  assert.equal(isFirstSteps({ UKR: false }), true, 'порожній прапорець — це не звільнення');
  assert.deepEqual(hiddenNow({}), FIRST_STEPS_HIDDEN);
  for (const id of ['btn-pass', 'btn-souls', 'btn-wardrobe', 'btn-album', 'btn-hq', 'btn-league',
    'btn-map-editor', 'btn-moon-globe', 'gift-chip', 'weekly-goal']) {
    assert.ok(FIRST_STEPS_HIDDEN.includes(id), `${id} мусить ховатись до першої країни`);
  }
});

test('Україну звільнено → не ховаємо нічого', () => {
  assert.equal(isFirstSteps({ UKR: true }), false);
  assert.deepEqual(hiddenNow({ UKR: true }), []);
});

test('наявний гравець із будь-яким прогресом бачить усе — гейт не від прапорця в сейві', () => {
  // пів кампанії без запису про Україну (старий/хмарний сейв) — розділи лишаються на місці
  assert.equal(isFirstSteps({ POL: true, DEU: true, FRA: true }), false);
  assert.deepEqual(hiddenNow({ LOST: true }), []);
});

test('дорога до першої місії не ховається', () => {
  for (const id of ['btn-front', 'btn-solo', 'btn-coop', 'globe-compass', 'globe-progress',
    'btn-quests', 'btn-progress', 'btn-settings', 'btn-menu']) {
    assert.ok(!FIRST_STEPS_HIDDEN.includes(id), `${id} веде до першої місії — ховати не можна`);
  }
});

test('кожен схований id реально існує в index.html — жодних посилань у нікуди', () => {
  const html = read('index.html');
  for (const id of FIRST_STEPS_HIDDEN) {
    assert.ok(html.includes(`id="${id}"`), `id="${id}" зник з index.html`);
  }
});

test('глобус справді застосовує список, а перемога справді вітає', () => {
  const main = read('src/main.js');
  assert.ok(main.includes("import { isFirstSteps, FIRST_STEPS_HIDDEN } from './firststeps.js';"),
    'main.js мусить брати гейт із firststeps.js, а не дублювати правило');
  assert.ok(/for \(const id of FIRST_STEPS_HIDDEN\)[\s\S]{0,120}\.hidden = firstSteps;/.test(main),
    '_showGlobeUI мусить ховати/повертати весь список');
  const ends = read('src/ui/endscreens.js');
  assert.ok(/isFirstSteps\(game\.save\.liberated\)/.test(ends), 'перемога рахує стан ДО запису звільнення');
  assert.ok(/hintOnce\('firstSteps'/.test(ends), 'привітання йде разовою підказкою');
  // новий ESM-модуль мусить бути в офлайн-оболонці
  assert.ok(read('sw.js').includes("'./src/firststeps.js'"), 'firststeps.js має бути в SHELL sw.js');
});
