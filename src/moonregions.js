// Космічні держави: один перевірений глобус, три різні світи й спільний формат місій.
const regions = (world, rows) => Object.freeze(Object.fromEntries(rows.map((row) => {
  const [id, name, flag, lat, lon, seed, missions, story = false] = row;
  return [id, Object.freeze({ id, world, name, flag, lat, lon, seed, missions, story })];
})));

const SPACE_WORLDS = Object.freeze({
  MOON: Object.freeze({
    id: 'MOON', name: 'Місяць', icon: '🌙', unlockAfter: null,
    bossName: '🌙 МІСЯЧНИЙ ТИТАН',
    banner: 'Велика місячна зона: врятуй екіпаж, віднови системи й знищ Місячного Титана! 🚀',
    colors: ['#758696', '#8b819a', '#727d73', '#6d7f8f'], done: '#a9c9bd', hover: '#c7d9e8', stroke: '#e8edf2',
    palette: {},
    regions: regions('MOON', [
      ['MARE', 'Союз Моря Спокою', '◐', 45, -90, 8101, ['rescue', 'lights', 'defense', 'clear'], true],
      ['TYCHO', 'Республіка Тихо', '✦', 45, 90, 8203, ['escort', 'lights', 'clear', 'defense']],
      ['COPERNICUS', 'Кратерна Держава', '◎', -45, -90, 8309, ['hunt', 'nests', 'collect', 'lights']],
      ['POLARIS', 'Полярна Федерація', '❄', -45, 90, 8423, ['collect', 'defense', 'hunt', 'clear']],
    ]),
  }),
  MARS: Object.freeze({
    id: 'MARS', name: 'Марс', icon: '🔴', unlockAfter: 'MOON',
    bossName: '🔴 ТИТАН АРЕСА',
    banner: 'Марсіанський фронтир: поверни живлення колоніям і зупини Титана Ареса! 🚀',
    colors: ['#9f4d35', '#b86742', '#80392d', '#c77b4c'], done: '#79b982', hover: '#ef9a68', stroke: '#ffd0ae',
    palette: { skyTop: 0x35151a, skyHorizon: 0xc75b38, skyBottom: 0x6a2920, fogColor: 0xb95f43, grass1: 0xa7472e, grass2: 0x7c3327, grass3: 0xc45c35, rock: 0x71372f, peak: 0xd07a55, dirt: 0x93412d, plaza: 0xb65e42, arenaGround: 0x7f352b, roadMain: 0x9f4b35, roadEdge: 0x542720, housePalette: [0xd6b094, 0xa66c58, 0x72505a, 0xc68a66], roofPalette: [0x342e38, 0x51404a, 0x24242c], signText: 'КОЛОНІЯ «АРЕС»' },
    regions: regions('MARS', [
      ['ARSIA', 'Князівство Арсія', '△', 45, -90, 9101, ['stationrepair', 'defense', 'hunt', 'clear']],
      ['UTOPIA', 'Утопійська Республіка', '◈', 45, 90, 9203, ['rescue', 'nests', 'collect', 'defense']],
      ['VALLES', 'Конфедерація Долин', '≋', -45, -90, 9309, ['escort', 'lights', 'hunt', 'clear']],
      ['OLYMPUS', 'Держава Олімпу', '▲', -45, 90, 9423, ['stationrepair', 'defense', 'nests', 'hunt']],
    ]),
  }),
  EUROPA: Object.freeze({
    id: 'EUROPA', name: 'Європа', icon: '🧊', unlockAfter: 'MARS',
    bossName: '🧊 КРІО-ТИТАН ЄВРОПИ',
    banner: 'Крижана кампанія: врятуй підлідні колонії та переможи Кріо-Титана! 🚀',
    colors: ['#85b8cf', '#a4cee0', '#6e9fba', '#c1ddea'], done: '#75d6ba', hover: '#e8fbff', stroke: '#f5fdff',
    palette: { skyTop: 0x07172d, skyHorizon: 0x28557a, skyBottom: 0x10233b, fogColor: 0xaad9eb, grass1: 0xd8f2f7, grass2: 0xa8d7e5, grass3: 0xeafcff, rock: 0x7699ad, peak: 0xf7ffff, water: 0x3a8fc4, dirt: 0x9fcbd7, plaza: 0xc9e9ef, arenaGround: 0x8ebccb, roadMain: 0xb8dde4, roadEdge: 0x688e9e, housePalette: [0xd8f0f4, 0x9fc6d6, 0x708fa8, 0xc6e2ea], roofPalette: [0x24475e, 0x38677d, 0x172f46], signText: 'КОЛОНІЯ «ОКЕАН»' },
    regions: regions('EUROPA', [
      ['CONAMARA', 'Союз Конамари', '✧', 45, -90, 10101, ['rescue', 'defense', 'stationrepair', 'clear']],
      ['LINEA', 'Лінійна Федерація', '╱', 45, 90, 10203, ['lights', 'nests', 'escort', 'hunt']],
      ['THERA', 'Океанічна Держава', '≈', -45, -90, 10309, ['collect', 'defense', 'clear', 'stationrepair']],
      ['ARGADNEL', 'Крижана Республіка', '❉', -45, 90, 10423, ['hunt', 'nests', 'defense', 'clear']],
    ]),
  }),
});

export const SPACE_WORLD_ORDER = Object.freeze(Object.keys(SPACE_WORLDS));
export const getSpaceWorld = (id) => SPACE_WORLDS[String(id || 'MOON').toUpperCase()] || SPACE_WORLDS.MOON;
export const getSpaceRegion = (worldId, regionId) => {
  const world = getSpaceWorld(worldId);
  return world.regions[regionId] || Object.values(world.regions)[0];
};
export const spaceRegionList = (worldId) => Object.values(getSpaceWorld(worldId).regions);
export const spaceWorldUnlocked = (save, worldId) => {
  const world = getSpaceWorld(worldId);
  if (!world.unlockAfter) return true;
  const done = world.unlockAfter === 'MOON' ? save?.moonRegions || {}
    : save?.moonRescue?.space?.regions?.[world.unlockAfter] || {};
  return spaceRegionList(world.unlockAfter).every((region) => done[region.id]);
};

export const MOON_REGION_LIST = Object.freeze(spaceRegionList('MOON'));
export const getMoonRegion = (id, worldId = 'MOON') => getSpaceRegion(worldId, id);

export function moonRegionFeatures(worldId = 'MOON') {
  return spaceRegionList(worldId).map((region, index) => {
    const west = index % 2 ? 0 : -180;
    const east = index % 2 ? 180 : 0;
    const north = index < 2 ? 90 : 0;
    const south = index < 2 ? 0 : -90;
    return {
      id: region.id,
      properties: { name: region.name },
      geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
    };
  });
}
