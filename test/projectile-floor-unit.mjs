// 💣 Снаряди й підлоги: граната/ракета/ворожий снаряд мусять лягати на дах і поміст,
// а не провалюватись до ландшафту. Three.js тут не потрібен — беремо справжній `floorAt`
// прямо з тексту src/world.js і перевіряємо формулу висоти, якою користується src/effects.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worldSrc = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
const effectsSrc = readFileSync(new URL('../src/effects.js', import.meta.url), 'utf8');

// витягуємо тіло методу floorAt як є — щоб тест ловив зміну самого методу, а не копію
const body = worldSrc.match(/\n {2}floorAt\(x, z, y = 1\.5\) \{\n([\s\S]*?)\n {2}\}\n/);
assert.ok(body, 'у src/world.js має бути метод floorAt(x, z, y = 1.5)');
const rawFloorAt = new Function('x', 'z', 'y', body[1]);
const floorAt = (floors, x, z, y) => rawFloorAt.call({ floors }, x, z, y);

// висота, на якій зупиняється снаряд: рівно та сама формула, що в effects.js
const surfaceY = (floors, groundH, x, z, y) => Math.max(groundH, floorAt(floors, x, z, y));

// поміст 6×6 на висоті 14 (вершина вежі), центр у (10, 10)
const tower = [{ x: 10, z: 10, w: 6, d: 6, ry: 0, top: 14, slope: 0 }];

test('на відкритій місцевості поведінка не змінюється', () => {
  assert.equal(floorAt([], 0, 0, 5), -Infinity, 'без підлог floorAt дає -Infinity');
  assert.equal(surfaceY([], 3.5, 0, 0, 5), 3.5, 'Math.max з -Infinity лишає той самий groundH');
  // поруч із вежею (поза межами помосту) — теж чистий ландшафт
  assert.equal(surfaceY(tower, 3.5, 20, 20, 15), 3.5);
});

test('граната лягає на поміст вежі, а не провалюється на 14 метрів униз', () => {
  // ландшафт унизу на 0, граната падає на вершину вежі з висоти 14.5
  assert.equal(surfaceY(tower, 0, 10, 10, 14.5) + 0.13, 14.13);
});

test('підлога над головою не ловить снаряд, що летить знизу', () => {
  // гейт top <= y + 1.0 у floorAt: з висоти 5 дах на 14 недосяжний
  assert.equal(floorAt(tower, 10, 10, 5), -Infinity);
  assert.equal(surfaceY(tower, 0, 10, 10, 5), 0, 'знизу лишається тільки ландшафт');
  // майже впритул знизу — гейт ще тримає
  assert.equal(floorAt(tower, 10, 10, 12.9), -Infinity);
  assert.equal(floorAt(tower, 10, 10, 13.1), 14, 'з відстані менше метра поверхня вже ловить');
});

test('усі падаючі об’єкти в effects.js питають floorAt, а не лише groundH', () => {
  const naked = [
    [/mp\.y < this\.world\.groundH\(/, 'ворожий снаряд'],
    [/rp\.y < this\.world\.groundH\(/, 'ракета базуки'],
    [/const gy = this\.world\.groundH\(g\.mesh\.position/, 'граната'],
    [/const sy = this\.world\.groundH\(s\.mesh\.position/, 'гільзи'],
  ];
  for (const [re, who] of naked) {
    assert.ok(!re.test(effectsSrc), `${who}: перевірка висоти мусить брати Math.max(groundH, floorAt)`);
  }
  assert.ok(effectsSrc.match(/floorAt\(/g).length >= 6, 'мають лишитись усі виклики floorAt');
});
