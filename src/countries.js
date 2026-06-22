// Конфігурація країн кампанії: біоми, карти, складність, нагороди, боси
import ukraineMap from './maps/ukraine.js';
import { t, keyHint } from './i18n.js';
import polandMap from './maps/poland.js';
import germanyMap from './maps/germany.js';
import franceMap from './maps/france.js';
import spainMap from './maps/spain.js';
import italyMap from './maps/italy.js';
import turkeyMap from './maps/turkey.js';
import egyptMap from './maps/egypt.js';
import japanMap from './maps/japan.js';

export const BIOMES = {
  summer: {
    skyTop: 0x4d9ef7, skyHorizon: 0xcfeeff, skyBottom: 0xb8d9c9,
    fogColor: 0xcfe8ff, fogNear: 130, fogFar: 430,
    hemiSky: 0xcfe8ff, hemiGround: 0x6a9a50, hemiIntensity: 0.85,
    sunColor: 0xfff0d6, sunIntensity: 1.9, sunPos: [70, 110, 50],
    sunDisc: 0xfff6c9, sunDiscPos: [330, 420, 240],
    grass1: 0x66bd41, grass2: 0x4ba332, grass3: 0x83cf52,
    rock: 0x8d8060, peak: 0x9a8f76, water: 0x49b8e8, riverbed: 0x9a8a64,
    dirt: 0x9b8463, plaza: 0xb3996f, arenaGround: 0x8d8070,
    roadMain: 0xa08a66, roadEdge: 0x77654c,
    treeGreens: [0x4fae3a, 0x5fc24a, 0x46a046, 0x6fcf52, 0x57b83e],
    pineGreens: [0x2e7d4f, 0x35905a, 0x276b44],
    pineRatio: 0.38, snow: false, snowfall: false,
    housePalette: [0xf5e6c8, 0xffe0b3, 0xd6e8f7, 0xf7d6d0, 0xe8f0d8],
    roofPalette: [0xc0563b, 0xa84a32, 0x99553f, 0x8a6f4e],
    flowers: true, hay: true,
    lampGlow: 0.7,
    signText: t('СЕЛО СОНЯЧНЕ'),
  },
  winterDusk: {
    skyTop: 0x35508c, skyHorizon: 0xff9e63, skyBottom: 0x8893b8,
    fogColor: 0xc9bdd4, fogNear: 100, fogFar: 380,
    hemiSky: 0xbfd4f2, hemiGround: 0x8fa8c8, hemiIntensity: 1.05,
    sunColor: 0xfff0dd, sunIntensity: 1.35, sunPos: [110, 55, 80],
    sunDisc: 0xffc080, sunDiscPos: [420, 150, 300],
    grass1: 0xe9f1f7, grass2: 0xd3e2ee, grass3: 0xf7fbfe,
    rock: 0x6f7689, peak: 0xf4f8ff, water: 0x9fd4ee, riverbed: 0x8b93a6,
    dirt: 0x8e8a92, plaza: 0xa9a8b4, arenaGround: 0xb9c4d4,
    roadMain: 0x9a96a0, roadEdge: 0x6f6c78,
    treeGreens: [0xd9e8f2, 0xc5dcec, 0xe6f1f8, 0x9fc4b0, 0xb2d4c2],
    pineGreens: [0x2c5f48, 0x356b52, 0xdfecf5],
    pineRatio: 0.75, snow: true, snowfall: true,
    housePalette: [0xd8c8b8, 0xc9d4e2, 0xe8ddd0, 0xb8c4d4, 0xddd2c2],
    roofPalette: [0x8a4a3a, 0x5a6478, 0x6e4a3e, 0x4a5468],
    flowers: false, hay: false,
    lampGlow: 1.5,
    signText: t('СЕЛО ЗИМОВЕ'),
  },
  // 🍂 золота осінь Німеччини
  autumnGold: {
    skyTop: 0x4a8fd4, skyHorizon: 0xffe3b8, skyBottom: 0xc9b894,
    fogColor: 0xe8d9bc, fogNear: 115, fogFar: 400,
    hemiSky: 0xe8dcc4, hemiGround: 0x9a7a48, hemiIntensity: 0.95,
    sunColor: 0xffe8c2, sunIntensity: 1.7, sunPos: [90, 85, 60],
    sunDisc: 0xffdf9e, sunDiscPos: [380, 300, 260],
    grass1: 0xa8a23e, grass2: 0x8a8a34, grass3: 0xc2b04a,
    rock: 0x84765e, peak: 0x97927e, water: 0x4fa8d8, riverbed: 0x8f7f5c,
    dirt: 0x9a8058, plaza: 0xb0a080, arenaGround: 0x948872,
    roadMain: 0x8a8076, roadEdge: 0x5f584e,
    treeGreens: [0xe89a3a, 0xd8742f, 0xc9582c, 0xe2b03d, 0xb85c38],
    pineGreens: [0x3e6e44, 0x4a7a50, 0x35603c],
    pineRatio: 0.3, snow: false, snowfall: false, leaffall: true,
    housePalette: [0xf2ead8, 0xe8dcc4, 0xf5efe0, 0xddd0b8, 0xe8e0cc],
    roofPalette: [0x6b4a3a, 0x4a3a35, 0x7a4530, 0x5a4a40],
    flowers: false, hay: true,
    lampGlow: 0.9,
    signText: t('МІСТО ЗОЛОТЕ'),
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
    rock: 0xa3937a, peak: 0xcabfa4, water: 0x4dc3e8, riverbed: 0xb0a080,
    dirt: 0xb09a72, plaza: 0xc4ae88, arenaGround: 0x9a8e78,
    roadMain: 0xb0a084, roadEdge: 0x837456,
    treeGreens: [0x5fae4a, 0x74bd52, 0x8a9a40, 0x6e8a3a, 0x57b83e],
    pineGreens: [0x4a7a44, 0x3e6e3c, 0x55864c],
    pineRatio: 0.25, snow: false, snowfall: false,
    housePalette: [0xf5e2c8, 0xf7d6c2, 0xe8e0d0, 0xd6e0f0, 0xf2e8d4],
    roofPalette: [0xc0704a, 0xb05e3e, 0xa85636, 0x99553f],
    flowers: true, hay: false,
    lampGlow: 0.8,
    signText: t('МІСТЕЧКО ЛАВАНДОВЕ'),
  },
  // 🇪🇸 спекотне іспанське сонце — теракотові тони, ясне небо, корида
  spainSun: {
    skyTop: 0x3f93e8, skyHorizon: 0xffeac2, skyBottom: 0xe6c898,
    fogColor: 0xf2dcb0, fogNear: 130, fogFar: 430,
    hemiSky: 0xfbeccc, hemiGround: 0xb89a62, hemiIntensity: 1.0,
    sunColor: 0xfff0cc, sunIntensity: 2.05, sunPos: [80, 115, 45],
    sunDisc: 0xfff2c2, sunDiscPos: [330, 430, 230],
    grass1: 0xc2ad5e, grass2: 0xa89a48, grass3: 0xd4bf6e, // суха золотиста земля
    rock: 0xc09868, peak: 0xd8b888, water: 0x49b8e8, riverbed: 0xc4a474,
    dirt: 0xbf9a64, plaza: 0xd0b888, arenaGround: 0xe0c074,
    roadMain: 0xbfa074, roadEdge: 0x8a7350,
    treeGreens: [0x8aa86a, 0x9ab47a, 0x7a9a5a, 0xa8c084, 0x84a464], // олива — срібляста зелень
    pineGreens: [0x4f7a44, 0x5a8a4c, 0x436838],
    pineRatio: 0.2, snow: false, snowfall: false, dustfall: true,
    sparseTrees: true,
    housePalette: [0xf2dcb4, 0xf5e2c2, 0xe8cba0, 0xf2c9a4, 0xe2c49a], // теракота/охра
    roofPalette: [0xc0563b, 0xb04e34, 0xa8542f, 0xc96a3a],
    flowers: true, hay: false,
    lampGlow: 0.85,
    signText: t('СЕЛО СОНЯЧНЕ'),
  },
  // 🇮🇹 тепле середземноморське сонце Італії — теракота, кипариси, золоте світло
  italyMed: {
    skyTop: 0x3f8fe2, skyHorizon: 0xffe8c8, skyBottom: 0xdcc09c,
    fogColor: 0xf0e0c2, fogNear: 130, fogFar: 430,
    hemiSky: 0xfaecd2, hemiGround: 0xa89060, hemiIntensity: 0.98,
    sunColor: 0xfff0cc, sunIntensity: 1.97, sunPos: [78, 112, 48],
    sunDisc: 0xfff2c4, sunDiscPos: [330, 425, 235],
    grass1: 0x9eb44c, grass2: 0x86a03a, grass3: 0xb2c260, // суха золотиста тосканська трава
    rock: 0xc0986a, peak: 0xd6b886, water: 0x49b8e8, riverbed: 0xc2a474,
    dirt: 0xbf9a66, plaza: 0xd2b98a, arenaGround: 0xdcc488,
    roadMain: 0xbfa276, roadEdge: 0x8a7552,
    treeGreens: [0x6e9a4a, 0x7aa856, 0x5f8a3e, 0x88b462, 0x6e9a44],
    pineGreens: [0x2e5a3a, 0x274e32, 0x356340], // кипариси — темні й стрункі
    pineRatio: 0.46, snow: false, snowfall: false,
    sparseTrees: false,
    housePalette: [0xf2dcb4, 0xf5e2c2, 0xe8cba0, 0xf2c9a4, 0xe2c49a], // теракота/охра
    roofPalette: [0xc0563b, 0xb04e34, 0xa8542f, 0xc96a3a],
    flowers: true, hay: false,
    lampGlow: 0.85,
    signText: t('МІСТЕЧКО РИМСЬКЕ'),
  },
  // 🇹🇷 теплий вечір над Босфором
  bosphorus: {
    skyTop: 0x3f7fc4, skyHorizon: 0xffc98a, skyBottom: 0xc4a88a,
    fogColor: 0xf2d9b8, fogNear: 120, fogFar: 410,
    hemiSky: 0xf2dcc0, hemiGround: 0x8a7a52, hemiIntensity: 0.92,
    sunColor: 0xffe2b8, sunIntensity: 1.7, sunPos: [95, 75, 50],
    sunDisc: 0xffce8a, sunDiscPos: [390, 230, 250],
    grass1: 0x9cb04a, grass2: 0x7e9a3e, grass3: 0xb8c25a,
    rock: 0xb38d62, peak: 0xd9b98a, water: 0x45b7d8, riverbed: 0xc0a070,
    dirt: 0xb89a6e, plaza: 0xcaa87e, arenaGround: 0xa89072,
    roadMain: 0xb49c74, roadEdge: 0x877454,
    treeGreens: [0x6e9a3a, 0x82a848, 0x5a8a34, 0x96b052, 0x7a9a44],
    pineGreens: [0x2e5a3a, 0x254e32, 0x35663f], // кипариси — темні і стрункі
    pineRatio: 0.5, snow: false, snowfall: false,
    housePalette: [0xf5ead2, 0xf7dfc2, 0xe8d6c4, 0xf2e2cc, 0xdfd2c0],
    roofPalette: [0xb4543a, 0xa84c34, 0xc05e40, 0x96503c],
    flowers: true, hay: false,
    lampGlow: 0.9,
    signText: t('МІСТО СХІДНЕ'),
  },
  // 🇪🇬 розпечена пустеля з пірамідами
  desert: {
    skyTop: 0x4a9ce8, skyHorizon: 0xffe6b0, skyBottom: 0xe2c188,
    fogColor: 0xf2e0b4, fogNear: 110, fogFar: 390,
    hemiSky: 0xffeccc, hemiGround: 0xb89c5e, hemiIntensity: 1.0,
    sunColor: 0xfff2cc, sunIntensity: 2.0, sunPos: [60, 120, 40],
    sunDisc: 0xfff0b8, sunDiscPos: [300, 440, 220],
    grass1: 0xe2c488, grass2: 0xd4b372, grass3: 0xeed29c, // пісок замість трави
    rock: 0xc8a368, peak: 0xe0c084, water: 0x3fc8d8, riverbed: 0xd8bb80,
    dirt: 0xc9a86a, plaza: 0xd9bc86, arenaGround: 0xc4a878,
    roadMain: 0xbfa070, roadEdge: 0x8f7850,
    treeGreens: [0x5a8a3a, 0x6e9a44, 0x4f7a34], // пальмове листя
    pineGreens: [0x5a8a3a, 0x4f7a34, 0x6e9a44],
    pineRatio: 0, snow: false, snowfall: false, dustfall: true,
    palms: true, sparseTrees: true,
    housePalette: [0xefdcb4, 0xe8d2a4, 0xf2e2c0, 0xdfc89a, 0xe8d8b8],
    roofPalette: [0xc9a86a, 0xb8945a, 0xa8854e, 0xd4b274],
    flowers: false, hay: false,
    lampGlow: 1.0,
    signText: t('ОАЗА ЗОЛОТА'),
  },
  // 🌸 японська весна — рожева сакура, пастельне небо, летять пелюстки
  sakura: {
    skyTop: 0x6fb3ee, skyHorizon: 0xffe0ec, skyBottom: 0xe6cfe0,
    fogColor: 0xf2dce8, fogNear: 125, fogFar: 420,
    hemiSky: 0xfbe2ee, hemiGround: 0x9aa86a, hemiIntensity: 0.95,
    sunColor: 0xfff0f0, sunIntensity: 1.85, sunPos: [82, 100, 52],
    sunDisc: 0xffe2ea, sunDiscPos: [350, 380, 250],
    grass1: 0x7cc24c, grass2: 0x66a83c, grass3: 0x96d45e,
    rock: 0xa89a8a, peak: 0xd8ccc4, water: 0x49b8e8, riverbed: 0xb0a48f,
    dirt: 0xb09a82, plaza: 0xc8b4a8, arenaGround: 0xa89488,
    roadMain: 0xb4a496, roadEdge: 0x83746a,
    treeGreens: [0xffb7d4, 0xff9ec4, 0xffc9de, 0xf7a8cc, 0xffd0e2], // крони сакури — рожеві
    pineGreens: [0x3e7a4a, 0x356b42, 0x47885a],
    pineRatio: 0.25, snow: false, snowfall: false, leaffall: true,
    housePalette: [0xf5ece0, 0xf2dce4, 0xe8e0d4, 0xddd0e0, 0xf2e6dc],
    roofPalette: [0x8a4a4a, 0x6e4458, 0x7a4a3e, 0x5a4a5a],
    flowers: true, hay: false,
    lampGlow: 0.85,
    signText: t('СЕЛО САКУРОВЕ'),
  },
};

