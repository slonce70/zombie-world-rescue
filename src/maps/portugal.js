// Карта Португалії: тепле атлантичне містечко з фонтаном, собором,
// оливковими садами, птахами над узбережжям і босом у відкритій арені.
import spainMap from './spain.js';

export default {
  ...spainMap,
  landmarks: ['plazaFountain', 'oliveGrove', 'cathedral', 'birds'],
  landmarkParams: {
    plazaFountain: { x: 0, z: 24 },
    oliveGrove: { x: -72, z: 34, w: 44, d: 32 },
    cathedral: { x: 58, z: -30 },
  },
  zombieDensity: 1.43,
};
