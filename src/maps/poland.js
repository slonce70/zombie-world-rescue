// Карта Польщі: містечко Зимове — ринкова площа, замерзле озеро, руїни замку, депо
import { ridge } from '../utils.js';

export default {
  bound: 200,
  spawn: { x: 0, z: 170 },
  // 🏔️ Татри: засніжений хребет здіймається за руїнами замку, передгір'я на
  // південному заході і східний схил — місто лежить у гірській долині
  terrain: (x, z) =>
    ridge(x, z, -170, -188, 170, -188, 22, 56)
    + ridge(x, z, -188, 30, -130, 188, 13, 38)
    + ridge(x, z, 188, -80, 188, 120, 9, 30),
  sites: {
    village: { x: 0, z: -10, r: 34 },        // ринкова площа
    rescue: { x: -26, z: -12, r: 14 },       // кам'яниця на захід від площі
    tower: { x: 140, z: -62, r: 16 },        // пагорб за озером
    warehouse: { x: -112, z: 62, r: 22 },    // склад біля депо
    arena: { x: 12, z: -162, r: 30 },        // руїни замку
  },
  roads: [
    [[0, 190], [0, 120], [0, 60], [0, 14]],            // південний в'їзд → площа
    [[-12, 0], [-50, 22], [-84, 44], [-108, 58]],      // площа → депо
    [[12, -16], [58, -30], [104, -46], [134, -58]],    // площа → вежа (повз озеро)
    [[2, -32], [6, -90], [10, -130], [12, -148]],      // площа → замок
    [[10, 4], [40, 24], [62, 38]],                     // доріжка до озера
  ],
  hills: [
    { x: 140, z: -62, h: 9, sigma: 40 },   // пагорб вежі
    { x: -60, z: -120, h: 6, sigma: 34 },  // мальовничий пагорб з ялинками
  ],
  flats: [
    { x: 92, z: 32, r: 44 },   // озеро (лід рівний)
  ],
  ice: { x: 92, z: 32, r: 36 },
  houses: [
    // кам'яниці навколо площі (щільні, високі)
    { x: -26, z: -12, ry: Math.PI / 2, skipAuto: true },  // rescue-будинок ставить місія
    { x: -26, z: 6, ry: Math.PI / 2, tall: true, enterable: true, surprise: true },
    { x: 26, z: -14, ry: -Math.PI / 2, tall: true, enterable: true, surprise: false },
    { x: 26, z: 4, ry: -Math.PI / 2, tall: true },
    { x: -14, z: 22, ry: 0, tall: true, enterable: true, surprise: true },
    { x: 14, z: 22, ry: 0, tall: true },
    // котеджі вздовж доріг
    { x: -8, z: 70, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: 14, z: 100, ry: Math.PI / 2 },
    { x: -52, z: 34, ry: 0 },
    { x: 60, z: -38, ry: Math.PI },
  ],
  villageExtras: ['lamps'],
  landmarks: ['townSquare', 'frozenLake', 'castleRuin', 'railDepot', 'garlandTrees', 'chimneySmoke', 'birds'],
  landmarkParams: {
    townSquare: { x: 0, z: -10, r: 22 },
    frozenLake: { x: 92, z: 32, r: 36 },
    castleRuin: { x: 12, z: -162, r: 30 },
    railDepot: { x: -112, z: 62 },
    garlandTrees: { spots: [[-6, -2], [8, -20], [-40, 50], [30, 60]] },
  },
  fun: {
    barrels: [
      [-104, 56], [-120, 70], [4, -136], [22, -148], [60, -34], [-30, 28],
    ],
    jumpPads: [
      { x: 22, z: -19, power: 16 },     // впритул до кам'яниці — на дах
      { x: -120, z: 67, power: 14 },    // депо — на вагон
    ],
    soccerBall: { x: 2, z: -6 },
    animals: 'hares',
    goldenZombie: true,
    secretLoot: [
      { x: 26, z: -14, dy: 5.4 },       // дах кам'яниці
      { x: -112, z: 71, dy: 4.0 },      // дах середнього вагона
    ],
  },
  zombieDensity: 1.35,
  signs: [{ x: 8, z: 160, ry: 0 }],
};
