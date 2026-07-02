import { t } from './i18n.js';

export const TITLES = {
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
