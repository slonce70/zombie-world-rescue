// 🧍🎒 Гаджет «Клон» і Загін ділять один масив this.clones. Активація гаджета мусить
// прибирати лише власних клонів, а врятований напарник (поле squad) — лишатись у бою.
// Three.js тут не потрібен: беремо тіла _spawnClone (до створення клонів) і _removeClone
// прямо з тексту src/extras.js і крутимо їх на макеті рівня.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/extras.js', import.meta.url), 'utf8');

// пролог _spawnClone: пошук місця + очищення масиву, рівно до циклу створення клонів
const prologue = src.match(/\n {2}_spawnClone\(\) \{\n([\s\S]*?)\n {4}const count = /);
assert.ok(prologue, 'у src/extras.js має бути метод _spawnClone()');
const removeBody = src.match(/\n {2}_removeClone\(i, broken\) \{\n([\s\S]*?)\n {2}\}\n/);
assert.ok(removeBody, 'у src/extras.js має бути метод _removeClone(i, broken)');

// вільні змінні тіл: t() і disposeObject() з інших модулів, THREE — для ефекту
globalThis.t = (s) => s;
globalThis.disposeObject = () => {};
globalThis.THREE = { Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } } };

const spawnPrologue = new Function(prologue[1]);
const removeClone = new Function('i', 'broken', removeBody[1]);

const makeGadgets = (clones) => ({
  clones,
  _removeClone: removeClone,
  _placePos: () => ({ x: 0, y: 0, z: 0 }),
  _floorY: () => 0,
  level: {
    scene: { remove: () => {} },
    effects: { burst: () => {} },
    bus: { emit: () => {} },
    player: { yaw: 0 },
    game: { save: {} },
  },
});

const clone = (id) => ({ id, hp: 50, mesh: {}, x: 0, y: 0, z: 0 });
const mate = (id, squad = 'heal') => ({ id, squad, hp: 60, downT: 0, mesh: {}, x: 0, y: 0, z: 0 });

test('активація клона не чіпає врятованих напарників', () => {
  const g = makeGadgets([mate('UKR'), clone('c1'), mate('POL', 'fighter'), clone('c2')]);
  spawnPrologue.call(g);
  assert.deepEqual(g.clones.map((c) => c.id), ['UKR', 'POL'], 'лишаються лише загонівці');
  assert.ok(g.clones.every((c) => c.squad), 'усі, хто лишився, мають прапорець squad');
});

test('старі клони гаджета все одно зникають', () => {
  const g = makeGadgets([clone('c1'), clone('c2')]);
  spawnPrologue.call(g);
  assert.equal(g.clones.length, 0);
});

test('ліміт клонів не залежить від розміру Загону', () => {
  // шість напарників — пролог не має ані впасти, ані перервати спавн
  const g = makeGadgets(['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT'].map((id) => mate(id)));
  assert.equal(spawnPrologue.call(g), undefined, 'раннього return false бути не повинно');
  assert.equal(g.clones.length, 6, 'Загін цілий');
  // кількість нових клонів рахує лише гіперзаряд, а не довжину спільного масиву
  const count = src.match(/\n {4}const count = ([^\n]+)\n/);
  assert.ok(count, 'у _spawnClone має лишитись const count');
  assert.ok(!/clones/.test(count[1]), `ліміт не має дивитись у this.clones: ${count[1]}`);
});

test('збитий напарник лишається в масиві й піднімається через SQUAD_DOWN_SECS', () => {
  const update = src.match(/\n {2}_updateClones\(dt\) \{\n([\s\S]*?)\n {6}const nearest = /);
  assert.ok(update, 'у _updateClones має бути гілка загону перед пошуком цілі');
  assert.match(update[1], /if \(c\.squad\) \{/, 'напарник обробляється окремо від клона');
  assert.match(update[1], /c\.downT = SQUAD_DOWN_SECS;/, 'при нулі HP напарник падає, а не гине');
  assert.match(update[1], /\} else if \(c\.hp <= 0\) \{ this\._removeClone\(i, true\); continue; \}/,
    'назавжди гине лише звичайний клон');
});
