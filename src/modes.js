// 🗺️ Таблиці режимів гри (групи, правила, мутатори, старт-опції, соло-режими, віхи).
// v305: винесено ВЕРБАТИМ із src/main.js (рядки ~183–464) — суто структурний розпил.
import { t } from './i18n.js';
import { CAMPAIGN_ORDER } from './countries.js';
import { hasLiberated } from './net/cloudsave.js';
import { CHAPTER2_UNLOCK_COUNTRIES } from './chapter.js';
import { KNOCKOUT_UNLOCK_LEVEL, OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES } from './knockout.js';
import { DEFENSE_UNLOCK_COUNTRIES, OVERLOADED_DEFENSE_UNLOCK_COUNTRIES, ZONE_DEFENSE_UNLOCK_COUNTRIES } from './defense.js';
import { TURRETWAR_UNLOCK_COUNTRIES } from './turretwar.js';
import { PVP_UNLOCK_COUNTRIES, OVERLOADED_PVP_UNLOCK_COUNTRIES } from './pvp.js';
import { BANK_UNLOCK_COUNTRIES } from './bank.js';
import { PORTAL_UNLOCK_COUNTRIES } from './portal.js';
import { MAZE_UNLOCK_COUNTRIES } from './maze.js';
import { HUMANS_UNLOCK_COUNTRIES, OVERLOADED_HUMANS_UNLOCK_COUNTRIES } from './humans.js';
import { SOUL_COLLECTOR_UNLOCK_LEVEL } from './souls.js';
import { WORLD_BOSS_MIN_COUNTRIES } from './worldboss.js';
import { RADIATION_UNLOCK_COUNTRIES } from './radiationmode.js';

// Чотири категорії каталогу; складні варіанти живуть тумблером 💀 на базовій картці.
export const SOLO_MODE_GROUPS = [
  { id: 'story', title: () => t('СЮЖЕТ'), ids: ['campaign', 'infected', 'chapter3'] },
  { id: 'operations', title: () => t('ОПЕРАЦІЇ'), ids: ['expedition', 'community', 'defense', 'zone-defense', 'portal', 'turretwar', 'worldboss'] },
  { id: 'challenges', title: () => t('ВИПРОБУВАННЯ'), ids: ['storm', 'arena', 'radiation', 'maze', 'soul-collector'] },
  { id: 'arcade', title: () => t('АРКАДА'), ids: ['pvp', 'knockout', 'humans', 'bank'] },
];

// 💀 базовий режим → його «перегружений» варіант (кнопка на картці)
export const HARD_VARIANTS = {
  knockout: 'overloaded-knockout',
  defense: 'overloaded-defense',
  pvp: 'overloaded-pvp',
  humans: 'overloaded-humans',
};

