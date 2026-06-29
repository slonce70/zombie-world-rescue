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
};

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
