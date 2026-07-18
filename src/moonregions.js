// Вигадані держави Місяця: окремий глобус і різні набори місій.
export const MOON_REGIONS = Object.freeze({
  MARE: Object.freeze({ id: 'MARE', name: 'Союз Моря Спокою', flag: '◐', lat: 45, lon: -90, seed: 8101, story: true, missions: ['rescue', 'lights', 'defense', 'clear'] }),
  TYCHO: Object.freeze({ id: 'TYCHO', name: 'Республіка Тихо', flag: '✦', lat: 45, lon: 90, seed: 8203, missions: ['escort', 'lights', 'clear', 'defense'] }),
  COPERNICUS: Object.freeze({ id: 'COPERNICUS', name: 'Кратерна Держава', flag: '◎', lat: -45, lon: -90, seed: 8309, missions: ['hunt', 'nests', 'collect', 'lights'] }),
  POLARIS: Object.freeze({ id: 'POLARIS', name: 'Полярна Федерація', flag: '❄', lat: -45, lon: 90, seed: 8423, missions: ['collect', 'defense', 'hunt', 'clear'] }),
});

export const MOON_REGION_LIST = Object.freeze(Object.values(MOON_REGIONS));
export const getMoonRegion = (id) => MOON_REGIONS[id] || MOON_REGIONS.MARE;

export function moonRegionFeatures() {
  return MOON_REGION_LIST.map((region, index) => {
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
