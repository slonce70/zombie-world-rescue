import { t } from './i18n.js';
import { xpForLevel, PASS_MAX_LEVEL } from './progress.js';

// сумарний XP, потрібний для фінального рівня Зоряного шляху (титул «Зоряний гравець»)
let XP_PASS_CAP = 0;
for (let l = 1; l < PASS_MAX_LEVEL; l++) XP_PASS_CAP += xpForLevel(l);

export const TITLES = {
  star_player: {
    icon: '🌟',
    name: () => t('Зоряний гравець'),
    desc: () => t('Пройди Зоряний шлях до кінця'),
    detail: () => t('Відкривається на {n} рівні Зоряного шляху', { n: PASS_MAX_LEVEL }),
    unlocked: (s) => ((s.xp | 0) >= XP_PASS_CAP),
  },
  zombie_killer: {
    icon: '🧟',
    name: () => t('Зомбі кілер'),
    desc: () => t('Вбий 555 зомбі'),
    detail: () => t('Відкривається за 555 вбитих зомбі'),
    unlocked: (s) => ((s.stats && s.stats.killed) | 0) >= 555,
  },
  zero_coins: {
    icon: '🪙',
    name: () => t('0 монет'),
    desc: () => t('Витрать 50000 монет'),
    detail: () => t('Відкривається за 50000 витрачених монет'),
    unlocked: (s) => ((s.stats && s.stats.coinsSpent) | 0) >= 50000,
  },
  clone_army: {
    icon: '🧍',
    name: () => t('Армія клонів'),
    desc: () => t('Використай Клон 35 разів'),
    detail: () => t('Відкривається за 35 використань гаджета Клон'),
    unlocked: (s) => ((s.stats && s.stats.cloneUses) | 0) >= 35,
  },
  tyrant: {
    icon: '👑',
    name: () => t('Тиран'),
    desc: () => t('Нанеси 50000 шкоди'),
    detail: () => t('Відкривається за 50000 шкоди по ворогах'),
    unlocked: (s) => ((s.stats && s.stats.damageDealt) | 0) >= 50000,
  },
  gadget_king: {
    icon: '🧰',
    name: () => t('Король гаджетів'),
    desc: () => t('Використай гаджети 100 разів'),
    detail: () => t('Відкривається за 100 використань будь-яких гаджетів'),
    unlocked: (s) => ((s.stats && s.stats.gadgetUses) | 0) >= 100,
  },
  infection_cleaner: {
    icon: '🧪',
    name: () => t('Очищувач'),
    desc: () => t('Очисти заражену країну'),
    detail: () => t('Відкривається за першу перемогу в Главі 2'),
    unlocked: (s) => Object.keys((s.infected && s.infected.cleared) || {}).length >= 1,
  },
  ghost: {
    icon: '👻',
    name: () => t('Привид'),
    desc: () => t('Досягни 5 рівня Шляху душ'),
    detail: () => t('Відкривається на 5 рівні Шляху душ'),
    unlocked: (s) => ((s.soulLevel || 1) | 0) >= 5,
  },
  radiation_player: {
    icon: '☢️',
    name: () => t('Радіаційний гравець'),
    desc: () => t('Мега-квест: переможи Боса Радіації 5 разів'),
    detail: () => t('Нагорода за мега-квест Боса Радіації'),
    unlocked: (s) => (s.titles || []).includes('radiation_player'),
  },
  // 🌟 титули за «Пожертву рятівника»: чим більше донацій, тим вищий титул
  generous_rescuer: {
    icon: '🌟',
    name: () => t('Щедрий рятівник'),
    desc: () => t('Зроби 5 пожертв рятівнику'),
    detail: () => t('Відкривається за 5 пожертв рятівнику'),
    unlocked: (s) => ((s.donations | 0) >= 5),
  },
  golden_heart: {
    icon: '💛',
    name: () => t('Золоте серце'),
    desc: () => t('Зроби 10 пожертв рятівнику'),
    detail: () => t('Відкривається за 10 пожертв рятівнику'),
    unlocked: (s) => ((s.donations | 0) >= 10),
  },
  fund_legend: {
    icon: '🏛️',
    name: () => t('Легенда фонду'),
    desc: () => t('Зроби 25 пожертв рятівнику'),
    detail: () => t('Відкривається за 25 пожертв рятівнику'),
    unlocked: (s) => ((s.donations | 0) >= 25),
  },
};

// 🏅 титули за 10 перемог у соло-режимах (лічильник — save.modeWins)
const MODE_TITLES = [
  ['knockout_champ', 'knockout', '🥊', 'Король рингу', 'Нокаут'],
  ['defense_wall', 'defense', '🗼', 'Незламний захисник', 'Оборона'],
  ['zone_master', 'zone-defense', '⭕', 'Господар зони', 'Оборона в зоні'],
  ['duelist', 'pvp', '⚔️', 'Дуелянт', 'ПВП'],
  ['bank_guard', 'bank', '🏦', 'Охоронець банку', 'Банк'],
  ['portal_closer', 'portal', '🌀', 'Закривач порталів', 'Портал'],
  ['maze_master', 'maze', '🧩', 'Майстер лабіринту', 'Лабіринт'],
  ['clone_general', 'humans', '🧍', 'Генерал клонів', 'Зомбі проти людей'],
  ['turret_marshal', 'turretwar', '🔨', 'Маршал турелі', 'Оборона турелі'],
];
for (const [id, modeId, icon, name, modeName] of MODE_TITLES) {
  TITLES[id] = {
    icon,
    name: () => t(name),
    desc: () => t('10 перемог: {m}', { m: t(modeName) }),
    detail: () => t('Відкривається за 10 перемог у режимі «{m}»', { m: t(modeName) }),
    unlocked: (s) => ((s.modeWins && s.modeWins[modeId]) | 0) >= 10,
  };
}

export function syncTitles(save) {
  if (!save || typeof save !== 'object') return false;
  if (!Array.isArray(save.titles)) save.titles = [];
  let changed = false;
  for (const [id, meta] of Object.entries(TITLES)) {
    if (meta.unlocked(save) && !save.titles.includes(id)) {
      save.titles.push(id);
      changed = true;
    }
  }
  if (save.activeTitle && (!TITLES[save.activeTitle] || !save.titles.includes(save.activeTitle))) {
    save.activeTitle = null;
    changed = true;
  }
  return changed;
}

export function titleName(id) {
  return TITLES[id] ? TITLES[id].name() : '';
}