export const COUNTRIES = {
  UKR: {
    id: 'UKR', name: t('Україна'), flag: '🇺🇦', seed: 1377,
    lat: 49.2, lon: 31.4,
    victoryTitle: t('🇺🇦 УКРАЇНУ ЗВІЛЬНЕНО!'),
    biome: 'summer',
    map: ukraineMap,
    difficulty: { hp: 1, dmg: 1, counts: 1 },
    weaponReward: 'rifle',
    weaponRewardToast: () => t('Ти отримав АВТОМАТ! {k} — перемкнути зброю 🔥', { k: keyHint('кнопка 🔁', 'Клавіша 2') }),
    extraZombie: null,
    shieldGuards: 2,
    boss: { name: t('👑 ЗОМБІ-КОРОЛЬ БУЛЬ-БУЛЬ'), hp: 1800, frost: false, style: 'king' },
    banner: () => t('Виконай 3 завдання і переможи БОСА! ({k})', { k: keyHint('тягни джойстик до краю — біг', 'Shift — біг') }),
    food: t('вареник'),
  },
  POL: {
    id: 'POL', name: t('Польща'), flag: '🇵🇱', seed: 2025,
    lat: 52.1, lon: 19.4,
    victoryTitle: t('🇵🇱 ПОЛЬЩУ ЗВІЛЬНЕНО!'),
    biome: 'winterDusk',
    map: polandMap,
    difficulty: { hp: 1.3, dmg: 1.15, counts: 1.2 },
    weaponReward: 'shotgun',
    weaponRewardToast: () => t('Ти отримав ДРОБОВИК! {k} — зброя для ближнього бою 💥', { k: keyHint('кнопка 🔁', 'Клавіша 3') }),
    extraZombie: 'snowman',
    shieldGuards: 3,
    boss: { name: t('👑 КОРОЛЬ МОРОЗ'), hp: 2400, frost: true, style: 'frost' },
    banner: t('Зима, сніговики-зомбі та КОРОЛЬ МОРОЗ. Вперед! ❄️'),
    food: t('пончик'),
  },
  DEU: {
    id: 'DEU', name: t('Німеччина'), flag: '🇩🇪', seed: 4040,
    lat: 51.2, lon: 10.4,
    victoryTitle: t('🇩🇪 НІМЕЧЧИНУ ЗВІЛЬНЕНО!'),
    biome: 'autumnGold',
    map: germanyMap,
    difficulty: { hp: 1.55, dmg: 1.25, counts: 1.35 },
    weaponReward: 'smg',
    weaponRewardToast: () => t('Ти отримав ШВИДКОСТРІЛ! {k} — злива куль 🌀', { k: keyHint('кнопка 🔁', 'Клавіша 4') }),
    extraZombie: 'shield',
    shieldGuards: 4,
    boss: { name: t('👑 ЗАЛІЗНИЙ БАРОН'), hp: 3200, frost: false, style: 'iron' },
    banner: t('Золота осінь, автобан і армія щитоносців. Цілься в спину! 🛡️'),
    food: t('брецель'),
  },
  FRA: {
    id: 'FRA', name: t('Франція'), flag: '🇫🇷', seed: 5050,
    lat: 46.6, lon: 2.4,
    victoryTitle: t('🇫🇷 ФРАНЦІЮ ЗВІЛЬНЕНО!'),
    biome: 'provence',
    map: franceMap,
    difficulty: { hp: 1.8, dmg: 1.35, counts: 1.45 },
    weaponReward: 'sniper',
    weaponRewardToast: () => t('Ти отримав СНАЙПЕРКУ! {k} — пробиває трьох наскрізь 🎯', { k: keyHint('кнопка 🔁', 'Клавіша 6') }),
    extraZombie: 'spitter',
    shieldGuards: 3,
    boss: { name: t('👑 ШЕФ БАГЕТ'), hp: 4200, frost: false, style: 'chef' },
    banner: t('Лаванда, вежа до неба і ШЕФ БАГЕТ. Стережись черствих багетів! 🥖'),
    food: t('круасан'),
  },
  ESP: {
    id: 'ESP', name: t('Іспанія'), flag: '🇪🇸', seed: 4848,
    lat: 40.4, lon: -3.7,
    victoryTitle: t('🇪🇸 ІСПАНІЮ ЗВІЛЬНЕНО!'),
    biome: 'spainSun',
    map: spainMap,
    difficulty: { hp: 1.9, dmg: 1.37, counts: 1.48 },
    coinReward: 600,
    extraZombie: 'toro',
    shieldGuards: 3,
    boss: { name: t('👑 МАТАДОР-ЗОМБІ'), hp: 4800, frost: false, style: 'matador' },
    banner: t('Сонячна Іспанія, корида й МАТАДОР-ЗОМБІ! Стережись рогів зомбі-биків! 🐂'),
    food: t('чурос'),
  },
  ITA: {
    id: 'ITA', name: t('Італія'), flag: '🇮🇹', seed: 4949,
    lat: 41.9, lon: 12.5,
    victoryTitle: t('🇮🇹 ІТАЛІЮ ЗВІЛЬНЕНО!'),
    biome: 'italyMed',
    map: italyMap,
    difficulty: { hp: 1.95, dmg: 1.385, counts: 1.49 },
    coinReward: 600,
    extraZombie: 'gladiator',
    shieldGuards: 3,
    boss: { name: t('👑 ЦЕЗАР-ЗОМБІ'), hp: 5400, frost: false, style: 'gladiator' },
    banner: t('Стародавній Рим, Колізей і БОС-ГЛАДІАТОР! Стережись мечів зомбі-гладіаторів! 🛡️'),
    food: t('піца'),
  },
  TUR: {
    id: 'TUR', name: t('Туреччина'), flag: '🇹🇷', seed: 6060,
    lat: 39.0, lon: 35.2,
    victoryTitle: t('🇹🇷 ТУРЕЧЧИНУ ЗВІЛЬНЕНО!'),
    biome: 'bosphorus',
    map: turkeyMap,
    difficulty: { hp: 2.0, dmg: 1.4, counts: 1.5 },
    weaponReward: 'magnum',
    weaponRewardToast: () => t('Ти отримав МАГНУМ! {k} — один постріл, один зомбі 🤠', { k: keyHint('кнопка 🔁', 'Клавіша 5') }),
    extraZombie: 'gunner',
    shieldGuards: 4,
    boss: { name: t('👑 ПАША КЕБАБ'), hp: 6000, frost: false, style: 'sultan' },
    banner: t('Великий базар, повітряні кулі і ПАША КЕБАБ. Стережись шампурів! 🍢'),
    food: t('лукум'),
  },
  SWE: {
    id: 'SWE', name: t('Швеція'), flag: '🇸🇪', seed: 6565,
    lat: 60.1, lon: 18.6,
    victoryTitle: t('🇸🇪 ШВЕЦІЮ ЗВІЛЬНЕНО!'),
    biome: 'winterDusk',
    map: polandMap,
    difficulty: { hp: 2.1, dmg: 1.42, counts: 1.52 },
    coinReward: 700,
    extraZombie: 'snowman',
    shieldGuards: 4,
    boss: { name: t('👑 СНІГОВИЙ ЯРЛ'), hp: 6400, frost: true, style: 'frost' },
    banner: t('Північний холод, сніговики-зомбі і СНІГОВИЙ ЯРЛ. Тримайся тепліше! ❄️'),
    food: t('булочка з корицею'),
  },
  EGY: {
    id: 'EGY', name: t('Єгипет'), flag: '🇪🇬', seed: 7070,
    lat: 26.6, lon: 30.2,
    victoryTitle: t('🇪🇬 ЄГИПЕТ ЗВІЛЬНЕНО!'),
    biome: 'desert',
    map: egyptMap,
    difficulty: { hp: 2.25, dmg: 1.45, counts: 1.55 },
    weaponReward: 'bazooka',
    weaponRewardToast: () => t('Ти отримав БАЗУКУ ФАРАОНА! {k} — рознеси їх усіх 🚀', { k: keyHint('кнопка 🔁', 'Клавіша 7') }),
    extraZombie: 'mummy',
    shieldGuards: 3,
    boss: { name: t('👑 ФАРАОН ТУТ-АНХ-ЗОМБ'), hp: 6800, frost: false, style: 'pharaoh' },
    banner: t('Піраміди, мумії і сам ФАРАОН. Кусючі скарабеї літають! 🪲'),
    food: t('фінік'),
  },
  JPN: {
    id: 'JPN', name: t('Японія'), flag: '🇯🇵', seed: 8080,
    lat: 36.2, lon: 138.3,
    victoryTitle: t('🇯🇵 ЯПОНІЮ ЗВІЛЬНЕНО!'),
    biome: 'sakura',
    map: japanMap,
    difficulty: { hp: 2.4, dmg: 1.48, counts: 1.58 },
    coinReward: 800,
    extraZombie: 'samurai',
    shieldGuards: 4,
    boss: { name: t('👑 СУМО-ЗОМБІ'), hp: 7200, frost: false, style: 'sumo' },
    banner: t('Сакура, ворота торії й СУМО-ЗОМБІ! Стережись велетенського борця! 🌸'),
    food: t('онігірі'),
  },
};

export const CAMPAIGN_ORDER = ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN'];

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

// Чи відкрита країна для гри: Україна — завжди перша,
// після її звільнення відкривається ВЕСЬ світ (грай у будь-якому порядку)
export function isCountryOpen(liberated, id) {
  if (!COUNTRIES[id]) return false;
  return id === 'UKR' || !!(liberated && liberated.UKR);
}
