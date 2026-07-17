// Повноцінна місячна зона: велика відкрита карта зі станцією, кратерами,
// окремими місіями та ареною Місячного Титана.
import { basin, mesa } from '../utils.js';

export default {
  bound: 240,
  spawn: { x: 0, z: 214 },
  barren: true,
  terrain: (x, z) =>
    basin(x, z, -112, -58, 34, 4.5, 16)
    + basin(x, z, 96, 64, 28, 3.4, 14)
    + basin(x, z, 72, -132, 22, 2.8, 12)
    + mesa(x, z, 0, -184, 48, 5, 20),
  sites: {
    village: { x: 0, z: 26, r: 42 },
    rescue: { x: -132, z: 18, r: 18 },
    tower: { x: 122, z: -44, r: 18 },
    warehouse: { x: -104, z: -96, r: 22 },
    arena: { x: 0, z: -188, r: 38 },
  },
  storySites: {
    station: { x: 0, z: 26 },
    crew: { x: -132, z: 18 },
    relays: { x: 122, z: -44 },
    reactor: { x: -104, z: -96 },
    barracks: { x: -104, z: -96 },
    arena: { x: 0, z: -188 },
  },
  roads: [
    [[0, 224], [0, 150], [0, 84], [0, 28]],
    [[-8, 28], [-48, 24], [-92, 20], [-130, 18]],
    [[10, 18], [50, -4], [88, -28], [120, -44]],
    [[-10, 10], [-42, -28], [-76, -68], [-102, -94]],
    [[0, 8], [0, -58], [0, -120], [0, -184]],
  ],
  hills: [
    { x: -174, z: -130, h: 12, sigma: 52 },
    { x: 166, z: -112, h: 10, sigma: 48 },
    { x: -166, z: 126, h: 8, sigma: 44 },
    { x: 142, z: 136, h: 9, sigma: 50 },
  ],
  flats: [
    { x: 0, z: 26, r: 40 },
    { x: 0, z: -188, r: 38 },
  ],
  houses: [
    { x: -24, z: 42, ry: -Math.PI / 2, enterable: true, surprise: false, tall: true },
    { x: 24, z: 42, ry: Math.PI / 2, enterable: true, surprise: true, tall: true },
    { x: -26, z: 10, ry: -Math.PI / 2, enterable: true, surprise: false },
    { x: 26, z: 10, ry: Math.PI / 2, enterable: true, surprise: true },
    { x: -8, z: 68, ry: 0, enterable: true, surprise: false },
    { x: 12, z: 92, ry: Math.PI, enterable: true, surprise: true },
  ],
  villageExtras: ['lamps', 'fences'],
  landmarks: [],
  fun: {
    barrels: [[-100, -90], [112, -40], [-126, 20], [22, 76], [-22, 4]],
    jumpPads: [
      { x: -24, z: 42, power: 15 },
      { x: 24, z: 42, power: 15 },
    ],
    secretLoot: [
      { x: -24, z: 42, dy: 5.4 },
      { x: 24, z: 42, dy: 5.4 },
    ],
    goldenZombie: true,
  },
  zombieDensity: 2,
  signs: [{ x: 8, z: 204, ry: 0 }],
};
