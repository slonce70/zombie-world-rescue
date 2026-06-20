// Карта Іспанії: сонячне село Соль — теракотові будинки, площа з фонтаном,
// велика АРЕНА-КОРИДА (bullring) серед пагорбів, оливкові гаї, спекотне сонце
// і МАТАДОР-ЗОМБІ верхи на зомбі-бику на арені!
import { ridge, mesa, terraces } from '../utils.js';

export default {
  bound: 200,
  spawn: { x: 0, z: 168 },
  // 🏔️ сухі іспанські пагорби: м'які кряжі на заході й сході, тераси оливкового
  // гаю сходинками, рівне плато під ареною кориди (повний плаский core під трибунами)
  terrain: (x, z) =>
    ridge(x, z, -188, -40, -120, -188, 9, 38)
    + ridge(x, z, 120, -188, 188, -20, 8, 34)
    + terraces(x, z, -68, 30, 40, 8, 2.2)
    + mesa(x, z, 16, -158, 36, 4, 14),
  sites: {
    village: { x: 0, z: 4, r: 40 },
    rescue: { x: -92, z: -58, r: 16 },
    tower: { x: 118, z: -86, r: 16 },
    warehouse: { x: -110, z: 60, r: 22 },
    arena: { x: 16, z: -158, r: 34 },
  },
  roads: [
    [[0, 188], [0, 124], [2, 62], [0, 18]],              // південний в'їзд
    [[-10, -4], [-46, -24], [-78, -46], [-90, -54]],     // село → порятунок
    [[10, -8], [56, -38], [92, -66], [115, -83]],        // село → вежа
    [[-8, 10], [-48, 28], [-84, 46], [-106, 56]],        // село → склад
    [[4, -16], [10, -72], [14, -126], [16, -146]],       // село → арена-корида
  ],
  hills: [
    { x: 118, z: -86, h: 8, sigma: 40 },   // пагорб вежі
    { x: -74, z: -116, h: 7, sigma: 34 },  // мальовничий пагорб
    { x: 92, z: 96, h: 6, sigma: 46 },     // пагорб на сході
  ],
  flats: [
    { x: 16, z: -158, r: 32 },  // плато арени-кориди: повний плаский core під трибунами
    { x: -68, z: 30, r: 18 },   // оливковий гай
    { x: 0, z: 24, r: 12 },     // площа з фонтаном
  ],
  houses: [
    { x: 16, z: 34, ry: Math.PI / 2, enterable: true, surprise: false },
    { x: -16, z: 30, ry: -Math.PI / 2, tall: true, enterable: true, surprise: true },
    { x: 18, z: 8, ry: Math.PI / 2, tall: true },
    { x: -18, z: -8, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: -30, z: -26, ry: 0 },
    { x: 30, z: -22, ry: Math.PI, enterable: true, surprise: true },
    { x: -10, z: 76, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: 16, z: 100, ry: Math.PI / 2 },
    { x: -50, z: 36, ry: 0 },
  ],
  villageExtras: ['well', 'lamps', 'fences'],
  landmarks: ['bullring', 'plazaFountain', 'oliveGrove', 'cathedral', 'birds'],
  landmarkParams: {
    bullring: { x: 16, z: -158 },
    plazaFountain: { x: 0, z: 24 },
    oliveGrove: { x: -68, z: 30, w: 40, d: 30 },
    cathedral: { x: 58, z: -30 },
  },
  fun: {
    barrels: [
      [-104, 54], [-118, 66], [-86, -50], [10, -136], [26, -150], [36, -26], [6, 114],
    ],
    jumpPads: [
      { x: 13, z: 30, power: 15 },        // на дах будинку
      { x: 58, z: -22, power: 20 },       // собор — на дзвіницю
      { x: -116, z: 65, power: 15 },      // склад — на дах
    ],
    soccerBall: { x: 4, z: 18 },
    animals: 'hares',
    goldenZombie: true,
    secretLoot: [
      { x: -16, z: 30, dy: 5.4 },         // дах кам'яниці
      { x: -110, z: 60, dy: 5.6 },        // дах складу
    ],
  },
  zombieDensity: 1.42,
  signs: [{ x: 8, z: 158, ry: 0 }],
};
