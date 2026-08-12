// 🗓️ Сезон: ланцюжок із 12 сходинок на 6 тижнів, який ВОДИТЬ ГРАВЦЯ ПО РЕЖИМАХ.
// Після v710 усі режими відкриті — сезон дає причину туди заходити.
//
// Чистий модуль без DOM, THREE і мережі (як weeklycamp.js і rotation.js).
// Червоні лінії дитячої гри: сходинка НЕ згорає (кінець сезону не спалює незабране —
// нагорода лишається доступною), нової валюти немає, купити прогрес не можна.
//
// Прогрес рахується з ІСНУЮЧИХ лічильників сейва (modeWins, liberated, stats, friends):
// власного трекінгу подій сезон не заводить — інакше з'явився б другий облік того самого.
import { t } from './i18n.js';
import { liberatedCount } from './net/cloudsave.js';

export const SEASON_WEEKS = 6;
export const SEASON_STEPS = 12;
// 📅 тиждень релізу v730 = початок Сезону 1. Без епохи номер рахувався б від
// абсолютного _weekIndex() і дитина бачила б «Сезон 17950».
export const SEASON_EPOCH_WEEK = 107697;

// Пул завдань. metric — звідки читати поточне значення в сейві.
// Кожне веде в СВІЙ режим, щоб сезон розганяв гравця по каталогу, а не по одному місцю.
//
// Формулювання: заголовок пишеться під СВІЙ target (title завжди кличеться як
// def.title(def.target)), тому сходинки на одну перемогу просто не показують число —
// дитина читає живу фразу, а не «1 раз(и)». Міняєш target — переписуй і фразу.
export const SEASON_POOL = [
  { id: 'knockout1', icon: '🥊', metric: 'mode', mode: 'knockout', target: 1, title: () => t('Виграй бій у Нокауті') },
  { id: 'defense1', icon: '🛡️', metric: 'mode', mode: 'defense', target: 1, title: () => t('Витримай Оборону') },
  { id: 'zone2', icon: '⭕', metric: 'mode', mode: 'zone-defense', target: 2, title: (n) => t('Утримай зону {n} рази', { n }) },
  { id: 'portal1', icon: '🌀', metric: 'mode', mode: 'portal', target: 1, title: () => t('Закрий портали') },
  { id: 'maze1', icon: '🧩', metric: 'mode', mode: 'maze', target: 1, title: () => t('Пройди Лабіринт') },
  { id: 'bank1', icon: '🏦', metric: 'mode', mode: 'bank', target: 1, title: () => t('Захисти Банк') },
  { id: 'pvp1', icon: '⚔️', metric: 'mode', mode: 'pvp', target: 1, title: () => t('Виграй дуель') },
  { id: 'turretwar1', icon: '🗼', metric: 'mode', mode: 'turretwar', target: 1, title: () => t('Захисти турель від зомбі') },
  { id: 'radiation1', icon: '☢️', metric: 'mode', mode: 'radiation', target: 1, title: () => t('Виживи в Радіації') },
  { id: 'humans1', icon: '🧍', metric: 'mode', mode: 'humans', target: 1, title: () => t('Приведи людей до перемоги') },
  { id: 'souls1', icon: '👻', metric: 'mode', mode: 'soul-collector', target: 1, title: () => t('Збери душі') },
  { id: 'storm1', icon: '⛈️', metric: 'mode', mode: 'storm', target: 1, title: () => t('Переживи Шторм') },
  { id: 'country1', icon: '🌍', metric: 'liberated', target: 1, title: (n) => t('Звільни {n} країну', { n }) },
  { id: 'kills300', icon: '🧟', metric: 'kills', target: 300, title: (n) => t('Переможи {n} зомбі', { n }) },
  { id: 'friend1', icon: '🤝', metric: 'friends', target: 1, title: (n) => t('Визволь {n} друга з клітки', { n }) },
  { id: 'arena1', icon: '👑', metric: 'mode', mode: 'arena', target: 1, title: () => t('Пройди Арену босів') },
];

// 💎 нагорода сходинки: росте до кінця сезону, кожна четверта дає яйце петса
export function stepReward(step) {
  const i = Math.max(0, Math.min(SEASON_STEPS - 1, step | 0));
  const last = i === SEASON_STEPS - 1;
  return {
    crystals: last ? 40 : 5 + i,
    eggs: (i + 1) % 4 === 0 ? 1 : 0,
    xp: 100 + i * 25,
    title: last ? 'season_hero' : null,
  };
}

