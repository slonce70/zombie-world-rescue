// 🦖 Загублений Острів: фінальний рівень — вулканічний острів динозаврів.
// Відкривається ЛИШЕ після звільнення всіх 10 країн (isCountryOpen у countries.js).
// Свіжий layout (не повтор): центральне село в джунглях, ВУЛКАН на півночі,
// арена ЗОМБІ-ТИРАНОЗАВРА біля його підніжжя. Біом «prehistoric».
import { mesa, dunes, basin } from '../utils.js';

export default {
  bound: 205,
  spawn: { x: 0, z: 176 },
  // острів: пологі джунглеві пагорби; підняте плато під вулканом; лагуна-западина
  terrain: (x, z) =>
    dunes(x, z, 3.0, 64, 0.45)
    + mesa(x, z, 0, -150, 52, 7, 20)     // плато вулкана/арени на півночі
    + basin(x, z, 70, 70, 26, 2.4, 14),  // лагуна на південному сході
  sites: {
    village: { x: 0, z: 12, r: 42 },
    rescue: { x: -102, z: -44, r: 16 },
    tower: { x: 108, z: -70, r: 16 },
    warehouse: { x: -116, z: 62, r: 22 },
    arena: { x: 0, z: -158, r: 32 },
  },
  roads: [
    [[0, 196], [0, 128], [0, 66], [0, 24]],              // південний вʼїзд із пляжу
    [[-10, 0], [-48, -20], [-82, -36], [-100, -42]],     // село → порятунок
    [[10, -4], [52, -30], [88, -56], [106, -68]],        // село → вежа
    [[-8, 14], [-52, 30], [-90, 48], [-112, 58]],        // село → склад
    [[2, -18], [0, -76], [0, -126], [0, -148]],          // село → вулкан/арена
  ],
  hills: [
    { x: 108, z: -70, h: 8, sigma: 40 },
    { x: -70, z: -120, h: 10, sigma: 46 },
    { x: 96, z: 104, h: 7, sigma: 50 },
    { x: -128, z: -16, h: 6, sigma: 38 },
  ],
  flats: [
    { x: 0, z: -150, r: 30 },   // плато під вулканом + арена (чиста геометрія)
    { x: 70, z: 70, r: 22 },    // берег лагуни
  ],
  houses: [
    { x: 16, z: 38, ry: Math.PI / 2, enterable: true, surprise: false },
    { x: -16, z: 32, ry: -Math.PI / 2, enterable: true, surprise: true },
    { x: 22, z: 10, ry: Math.PI / 2, tall: true },
    { x: -22, z: -6, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: -30, z: -26, ry: 0 },
    { x: 32, z: -22, ry: Math.PI, enterable: true, surprise: true },
    { x: -10, z: 82, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: 16, z: 106, ry: Math.PI / 2 },
  ],
  villageExtras: ['well', 'lamps', 'fences'],
  landmarks: ['volcano', 'birds'],
  landmarkParams: {
    volcano: { x: -62, z: -128 },  // димучий вулкан-бекдроп (осторонь дороги й арени)
  },
  fun: {
    barrels: [
      [-110, 56], [-122, 66], [-92, -38], [4, -132], [-20, -150], [36, -24], [6, 120],
    ],
    jumpPads: [
      { x: 13, z: 32, power: 15 },          // на дах хатини
      { x: -122, z: 63, power: 15 },        // склад — на дах
    ],
    soccerBall: { x: 6, z: 22 },
    goldenZombie: true,
    secretLoot: [
      { x: -16, z: 32, dy: 5.4 },           // дах хатини
      { x: -116, z: 62, dy: 5.6 },          // дах складу
    ],
  },
  zombieDensity: 1.7,
  signs: [{ x: 8, z: 166, ry: 0 }],
};
