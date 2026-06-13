// Карта Туреччини: місто Східне — Великий базар (лут під арками!), вежа Галата
// (батутами на оглядовий майданчик), повітряні кулі Каппадокії, чайний садок,
// вуличні котики і ПАША КЕБАБ на арені
import { mesa, valley } from '../utils.js';

export default {
  bound: 200,
  spawn: { x: 0, z: 170 },
  // 🏔️ Каппадокія: плоскі скельні мези (на дві можна зайти схилом, третя —
  // стрімка, тільки з батута!) і каньйон під повітряними кулями
  terrain: (x, z) =>
    mesa(x, z, -150, 128, 26, 12, 10)
    + mesa(x, z, 158, -34, 24, 13, 10)
    + mesa(x, z, -148, -136, 22, 10, 4)
    + valley(x, z, 56, 122, 168, 44, 7, 13),
  sites: {
    village: { x: 0, z: 6, r: 40 },
    rescue: { x: -96, z: -52, r: 16 },
    tower: { x: 112, z: -92, r: 16 },
    warehouse: { x: -108, z: 64, r: 22 },
    arena: { x: 24, z: -158, r: 30 },
  },
  roads: [
    [[0, 190], [0, 122], [-2, 60], [0, 20]],             // південний в'їзд
    [[-10, -2], [-48, -22], [-80, -42], [-94, -50]],     // місто → порятунок
    [[10, -6], [54, -36], [88, -68], [110, -88]],        // місто → вежа Галата
    [[-8, 12], [-46, 30], [-82, 50], [-104, 60]],        // місто → склад (повз базар)
    [[6, -14], [12, -70], [18, -124], [22, -146]],       // місто → арена
  ],
  hills: [
    { x: 112, z: -92, h: 9, sigma: 42 },   // пагорб вежі
    { x: 80, z: 60, h: 7, sigma: 36 },     // пагорб із кулями
  ],
  flats: [
    { x: -56, z: -10, r: 20 },  // майданчик Великого базару
    { x: 36, z: 30, r: 14 },    // чайний садок
  ],
  houses: [
    { x: 16, z: 36, ry: Math.PI / 2, enterable: true, surprise: false },
    { x: -16, z: 32, ry: -Math.PI / 2, tall: true, enterable: true, surprise: true },
    { x: 20, z: 10, ry: Math.PI / 2, tall: true },
    { x: -20, z: -6, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: -32, z: -28, ry: 0, enterable: true, surprise: true },
    { x: 32, z: -20, ry: Math.PI },
    { x: -8, z: 78, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: 18, z: 102, ry: Math.PI / 2 },
    { x: 48, z: 6, ry: Math.PI / 2, enterable: true, surprise: false },
  ],
  villageExtras: ['well', 'lamps', 'fences'],
  landmarks: ['grandBazaar', 'galataTower', 'teaGarden', 'cappadociaBalloons', 'chimneySmoke', 'birds'],
  landmarkParams: {
    grandBazaar: { x: -56, z: -10 },
    galataTower: { x: 112, z: -92 },
    teaGarden: { x: 36, z: 30 },
    cappadociaBalloons: { x: 80, z: 60 },
  },
  fun: {
    barrels: [
      [-102, 58], [-116, 70], [-90, -44], [16, -134], [32, -148], [40, -24], [8, 116], [-50, -22],
    ],
    jumpPads: [
      { x: 13, z: 32, power: 15 },          // на дах будинку
      { x: 108, z: -86, power: 24 },        // вежа Галата: на майданчик
      { x: -114, z: 69, power: 15 },        // склад — на дах
    ],
    soccerBall: { x: 6, z: 20 },
    animals: 'cats',
    goldenZombie: true,
    secretLoot: [
      { x: -16, z: 32, dy: 5.4 },           // дах кам'яниці
      { x: -108, z: 64, dy: 5.6 },          // дах складу
      { x: 112, z: -92, dy: 13.5 },         // оглядовий майданчик Галати
    ],
  },
  zombieDensity: 1.5,
  signs: [{ x: 8, z: 160, ry: 0 }],
};
