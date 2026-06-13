// Карта Єгипту: Оаза Золота — Велика піраміда (вилазь уступами до скарбу!),
// сфінкс, пальмова оаза з водою, обеліски, верблюди, піщана імла
// і ФАРАОН ТУТ-АНХ-ЗОМБ на арені серед дюн
import { mesa, dunes, basin } from '../utils.js';

export default {
  bound: 205,
  spawn: { x: 0, z: 172 },
  // 🏔️ пустеля: хвилясті дюни по всій карті, скельне плато під пірамідою і
  // сфінксом (пологий підйом), западина пальмової оази
  terrain: (x, z) =>
    dunes(x, z, 4.0, 58, 0.55)
    + mesa(x, z, 58, -104, 48, 6, 16)
    + basin(x, z, -48, 36, 24, 2.2, 12),
  sites: {
    village: { x: 0, z: 8, r: 40 },
    rescue: { x: -94, z: -60, r: 16 },
    tower: { x: 116, z: -84, r: 16 },
    warehouse: { x: -112, z: 58, r: 22 },
    arena: { x: 14, z: -162, r: 32 },
  },
  roads: [
    [[0, 192], [2, 126], [0, 62], [0, 22]],              // південний в'їзд
    [[-10, -2], [-46, -26], [-78, -48], [-92, -58]],     // оаза → порятунок
    [[10, -6], [56, -34], [92, -62], [114, -80]],        // оаза → вежа
    [[-8, 12], [-50, 28], [-86, 44], [-108, 54]],        // оаза → склад
    [[4, -16], [8, -74], [10, -128], [12, -150]],        // оаза → арена (повз піраміди)
  ],
  hills: [
    { x: 116, z: -84, h: 8, sigma: 40 },    // пагорб вежі
    { x: -60, z: -130, h: 9, sigma: 45 },   // велика дюна
    { x: 90, z: 110, h: 7, sigma: 50 },     // дюни на сході
    { x: -130, z: -20, h: 6, sigma: 38 },   // дюна за складом
  ],
  flats: [
    { x: 62, z: -110, r: 30 },  // плато пірамід
    { x: -48, z: 36, r: 16 },   // оаза з водою
  ],
  houses: [
    { x: 16, z: 36, ry: Math.PI / 2, enterable: true, surprise: false },
    { x: -16, z: 30, ry: -Math.PI / 2, enterable: true, surprise: true },
    { x: 20, z: 8, ry: Math.PI / 2, tall: true },
    { x: -20, z: -8, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: -30, z: -28, ry: 0 },
    { x: 30, z: -24, ry: Math.PI, enterable: true, surprise: true },
    { x: -8, z: 80, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: 14, z: 104, ry: Math.PI / 2 },
  ],
  villageExtras: ['well', 'lamps', 'fences'],
  landmarks: ['pyramids', 'sphinx', 'oasis', 'obelisks', 'birds'],
  landmarkParams: {
    pyramids: { x: 62, z: -110 },
    sphinx: { x: 30, z: -86 },
    oasis: { x: -48, z: 36 },
    obelisks: [{ x: -8, z: -40 }, { x: 24, z: 58 }],
  },
  fun: {
    barrels: [
      [-106, 52], [-120, 64], [-88, -52], [6, -138], [22, -152], [34, -28], [4, 118],
    ],
    jumpPads: [
      { x: 13, z: 30, power: 15 },          // на дах будинку
      { x: 50, z: -98, power: 18 },         // на уступи піраміди
      { x: -118, z: 63, power: 15 },        // склад — на дах
    ],
    soccerBall: { x: 4, z: 20 },
    animals: 'camels',
    goldenZombie: true,
    secretLoot: [
      { x: -16, z: 30, dy: 5.4 },           // дах кам'яниці
      { x: -112, z: 58, dy: 5.6 },          // дах складу
      { x: 62, z: -110, dy: 17.5 },         // вершина Великої піраміди!
    ],
  },
  zombieDensity: 1.55,
  signs: [{ x: 8, z: 162, ry: 0 }],
};
