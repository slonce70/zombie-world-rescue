// Конфігурація країн кампанії: біоми, карти, складність, нагороди, боси
import ukraineMap from './maps/ukraine.js';
import polandMap from './maps/poland.js';

export const BIOMES = {
  summer: {
    skyTop: 0x4d9ef7, skyHorizon: 0xcfeeff, skyBottom: 0xb8d9c9,
    fogColor: 0xcfe8ff, fogNear: 130, fogFar: 430,
    hemiSky: 0xcfe8ff, hemiGround: 0x6a9a50, hemiIntensity: 0.85,
    sunColor: 0xfff0d6, sunIntensity: 1.9, sunPos: [70, 110, 50],
    sunDisc: 0xfff6c9, sunDiscPos: [330, 420, 240],
    grass1: 0x66bd41, grass2: 0x4ba332, grass3: 0x83cf52,
    dirt: 0x9b8463, plaza: 0xb3996f, arenaGround: 0x8d8070,
    roadMain: 0xa08a66, roadEdge: 0x77654c,
    treeGreens: [0x4fae3a, 0x5fc24a, 0x46a046, 0x6fcf52, 0x57b83e],
    pineGreens: [0x2e7d4f, 0x35905a, 0x276b44],
    pineRatio: 0.38, snow: false, snowfall: false,
    housePalette: [0xf5e6c8, 0xffe0b3, 0xd6e8f7, 0xf7d6d0, 0xe8f0d8],
    roofPalette: [0xc0563b, 0xa84a32, 0x99553f, 0x8a6f4e],
    flowers: true, hay: true,
    lampGlow: 0.7,
    signText: 'СЕЛО СОНЯЧНЕ',
  },
  winterDusk: {
    skyTop: 0x35508c, skyHorizon: 0xff9e63, skyBottom: 0x8893b8,
    fogColor: 0xc9bdd4, fogNear: 100, fogFar: 380,
    hemiSky: 0xbfd4f2, hemiGround: 0x8fa8c8, hemiIntensity: 1.05,
    sunColor: 0xfff0dd, sunIntensity: 1.35, sunPos: [110, 55, 80],
    sunDisc: 0xffc080, sunDiscPos: [420, 150, 300],
    grass1: 0xe9f1f7, grass2: 0xd3e2ee, grass3: 0xf7fbfe,
    dirt: 0x8e8a92, plaza: 0xa9a8b4, arenaGround: 0xb9c4d4,
    roadMain: 0x9a96a0, roadEdge: 0x6f6c78,
    treeGreens: [0xd9e8f2, 0xc5dcec, 0xe6f1f8, 0x9fc4b0, 0xb2d4c2],
    pineGreens: [0x2c5f48, 0x356b52, 0xdfecf5],
    pineRatio: 0.75, snow: true, snowfall: true,
    housePalette: [0xd8c8b8, 0xc9d4e2, 0xe8ddd0, 0xb8c4d4, 0xddd2c2],
    roofPalette: [0x8a4a3a, 0x5a6478, 0x6e4a3e, 0x4a5468],
    flowers: false, hay: false,
    lampGlow: 1.5,
    signText: 'СЕЛО ЗИМОВЕ',
  },
};

export const COUNTRIES = {
  UKR: {
    id: 'UKR', name: 'Україна', flag: '🇺🇦', seed: 1377,
    lat: 49.2, lon: 31.4,
    victoryTitle: '🇺🇦 УКРАЇНУ ЗВІЛЬНЕНО!',
    biome: 'summer',
    map: ukraineMap,
    difficulty: { hp: 1, dmg: 1, counts: 1 },
    weaponReward: 'rifle',
    weaponRewardToast: 'Ти отримав АВТОМАТ! Клавіша 2 — перемкнути зброю 🔥',
    extraZombie: null,
    boss: { name: '👑 ЗОМБІ-КОРОЛЬ БУЛЬ-БУЛЬ', hp: 1300, frost: false },
    banner: 'Виконай 3 завдання і переможи БОСА! (Shift — біг)',
  },
  POL: {
    id: 'POL', name: 'Польща', flag: '🇵🇱', seed: 2025,
    lat: 52.1, lon: 19.4,
    victoryTitle: '🇵🇱 ПОЛЬЩУ ЗВІЛЬНЕНО!',
    biome: 'winterDusk',
    map: polandMap,
    difficulty: { hp: 1.3, dmg: 1.2, counts: 1.2 },
    weaponReward: 'shotgun',
    weaponRewardToast: 'Ти отримав ДРОБОВИК! Клавіша 3 — зброя для ближнього бою 💥',
    extraZombie: 'snowman',
    boss: { name: '👑 КОРОЛЬ МОРОЗ', hp: 1800, frost: true },
    banner: 'Зима, сніговики-зомбі та КОРОЛЬ МОРОЗ. Вперед! ❄️',
  },
};

export const CAMPAIGN_ORDER = ['UKR', 'POL'];

export function getBiome(countryId) {
  const c = COUNTRIES[countryId] || COUNTRIES.UKR;
  return BIOMES[c.biome] || BIOMES.summer;
}

// Перша незвільнена країна кампанії (наступна ціль) або null, якщо все пройдено
export function nextTarget(liberated) {
  for (const id of CAMPAIGN_ORDER) {
    if (!liberated[id]) return id;
  }
  return null;
}
