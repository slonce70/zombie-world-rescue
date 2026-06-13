// Карта України: село Сонячне (координати збережені з v1 — тести на них спираються)
import { ridge, valley } from '../utils.js';

export default {
  bound: 200,
  spawn: { x: 6, z: 168 },
  // 🏔️ степ: східний кряж на краю світу, пагорби за ареною і балка з потічком
  terrain: (x, z) =>
    ridge(x, z, 186, -160, 186, 140, 7, 34)
    + ridge(x, z, -60, -186, 80, -186, 5, 26)
    + valley(x, z, -180, 100, -30, 128, 4.2, 20),
  // 💧 потічок на дні балки
  rivers: [{ pts: [[-180, 100], [-110, 112], [-30, 128]], width: 7, level: -2.0, depth: 1.0 }],
  sites: {
    village: { x: 0, z: 0, r: 50 },
    rescue: { x: -98, z: -62, r: 16 },
    tower: { x: 112, z: -92, r: 16 },
    warehouse: { x: 128, z: 58, r: 22 },
    arena: { x: -10, z: -168, r: 30 },
  },
  roads: [
    [[6, 192], [6, 120], [2, 60], [0, 10]],
    [[0, 10], [-40, -18], [-78, -48], [-96, -58]],
    [[2, 6], [40, -30], [80, -64], [110, -88]],
    [[4, 12], [50, 12], [95, 36], [124, 54]],
    [[-2, 4], [-6, -60], [-10, -120], [-10, -146]],
  ],
  hills: [
    { x: 112, z: -92, h: 8, sigma: 42 },   // пагорб радіовежі
    { x: -148, z: -10, h: 7, sigma: 28 },  // пагорб вітряка
  ],
  flats: [
    { x: -148, z: -10, r: 14 }, // майданчик під вітряком
    { x: -55, z: 38, r: 16 },   // ставок
  ],
  // тип будівель і село
  houses: [
    { x: 18, z: 40, ry: Math.PI / 2, enterable: true, surprise: false },
    { x: -14, z: 30, ry: -Math.PI / 2, enterable: true, surprise: true },
    { x: 16, z: 8, ry: Math.PI / 2 },
    { x: -16, z: -8, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: -30, z: -26, ry: 0 },
    { x: 26, z: -20, ry: Math.PI },
    { x: 38, z: 22, ry: 0, enterable: true, surprise: true },
    { x: -12, z: 78, ry: -Math.PI / 2 },
    { x: 20, z: 98, ry: Math.PI / 2 },
    { x: 60, z: 4, ry: 0 },
  ],
  villageExtras: ['well', 'lamps', 'fences'],
  landmarks: ['sunflowerField', 'pond', 'windmill', 'chimneySmoke', 'birds'],
  landmarkParams: {
    sunflowerField: { x: 88, z: 6, w: 44, d: 30 },
    pond: { x: -55, z: 38, r: 12 },
    windmill: { x: -148, z: -10 },
  },
  fun: {
    barrels: [
      [120, 44], [134, 70], [-88, -52], [-2, -140], [-18, -152], [40, -36], [10, 116],
    ],
    jumpPads: [
      { x: 14.5, z: 36, power: 15 },   // впритул до будинку — на дах
      { x: 122, z: 63, power: 15 },    // склад — на дах ангара
    ],
    soccerBall: { x: 5, z: 18 },
    animals: 'chickens',
    goldenZombie: true,
    secretLoot: [
      { x: 18, z: 40, dy: 4.3 },       // дах будинку біля батута
      { x: 128, z: 58, dy: 5.6 },      // дах складу
    ],
  },
  zombieDensity: 1.3,
  signs: [{ x: 12, z: 162, ry: 0 }],
};
