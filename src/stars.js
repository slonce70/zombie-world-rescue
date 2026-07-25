// ⭐ R3 (v289) «Зірки та милосердя»: 3 зірки за кожну країну кампанії.
// Спільна логіка для main.js (нарахування/пороги), titles.js (титул за 36⭐) і тестів.
//  ⭐1 — перемога (бос упав)
//  ⭐2 — вторинна ціль забігу (1 випадкова, data-driven, показана на HUD)
//  ⭐3 — забіг без жодної смерті
// Зберігаються як save.stars = { UKR: 0..3, ... } (лише країни CAMPAIGN_ORDER; LAB/LOST — ні).
import { t } from './i18n.js';
import { CAMPAIGN_ORDER } from './countries.js';

export const STARS_PER_COUNTRY = 3;
export const CAMPAIGN_STAR_MAX = CAMPAIGN_ORDER.length * STARS_PER_COUNTRY; // 12×3 = 36

const clampStar = (v) => {
  const n = v | 0;
  return n < 0 ? 0 : n > STARS_PER_COUNTRY ? STARS_PER_COUNTRY : n;
};

// зірки конкретної країни (0..3), безпечно для будь-якого сейва
export function countryStars(save, id) {
  return clampStar(save && save.stars && save.stars[id]);
}

// сумарна кількість зірок кампанії (кожна країна 0..3) → 0..36
export function starTotal(save) {
  if (!save || !save.stars || typeof save.stars !== 'object') return 0;
  let n = 0;
  for (const id of CAMPAIGN_ORDER) n += countryStars(save, id);
  return n;
}

// 🎁 Пороги-нагороди (одноразові). Титул на 36⭐ також захищений предикатом у titles.js —
// syncTitles відновить його при клауд-імпорті навіть без прямого нарахування.
export const STAR_THRESHOLDS = [
  { at: 12, type: 'coins', n: 500, label: () => t('12 зірок — нагорода: +500 монет 💰') },
  { at: 24, type: 'crystals', n: 10, label: () => t('24 зірки — нагорода: +10 кристалів 💎') },
  { at: 36, type: 'title', id: 'star_savior', label: () => t('36 зірок — титул «⭐ Зоряний рятівник»!') },
];

// ⭐2: вторинні цілі забігу — 1 випадкова на забіг, data-driven.
// Усі досяжні З бафами драфту й супер-пікапом (v288) — не «pistol only» тощо.
// target(country) масштабує ціль монет за складністю країни (counts).
const SECONDARY_OBJECTIVES = [
  { id: 'elites', ev: 'elite', icon: '👹', target: () => 2, label: (n) => t('Убий {n} елітних зомбі', { n }) },
  { id: 'megabox', ev: 'megabox', icon: '📦', target: () => 1, label: () => t('Відкрий мегабокс') },
  {
    id: 'coins', ev: 'coins',
    icon: '💰',
    target: (c) => Math.round(150 * ((c && c.difficulty && c.difficulty.counts) || 1)),
    label: (n) => t('Збери {n} монет за забіг', { n }),
  },
  { id: 'headshots', ev: 'headshot', icon: '🎯', target: () => 10, label: (n) => t('Зроби {n} хедшотів', { n }) },
];

// ⭐ R3 «Зірки разом» (v298): у КООП-кампанії пул звужено до цілей, які ХОСТ бачить
// АВТОРИТЕТНО для всієї команди — прогрес рахує лише хост зі своєї симуляції:
//   • 'elites'  — смерть будь-якого еліта живе в хостовій симуляції (кіл-кредит байдужий);
//   • 'megabox' — у коопі мегабокс має ЛИШЕ хост, тож відкриття завжди видно хосту.
// 'coins'/'headshots' виключені навмисно: у поточному netcode хост бачить лише СВОЇ
// (монети гостя їдуть подією `lt` повз level.addCoins; hitmarker-крит б'є тільки на
// власних пострілах хоста) — командний лічильник по них був би неповним.
export const COOP_SECONDARY_IDS = ['elites', 'megabox'];

// Вибір однієї цілі на забіг. seed — детерміноване число (варіює за країною/повтором),
// forceId — примусовий тип для тестів. Повертає ЖИВИЙ об'єкт цілі (progress/done тікаються у грі).
export function pickSecondaryObjective(country, seed = 0, forceId = null) {
  let def = forceId ? SECONDARY_OBJECTIVES.find((o) => o.id === forceId) : null;
  if (!def) {
    const i = (((seed | 0) % SECONDARY_OBJECTIVES.length) + SECONDARY_OBJECTIVES.length) % SECONDARY_OBJECTIVES.length;
    def = SECONDARY_OBJECTIVES[i];
  }
  const target = Math.max(1, def.target(country) | 0);
  return {
    id: def.id,
    ev: def.ev,
    icon: def.icon,
    target,
    progress: 0,
    done: false,
    label: () => def.label(target),
  };
}
