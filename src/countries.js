// Конфігурація країн кампанії: біоми, карти, складність, нагороди, боси
import ukraineMap from './maps/ukraine.js';
import polandMap from './maps/poland.js';
import germanyMap from './maps/germany.js';
import franceMap from './maps/france.js';

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
  // 🍂 золота осінь Німеччини
  autumnGold: {
    skyTop: 0x4a8fd4, skyHorizon: 0xffe3b8, skyBottom: 0xc9b894,
    fogColor: 0xe8d9bc, fogNear: 115, fogFar: 400,
    hemiSky: 0xe8dcc4, hemiGround: 0x9a7a48, hemiIntensity: 0.95,
    sunColor: 0xffe8c2, sunIntensity: 1.7, sunPos: [90, 85, 60],
    sunDisc: 0xffdf9e, sunDiscPos: [380, 300, 260],
    grass1: 0xa8a23e, grass2: 0x8a8a34, grass3: 0xc2b04a,
    dirt: 0x9a8058, plaza: 0xb0a080, arenaGround: 0x948872,
    roadMain: 0x8a8076, roadEdge: 0x5f584e,
    treeGreens: [0xe89a3a, 0xd8742f, 0xc9582c, 0xe2b03d, 0xb85c38],
    pineGreens: [0x3e6e44, 0x4a7a50, 0x35603c],
    pineRatio: 0.3, snow: false, snowfall: false, leaffall: true,
    housePalette: [0xf2ead8, 0xe8dcc4, 0xf5efe0, 0xddd0b8, 0xe8e0cc],
    roofPalette: [0x6b4a3a, 0x4a3a35, 0x7a4530, 0x5a4a40],
    flowers: false, hay: true,
    lampGlow: 0.9,
    signText: 'МІСТО ЗОЛОТЕ',
    timber: true, // фахверкові балки на будинках
  },
  // 💜 лавандовий Прованс
  provence: {
    skyTop: 0x5a9ee8, skyHorizon: 0xffd9c2, skyBottom: 0xc2b8d4,
    fogColor: 0xe8d4e0, fogNear: 125, fogFar: 420,
    hemiSky: 0xe8d8e8, hemiGround: 0x8a9a58, hemiIntensity: 0.9,
    sunColor: 0xffe2cc, sunIntensity: 1.75, sunPos: [80, 95, 55],
    sunDisc: 0xffd9ad, sunDiscPos: [350, 360, 250],
    grass1: 0x8ab84a, grass2: 0x6e9e3c, grass3: 0xa8c95a,
    dirt: 0xb09a72, plaza: 0xc4ae88, arenaGround: 0x9a8e78,
    roadMain: 0xb0a084, roadEdge: 0x837456,
    treeGreens: [0x5fae4a, 0x74bd52, 0x8a9a40, 0x6e8a3a, 0x57b83e],
    pineGreens: [0x4a7a44, 0x3e6e3c, 0x55864c],
    pineRatio: 0.25, snow: false, snowfall: false,
    housePalette: [0xf5e2c8, 0xf7d6c2, 0xe8e0d0, 0xd6e0f0, 0xf2e8d4],
    roofPalette: [0xc0704a, 0xb05e3e, 0xa85636, 0x99553f],
    flowers: true, hay: false,
    lampGlow: 0.8,
    signText: 'МІСТЕЧКО ЛАВАНДОВЕ',
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
    shieldGuards: 2,
    boss: { name: '👑 ЗОМБІ-КОРОЛЬ БУЛЬ-БУЛЬ', hp: 1800, frost: false, style: 'king' },
    banner: 'Виконай 3 завдання і переможи БОСА! (Shift — біг)',
    food: 'вареник',
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
    shieldGuards: 3,
    boss: { name: '👑 КОРОЛЬ МОРОЗ', hp: 2400, frost: true, style: 'frost' },
    banner: 'Зима, сніговики-зомбі та КОРОЛЬ МОРОЗ. Вперед! ❄️',
    food: 'пончик',
  },
  DEU: {
    id: 'DEU', name: 'Німеччина', flag: '🇩🇪', seed: 4040,
    lat: 51.2, lon: 10.4,
    victoryTitle: '🇩🇪 НІМЕЧЧИНУ ЗВІЛЬНЕНО!',
    biome: 'autumnGold',
    map: germanyMap,
    difficulty: { hp: 1.55, dmg: 1.35, counts: 1.35 },
    weaponReward: 'smg',
    weaponRewardToast: 'Ти отримав ШВИДКОСТРІЛ! Клавіша 4 — злива куль 🌀',
    extraZombie: 'shield',
    shieldGuards: 4,
    boss: { name: '👑 ЗАЛІЗНИЙ БАРОН', hp: 3200, frost: false, style: 'iron' },
    banner: 'Золота осінь, автобан і армія щитоносців. Цілься в спину! 🛡️',
    food: 'брецель',
  },
  FRA: {
    id: 'FRA', name: 'Франція', flag: '🇫🇷', seed: 5050,
    lat: 46.6, lon: 2.4,
    victoryTitle: '🇫🇷 ФРАНЦІЮ ЗВІЛЬНЕНО!',
    biome: 'provence',
    map: franceMap,
    difficulty: { hp: 1.8, dmg: 1.5, counts: 1.45 },
    weaponReward: 'sniper',
    weaponRewardToast: 'Ти отримав СНАЙПЕРКУ! Клавіша 6 — пробиває трьох наскрізь 🎯',
    extraZombie: 'spitter',
    shieldGuards: 3,
    boss: { name: '👑 ШЕФ БАГЕТ', hp: 4200, frost: false, style: 'chef' },
    banner: 'Лаванда, вежа до неба і ШЕФ БАГЕТ. Стережись черствих багетів! 🥖',
    food: 'круасан',
  },
};

export const CAMPAIGN_ORDER = ['UKR', 'POL', 'DEU', 'FRA'];

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