export const MODE_RULES = {
  campaign: {},
  infected: {},
  storm: { noShop: true },
  arena: {},
  worldboss: { noShop: true },
  radiation: { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  knockout: { noGadgets: true, noShop: true, noBuffs: true, noZombiePickups: true },
  'friendly-knockout': { noGadgets: true, noShop: true, noBuffs: true, noZombiePickups: true },
  'overloaded-knockout': { noGadgets: true, noShop: true, noBuffs: true, noZombiePickups: true },
  defense: { noGadgets: true, noShop: true, noBuffs: true, noZombiePickups: true },
  'friendly-defense': { noGadgets: true, noShop: true, noBuffs: true, noZombiePickups: true },
  'overloaded-defense': { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  'zone-defense': { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  'friendly-zone-defense': { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  turretwar: { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  pvp: { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  'overloaded-pvp': { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  bank: { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  portal: { noGadgets: true, noShop: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  maze: { noShop: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  humans: { noGadgets: true, noShop: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  'overloaded-humans': { noGadgets: true, noShop: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
  'soul-collector': { noGadgets: true, noShop: true, noBuffs: true, noPickups: true, noZombiePickups: true, noCoinDrops: true },
};

// 🎲 подієвий мутатор тижня. weeklyMod лишається campaign-only для правил/орди,
// а weeklyMutator нижче вмикає глобальні solo-ефекти через Zombies.spawn.
// rules — спред у modeRules; night/horde — точкові хуки (_updateDayNight / _updateHordeWaves).
// «бос-сюрприз» свідомо ВИКИНУТО: смерть будь-якого 'boss' у кампанії тригерить
// перемогу країни (_onBossDied → _showVictory) — потрібна окрема механіка міні-боса.
export const MODIFIERS = {
  night: { icon: '🌙', name: () => t('Нічний рейд'), night: true },
  noshop: { icon: '🚫', name: () => t('Без магазину'), rules: { noShop: true } },
  horde: { icon: '🧟', name: () => t('Навала'), horde: true },
  tough: { icon: '🦾', name: () => t('Живучий тиждень'), zMul: { hp: 1.35 } },
  swift: { icon: '⚡', name: () => t('Швидкий тиждень'), zMul: { speed: 1.25 } },
  elite: { icon: '👿', name: () => t('Елітний тиждень'), eliteChance: 0.15 },
};
export const WEEKLY_MODIFIER_POOL = ['night', 'tough', 'swift', 'elite'];

export function modeIdFromOpts(opts, worldBossId) {
  if (worldBossId) return 'worldboss';
  if (opts.radiation) return 'radiation';
  if (opts.storm) return 'storm';
  if (opts.arena) return 'arena';
  if (opts.knockout) return opts.knockout === 'overloaded' ? 'overloaded-knockout' : opts.knockout === 'friendly' ? 'friendly-knockout' : 'knockout';
  if (opts.defense) {
    if (opts.defense === 'overloaded') return 'overloaded-defense';
    if (opts.defense === 'zone') return 'zone-defense';
    if (opts.defense === 'friendly') return 'friendly-defense';
    if (opts.defense === 'zone-friendly') return 'friendly-zone-defense';
    return 'defense';
  }
  if (opts.pvp) return opts.pvp === 'overloaded' ? 'overloaded-pvp' : 'pvp';
  if (opts.bank) return 'bank';
  if (opts.portal) return 'portal';
  if (opts.maze) return 'maze';
  if (opts.humans) return opts.humans === 'overloaded' ? 'overloaded-humans' : 'humans';
  if (opts.soulCollector) return 'soul-collector';
  if (opts.turretwar) return 'turretwar';
  return opts.infected ? 'infected' : 'campaign';
}

export const MODE_START_OPTS = {
  campaign: () => ({}),
  infected: () => ({ infected: true }),
  storm: () => ({ storm: true }),
  arena: () => ({ arena: true }),
  worldboss: (id) => ({ worldBoss: id }),
  radiation: () => ({ radiation: true }),
  knockout: () => ({ knockout: true }),
  'friendly-knockout': () => ({ knockout: 'friendly' }),
  'overloaded-knockout': () => ({ knockout: 'overloaded' }),
  defense: () => ({ defense: true }),
  'friendly-defense': () => ({ defense: 'friendly' }),
  'overloaded-defense': () => ({ defense: 'overloaded' }),
  'zone-defense': () => ({ defense: 'zone' }),
  'friendly-zone-defense': () => ({ defense: 'zone-friendly' }),
  pvp: () => ({ pvp: true }),
  'overloaded-pvp': () => ({ pvp: 'overloaded' }),
  bank: () => ({ bank: true }),
  portal: () => ({ portal: true }),
  maze: () => ({ maze: true }),
  humans: () => ({ humans: true }),
  'overloaded-humans': () => ({ humans: 'overloaded' }),
  'soul-collector': () => ({ soulCollector: true }),
  turretwar: () => ({ turretwar: true }),
};

export const SOLO_MODES = [
  {
    id: 'expedition', icon: '🧭', name: () => t('ЕКСПЕДИЦІЯ'),
    locked: () => false,
    desc: () => t('Особлива багаторівнева операція з власним маршрутом і збіркою.'),
    start: (game) => game.openExpedition(),
  },
  {
    // 🏘️ v700: карти гравців доступні всім — редактор для проходження не потрібен
    id: 'community', icon: '🏘️', name: () => t('ОПЕРАЦІЇ СПІЛЬНОТИ'),
    locked: () => false,
    desc: () => t('Карти інших гравців: тиждень, нові, популярні — і твої власні.'),
    start: (game) => game.community.open(),
  },
  {
    id: 'campaign', icon: '🎯', name: () => t('КАМПАНІЯ'), picker: 'campaign',
    locked: () => false,
    desc: () => t('Звільняй країни світу: місії, боси, нагороди'),
    start: (game, countryId = 'UKR') => game.startLevel(countryId),
  },
  {
    id: 'infected', icon: '🧟', name: () => t('ГЛАВА 2'), picker: 'infected',
    locked: ({ libN }) => libN < CHAPTER2_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < CHAPTER2_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: CHAPTER2_UNLOCK_COUNTRIES, c: libN })
      : t('Заражені країни: темніше, складніше, нагорода за очищення.'),
    start: (game, countryId) => game.startInfected(countryId),
  },
  {
    id: 'chapter3', icon: '🧪', name: () => t('ГЛАВА 3'),
    locked: ({ game }) => !(game.save.infected && game.save.infected.done && hasLiberated(game.save.liberated, 'LOST')),
    desc: ({ game }) => (game.save.infected && game.save.infected.done && hasLiberated(game.save.liberated, 'LOST'))
      ? (hasLiberated(game.save.liberated, 'LAB')
        ? t('Лігво Вірусу зачинено! Можна перепройти — Слизняк скучив 🟢')
        : t('Знайди Лігво Вірусу: неонова лабораторія і МЕГА-СЛИЗНЯК!'))
      : t('Відкриється після Глави 2 і Острова Динозаврів'),
    start: (game) => game.startChapter3(),
  },
  {
    id: 'storm', icon: '⛈️', name: () => t('ШТОРМ'), picker: 'storm',
    locked: ({ libN }) => libN < 1,
    desc: ({ libN }) => libN < 1 ? t('Відкриється після першої звільненої країни') : t('Виживи у колі, що звужується. Рекорд — у Лігу!'),
    start: (game, countryId) => game.startStorm(countryId),
  },
  {
    id: 'arena', icon: '👑', name: () => t('АРЕНА БОСІВ'),
    locked: ({ libN }) => libN < 2,
    desc: ({ libN }) => libN < 2 ? t('Відкриється після двох звільнених країн') : t('Усі {n} босів поспіль на час. Час — у Лігу!', { n: CAMPAIGN_ORDER.length }),
    start: (game) => game.startArena(),
  },
  {
    id: 'worldboss', icon: '🌋', name: () => t('СВІТОВІ БОСИ'), picker: 'worldboss',
    locked: ({ libN }) => libN < WORLD_BOSS_MIN_COUNTRIES,
    desc: ({ libN }) => libN < WORLD_BOSS_MIN_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: WORLD_BOSS_MIN_COUNTRIES, c: libN })
      : t('Великі боси з окремими механіками і разовими нагородами.'),
    start: (game, id) => game.startWorldBoss(id),
  },
  {
    id: 'radiation', icon: '☢️', name: () => t('РАДІАЦІЯ'),
    locked: ({ libN }) => libN < RADIATION_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < RADIATION_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: RADIATION_UNLOCK_COUNTRIES, c: libN })
      : t('Кімната 50×50: 50 HP, дробовик з 10 патронами, один радіаційний зомбі. Перемога: +50 монет радіації.'),
    start: (game) => game.startRadiation(),
  },
  {
    id: 'knockout', icon: '🥊', name: () => t('НОКАУТ'),
    locked: ({ game }) => game.progress.level < KNOCKOUT_UNLOCK_LEVEL,
    desc: ({ game }) => game.progress.level < KNOCKOUT_UNLOCK_LEVEL
      ? t('Відкриється на {n} рівні Зоряного шляху (твій: {c})', { n: KNOCKOUT_UNLOCK_LEVEL, c: game.progress.level })
      : t('Кімната 33×33, 10 зомбі, тільки пістолет. Перемога може дати Посох!'),
    start: (game) => game.startKnockout(),
  },
  {
    id: 'soul-collector', icon: '👻', name: () => t('Збирач душ'),
    locked: ({ game }) => game.progress.level < SOUL_COLLECTOR_UNLOCK_LEVEL,
    desc: ({ game }) => game.progress.level < SOUL_COLLECTOR_UNLOCK_LEVEL
      ? t('Відкриється на {n} рівні Зоряного шляху (твій: {c})', { n: SOUL_COLLECTOR_UNLOCK_LEVEL, c: game.progress.level })
      : t('Кімната 100×100, 20 привидів, тільки посох. Перемога: +3 душі.'),
    start: (game) => game.startSoulCollector(),
  },
  {
    id: 'overloaded-knockout', icon: '💥', name: () => t('Перегружений нокаут'),
    locked: ({ libN }) => libN < OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES, c: libN })
      : t('Кімната 33×33, 20 зомбі, у тебе 150 HP і тільки пістолет.'),
    start: (game) => game.startOverloadedKnockout(),
  },
  {
    id: 'zone-defense', icon: '⭕', name: () => t('Оборона в зоні'),
    locked: ({ libN }) => libN < ZONE_DEFENSE_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < ZONE_DEFENSE_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: ZONE_DEFENSE_UNLOCK_COUNTRIES, c: libN })
      : t('Коло 30 метрів: протримайся 125 секунд із посохом і пістолетом.'),
    start: (game) => game.startZoneDefense(),
  },
  {
    id: 'defense', icon: '🛡️', name: () => t('ОБОРОНА'),
    locked: ({ libN }) => libN < DEFENSE_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < DEFENSE_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: DEFENSE_UNLOCK_COUNTRIES, c: libN })
      : t('Кімната 120×120, вежа 250 HP, пістолет і автомат.'),
    start: (game) => game.startDefense(),
  },
  {
    id: 'turretwar', icon: '🗼', name: () => t('ОБОРОНА ТУРЕЛІ'),
    locked: ({ libN }) => libN < TURRETWAR_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < TURRETWAR_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: TURRETWAR_UNLOCK_COUNTRIES, c: libN })
      : t('Твоя турель проти зомбі-турелі: роботи 1000 HP, хвилі зомбі, тільки 🔨 молот!'),
    start: (game) => game.startTurretWar(),
  },
  {
    id: 'overloaded-defense', icon: '🏰', name: () => t('Перегружена оборона'),
    locked: ({ libN }) => libN < OVERLOADED_DEFENSE_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < OVERLOADED_DEFENSE_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: OVERLOADED_DEFENSE_UNLOCK_COUNTRIES, c: libN })
      : t('3 хвилі: вежа 500 HP, гравець 250 HP, зомбі 234 HP.'),
    start: (game) => game.startOverloadedDefense(),
  },
  {
    id: 'overloaded-pvp', icon: '💣', name: () => t('Перегружене ПВП'),
    locked: ({ libN }) => libN < OVERLOADED_PVP_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < OVERLOADED_PVP_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: OVERLOADED_PVP_UNLOCK_COUNTRIES, c: libN })
      : t('Дуель 35×35: гармата, меч і щити проти зомбі 3000 HP.'),
    start: (game) => game.startOverloadedPvp(),
  },
  {
    id: 'bank', icon: '🏦', name: () => t('БАНК'),
    locked: ({ libN }) => libN < BANK_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < BANK_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: BANK_UNLOCK_COUNTRIES, c: libN })
      : t('Кімната 200×50: захисти свій банк і знищ банк зомбі.'),
    start: (game) => game.startBank(),
  },
  {
    id: 'portal', icon: '🌀', name: () => t('ПОРТАЛ'),
    locked: ({ libN }) => libN < PORTAL_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < PORTAL_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: PORTAL_UNLOCK_COUNTRIES, c: libN })
      : t('Закрий 3 портали, поки вони випускають хвилі зомбі.'),
    start: (game) => game.startPortal(),
  },
  {
    id: 'maze', icon: '🧩', name: () => t('ЛАБІРИНТ'),
    locked: ({ libN }) => libN < MAZE_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < MAZE_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: MAZE_UNLOCK_COUNTRIES, c: libN })
      : t('Знайди 3 ключі, відкрий вихід і виживи у коридорах.'),
    start: (game) => game.startMaze(),
  },
  {
    id: 'humans', icon: '⚔️', name: () => t('ЗОМБІ ПРОТИ ЛЮДЕЙ'),
    locked: ({ libN }) => libN < HUMANS_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < HUMANS_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: HUMANS_UNLOCK_COUNTRIES, c: libN })
      : t('30 клонів проти 65 зомбі і робота. Командуй армією!'),
    start: (game) => game.startHumans(),
  },
  {
    id: 'overloaded-humans', icon: '💥', name: () => t('Перегружена зомбі проти людей'),
    locked: ({ libN }) => libN < OVERLOADED_HUMANS_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < OVERLOADED_HUMANS_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: OVERLOADED_HUMANS_UNLOCK_COUNTRIES, c: libN })
      : t('45 клонів, 5 стрільців, 125 зомбі, 5 боксерів і робот 1795 HP.'),
    start: (game) => game.startOverloadedHumans(),
  },
  {
    id: 'pvp', icon: '⚔️', name: () => t('ПВП'),
    locked: ({ libN }) => libN < PVP_UNLOCK_COUNTRIES,
    desc: ({ libN }) => libN < PVP_UNLOCK_COUNTRIES
      ? t('Відкриється після {n} звільнених країн (у тебе: {c})', { n: PVP_UNLOCK_COUNTRIES, c: libN })
      : t('Дуель 30×30: посох проти зомбі на 250 HP.'),
    start: (game) => game.startPvp(),
  },
];

// 🎯 «Випробування дня»: один кімнатний режим на день дає подвійну нагороду
export const DAILY_CHALLENGE_POOL = ['knockout', 'defense', 'zone-defense', 'pvp', 'bank', 'portal', 'maze', 'humans', 'soul-collector', 'radiation', 'turretwar'];
// 🏅 віхи перемог у кожному режимі (титул на 10 перемог відкриває syncTitles сам)
export const MODE_MILESTONES = [
  { wins: 3, crystals: 10 },
  { wins: 25, crystals: 30 },
];
