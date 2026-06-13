// Карта Німеччини: місто Золоте — золота осінь, міська брама, автобан із покинутими
// машинами (на дахи можна вилазити!), пивний садок із брецлями
import { ridge } from '../utils.js';

export default {
  bound: 200,
  spawn: { x: 0, z: 170 },
  // 🏔️ долина Рейну: через карту тече річка з бродами, на сході — лісистий кряж
  terrain: (x, z) =>
    ridge(x, z, 188, -150, 188, 130, 12, 36)
    + ridge(x, z, -188, -188, -120, -130, 10, 30),
  // 🌊 річка: дороги до хліва й вежі переходять її бродами
  rivers: [{ pts: [[-185, -34], [-90, -42], [60, -38], [185, -50]], width: 13, level: -1.0, depth: 1.4 }],
  sites: {
    village: { x: 0, z: 0, r: 42 },
    rescue: { x: -95, z: -60, r: 16 },
    tower: { x: 115, z: -85, r: 16 },
    warehouse: { x: 115, z: 65, r: 22 },
    arena: { x: -25, z: -160, r: 30 },
  },
  roads: [
    [[0, 190], [0, 130], [0, 64], [0, 14]],              // південний в'їзд через браму
    [[-10, -2], [-48, -24], [-80, -46], [-93, -56]],     // місто → порятунок
    [[10, -6], [55, -36], [90, -64], [112, -82]],        // місто → вежа
    [[8, 8], [50, 30], [88, 50], [112, 62]],             // місто → склад
    [[-4, -14], [-12, -70], [-20, -124], [-24, -148]],   // місто → арена
    [[-150, 110], [-60, 110], [40, 110], [150, 110]],    // 🛣 АВТОБАН
  ],
  hills: [
    { x: 115, z: -85, h: 8, sigma: 40 },   // пагорб радіовежі
    { x: -90, z: 100, h: 6, sigma: 30 },   // оглядовий пагорб біля автобану
  ],
  flats: [
    { x: 35, z: -14, r: 14 },   // пивний садок
    { x: 0, z: 64, r: 10 },     // площа перед брамою
  ],
  houses: [
    { x: 18, z: 36, ry: Math.PI / 2, enterable: true, surprise: false },
    { x: -16, z: 28, ry: -Math.PI / 2, enterable: true, surprise: true },
    { x: 16, z: 6, ry: Math.PI / 2, tall: true },
    { x: -18, z: -10, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: -32, z: -28, ry: 0, tall: true },
    { x: 28, z: -24, ry: Math.PI, enterable: true, surprise: true },
    { x: -14, z: 76, ry: -Math.PI / 2 },
    { x: 18, z: 98, ry: Math.PI / 2, enterable: true, surprise: false },
    { x: 56, z: 10, ry: 0 },
    { x: -54, z: 30, ry: 0 },
  ],
  villageExtras: ['well', 'lamps', 'fences'],
  landmarks: ['cityGate', 'autobahn', 'beerGarden', 'chimneySmoke', 'birds'],
  landmarkParams: {
    cityGate: { x: 0, z: 64 },
    autobahn: { z: 110, from: -150, to: 150 },
    beerGarden: { x: 35, z: -14, r: 12 },
  },
  fun: {
    barrels: [
      [110, 58], [122, 72], [-88, -52], [-18, -148], [-34, -152], [42, -30], [8, 118],
    ],
    jumpPads: [
      { x: 14.7, z: 32, power: 15 },     // на дах будинку
      { x: 0, z: 67.6, power: 20 },      // на верх брами!
      { x: 109, z: 70, power: 15 },      // склад — на дах ангара
    ],
    soccerBall: { x: 4, z: 16 },
    animals: 'chickens',
    goldenZombie: true,
    secretLoot: [
      { x: 0, z: 64, dy: 8.7 },          // верх міської брами
      { x: 115, z: 65, dy: 5.6 },        // дах складу
    ],
  },
  zombieDensity: 1.4,
  signs: [{ x: 10, z: 160, ry: 0 }],
};
