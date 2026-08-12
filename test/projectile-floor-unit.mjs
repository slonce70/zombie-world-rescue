// 💣 Снаряди й підлоги: граната/ракета/ворожий снаряд мусять лягати на дах і поміст,
// а не провалюватись до ландшафту — і при цьому НЕ чіплятися за поверхню над собою.
// Three.js тут не потрібен — беремо справжній `floorAt` прямо з тексту src/world.js
// і перевіряємо формулу висоти, якою користується src/effects.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worldSrc = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
const effectsSrc = readFileSync(new URL('../src/effects.js', import.meta.url), 'utf8');

// витягуємо тіло методу floorAt як є — щоб тест ловив зміну самого методу, а не копію.
// Сигнатура в регексі пришпилює й допуск за замовчуванням: 1.0 — це крок ніг гравця.
const body = worldSrc.match(/\n {2}floorAt\(x, z, y = 1\.5, tol = 1\.0\) \{\n([\s\S]*?)\n {2}\}\n/);
assert.ok(body, 'у src/world.js має бути метод floorAt(x, z, y = 1.5, tol = 1.0)');
const rawFloorAt = new Function('x', 'z', 'y', 'tol', body[1]);
// tol за замовчуванням повторює сигнатуру — так тест бачить обидві поведінки
const floorAt = (floors, x, z, y, tol = 1.0) => rawFloorAt.call({ floors }, x, z, y, tol);

// допуск снарядів беремо з самого src/effects.js, щоб тест ішов за кодом
const tolMatch = effectsSrc.match(/\nconst PROJ_FLOOR_TOL = ([\d.]+);/);
assert.ok(tolMatch, 'у src/effects.js має бути допуск PROJ_FLOOR_TOL');
const PROJ = Number(tolMatch[1]);

// висота, на якій зупиняється снаряд: рівно та сама формула, що в effects.js
const surfaceY = (floors, groundH, x, z, y) => Math.max(groundH, floorAt(floors, x, z, y, PROJ));

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

test('допуск снаряда малий: поверхня над ним не рахується землею', () => {
  assert.ok(PROJ > 0 && PROJ < 0.5, `допуск снаряда ${PROJ} мусить бути значно меншим за крок гравця 1.0`);
  // з висоти 5 дах на 14 недосяжний
  assert.equal(floorAt(tower, 10, 10, 5, PROJ), -Infinity);
  assert.equal(surfaceY(tower, 0, 10, 10, 5), 0, 'знизу лишається тільки ландшафт');
  // за два допуски нижче помосту — ще НЕ ловить (раніше ловило аж за метр)
  assert.equal(floorAt(tower, 10, 10, 14 - PROJ * 2, PROJ), -Infinity);
  // на пів допуску нижче — ловить, інакше швидкий снаряд проскочив би крізь поміст за кадр
  assert.equal(floorAt(tower, 10, 10, 14 - PROJ * 0.5, PROJ), 14);
});

test('ракета під навісом ринку не вибухає в повітрі', () => {
  // навіс ринку: world.js:446 top = gy + 2.9 над ландшафтом gy = 0
  const market = [{ x: 0, z: 0, w: 8, d: 8, ry: 0, top: 2.9, slope: 0 }];
  // ракета летить на висоті 1.9 — рівно метр під навісом, старий допуск 1.0 її детонував
  const rg = surfaceY(market, 0, 0, 0, 1.9);
  assert.equal(rg, 0, 'під навісом рахується ландшафт, а не сам навіс');
  assert.ok(!(1.9 < rg + 0.15), 'ракета не детонує в повітрі під навісом');
});

test('граната під помостом не телепортується на верхній рівень', () => {
  // вкладені помости: world.js:408-409, top = gy + 1.18 і gy + 1.8
  const deck = [
    { x: 0, z: 0, w: 10, d: 10, ry: 0, top: 1.18, slope: 0 },
    { x: 0, z: 0, w: 6, d: 6, ry: 0, top: 1.8, slope: 0 },
  ];
  // граната котиться по землі під помостом
  const gy = surfaceY(deck, 0, 0, 0, 0.13) + 0.13;
  assert.equal(gy, 0.13, 'граната лишається на землі, а не стрибає на 1.31');
});

test('крок ніг гравця лишився 1.0 — сходинки працюють як раніше', () => {
  // без явного допуску (гравець, зомбі, люди, лут) поведінка та сама, що й до правки
  assert.equal(floorAt(tower, 10, 10, 13.1), 14, 'з відстані менше метра гравець ще зіходить на поверхню');
  assert.equal(floorAt(tower, 10, 10, 12.9), -Infinity, 'понад метр — зависоко навіть для гравця');
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
  // гільзи, ворожий снаряд, ракета, граната, м'яч — усі п'ять із малим допуском
  assert.equal((effectsSrc.match(/floorAt\([^)]*PROJ_FLOOR_TOL\)/g) || []).length, 5,
    'кожен снаряд/падаючий обʼєкт мусить передавати PROJ_FLOOR_TOL');
});
