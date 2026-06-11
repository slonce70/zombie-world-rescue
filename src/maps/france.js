// Карта Франції: містечко Лавандове — Ейфелева вежа (батутами на самий верх!),
// лавандове поле, виноградник, кафе з круасанами, повітряна куля
export default {
  bound: 200,
  spawn: { x: 0, z: 170 },
  sites: {
    village: { x: 0, z: 4, r: 40 },
    rescue: { x: -92, z: -58, r: 16 },
    tower: { x: 118, z: -88, r: 16 },
    warehouse: { x: -110, z: 60, r: 22 },
    arena: { x: 18, z: -160, r: 30 },
  },
  roads: [
    [[0, 190], [0, 124], [2, 62], [0, 18]],              // південний в'їзд
    [[-10, -4], [-46, -24], [-78, -46], [-90, -54]],     // містечко → порятунок
    [[10, -8], [56, -38], [92, -66], [115, -85]],        // містечко → вежа (повз Ейфелеву)
    [[-8, 10], [-48, 28], [-84, 46], [-106, 56]],        // містечко → склад
    [[4, -16], [10, -72], [14, -126], [16, -148]],       // містечко → арена
  ],
  hills: [
    { x: 118, z: -88, h: 8, sigma: 40 },   // пагорб радіовежі
    { x: -70, z: -110, h: 6, sigma: 32 },  // мальовничий пагорб
  ],
  flats: [
    { x: 58, z: -28, r: 17 },   // майданчик Ейфелевої вежі
    { x: 70, z: 42, r: 16 },    // виноградник
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
    { x: -52, z: 34, ry: 0 },
  ],
  villageExtras: ['well', 'lamps', 'fences'],
  landmarks: ['eiffelTower', 'cafe', 'lavenderField', 'vineyard', 'balloon', 'chimneySmoke', 'birds'],
  landmarkParams: {
    eiffelTower: { x: 58, z: -28 },
    cafe: { x: 12, z: 20 },
    lavenderField: { x: -64, z: 22, w: 42, d: 28 },
    vineyard: { x: 70, z: 42 },
    balloon: { x: -40, z: -60 },
  },
  fun: {
    barrels: [
      [-104, 54], [-118, 66], [-86, -50], [10, -136], [26, -150], [36, -26], [6, 114],
    ],
    jumpPads: [
      { x: 13, z: 30, power: 15 },        // на дах будинку
      { x: 58, z: -20.5, power: 22 },     // Ейфелева: на 1-й ярус
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
  zombieDensity: 1.4,
  signs: [{ x: 8, z: 160, ry: 0 }],
};
