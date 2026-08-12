// Підказки місій кампанії не сміють запікати клавішу «E» на момент імпорту:
// interactKey() читає живий input.touchMode, тож на планшеті має бути ✋.
// Беремо справжні ACT_CFG/FETCH_CFG із src/missionpool.js (вони не експортовані,
// тому вирізаємо блок конфігів) і справжній i18n.js — без Three.js і браузера.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.location = { search: '' };
if (!globalThis.navigator) globalThis.navigator = { language: 'uk' };
globalThis.window = globalThis;

const src = readFileSync(new URL('../src/missionpool.js', import.meta.url), 'utf8');
const start = src.indexOf('const ACT_CFG = {');
const end = src.indexOf('\n};', src.indexOf('const FETCH_CFG = {')) + 3;
assert.ok(start > 0 && end > start, 'блок ACT_CFG/FETCH_CFG знайдено в src/missionpool.js');

// справжній i18n.js, лише без словників перекладу: тест іде українською
const i18nSrc = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8')
  .replace("import { EN } from './i18n/en.js';", 'const EN = {};')
  .replace("import { RU } from './i18n/ru.js';", 'const RU = {};');
const asModule = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const i18n = asModule(i18nSrc);
const mod = await import(asModule(
  `import { t, interactKey } from '${i18n}';\n${src.slice(start, end)}\nexport { ACT_CFG, FETCH_CFG };`,
));

// на момент імпорту гри ще немає — саме тут стара версія запікала «E»
const prompts = () => [
  ...Object.values(mod.ACT_CFG).map((c) => c.prompt),
  ...Object.values(mod.FETCH_CFG).flatMap((c) => [c.prompt, c.deliverPrompt]),
];

test('на тачі підказки місій називають екранну кнопку, а не клавішу', () => {
  globalThis.__game = { input: { touchMode: true } };
  const list = prompts();
  assert.equal(list.length, 10);
  for (const p of list) {
    assert.ok(p.includes('✋'), `тач-підказка без кнопки: ${p}`);
    assert.ok(!/\bE\b/.test(p), `тач-підказка друкує клавішу: ${p}`);
  }
});

test('на десктопі підказки лишились із клавішею E', () => {
  globalThis.__game = { input: { touchMode: false } };
  for (const p of prompts()) {
    assert.ok(/\bE\b/.test(p), `десктопна підказка без клавіші: ${p}`);
  }
  assert.equal(mod.ACT_CFG.lights.prompt, 'Тримай E — засвіти ліхтар');
  assert.equal(mod.FETCH_CFG.tomb.deliverPrompt, 'Тримай E — відкрий гробницю');
});