export function seasonIndex(weekIndex) {
  const week = Number.isFinite(Number(weekIndex)) ? Number(weekIndex) : SEASON_EPOCH_WEEK;
  return Math.max(0, Math.floor((week - SEASON_EPOCH_WEEK) / SEASON_WEEKS));
}

// 12 сходинок сезону: детерміновано від його номера, однакові в усіх гравців.
// Пул 16 і крок 5 (взаємно прості з 16) дають різні набори щосезону без повторів усередині.
export function seasonSteps(seasonIdx) {
  const n = SEASON_POOL.length;
  const idx = (Number.isFinite(Number(seasonIdx)) ? Math.trunc(Number(seasonIdx)) : 0);
  const start = ((idx * 7) % n + n) % n;
  const out = [];
  for (let i = 0; i < SEASON_STEPS; i++) out.push(SEASON_POOL[(start + i * 5) % n]);
  return out;
}

const metricValue = (save, def) => {
  if (!save) return 0;
  if (def.metric === 'mode') return (save.modeWins && save.modeWins[def.mode]) | 0;
  if (def.metric === 'liberated') return liberatedCount(save.liberated);
  if (def.metric === 'kills') return (save.stats && save.stats.killed) | 0;
  if (def.metric === 'friends') return Object.values(save.friends || {}).filter(Boolean).length;
  return 0;
};

// Скільки набрано ЗА сезон: поточний лічильник мінус знімок на старті сезону.
const gainedIn = (save, base, def) => Math.max(0, metricValue(save, def) - ((base[def.id] | 0) || 0));

// Знімок лічильників на старті сезону: прогрес рахується ВІД нього, тож старі
// перемоги не закривають сходинки наперед.
export function ensureSeason(save, weekIndex) {
  if (!save) return null;
  const index = seasonIndex(weekIndex);
  const current = save.season && typeof save.season === 'object' && !Array.isArray(save.season)
    ? save.season : null;
  if (current && (current.i | 0) === index && current.base && typeof current.base === 'object') {
    if (!Array.isArray(current.claimed)) current.claimed = [];
    return current;
  }
  // Сходинка НЕ згорає (шапка модуля): як у weeklycamp.ensureWeeklyCamp, сезон із
  // виконаною й НЕзабраною сходинкою не змінюється — нагорода чекає на клейм.
  // Забрані сходинки не тримають сезон: після останнього клейму він котиться далі.
  if (current && current.base && typeof current.base === 'object') {
    if (!Array.isArray(current.claimed)) current.claimed = [];
    const claimed = new Set(current.claimed);
    const pending = seasonSteps(current.i | 0)
      .some((def) => !claimed.has(def.id) && gainedIn(save, current.base, def) >= def.target);
    if (pending) return current;
  }
  const base = {};
  for (const def of seasonSteps(index)) base[def.id] = metricValue(save, def);
  save.season = { i: index, base, claimed: [] };
  return save.season;
}

export function seasonState(save, weekIndex) {
  const season = ensureSeason(save, weekIndex);
  const claimed = new Set((season.claimed || []).filter((id) => typeof id === 'string'));
  const steps = seasonSteps(season.i).map((def, i) => {
    const gained = gainedIn(save, season.base, def);
    const progress = Math.min(def.target, gained);
    return {
      i,
      id: def.id,
      icon: def.icon,
      title: def.title(def.target),
      target: def.target,
      progress,
      done: progress >= def.target,
      claimed: claimed.has(def.id),
      reward: stepReward(i),
    };
  });
  return {
    index: season.i,
    steps,
    // наступна дія для компаса: незакрита сходинка або незабрана нагорода
    next: steps.find((s) => s.done && !s.claimed) || steps.find((s) => !s.done) || null,
    claimable: steps.filter((s) => s.done && !s.claimed).length,
  };
}

// Забрати нагороду сходинки. Повертає опис нагороди або null — видача живе в main.js.
export function claimSeasonStep(save, weekIndex, stepId) {
  const state = seasonState(save, weekIndex);
  const step = state.steps.find((s) => s.id === stepId);
  if (!step || !step.done || step.claimed) return null;
  save.season.claimed = [...new Set([...(save.season.claimed || []), stepId])];
  return { ...step.reward, step: step.i, id: step.id };
}
