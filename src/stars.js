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

// ⭐ зірка складності (1..5) — той самий fail-safe у бік легшого, що й sanitizeDiffStar
// у net/protocol.js. Тут власна копія, бо stars.js — чистий модуль без мережевих імпортів.
const clampDiffStar = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
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
//
// 💰 v750 «ціна зірки»: старі 500 монет / 10 кристалів були призом за пів кампанії, який
// не купував нічого — 500 монет це 1/6 найдешевшого товару другого ярусу (tier2.js:
// 3200/4200/5000), а 10 кристалів — рівно один обмін «10💎 → 500 монет» у shop.js.
// Після того, як ⭐2 стала справжньою ціллю (пул 14, важкі — під зірку складності),
// пороги коштують стільки, скільки важать: 12⭐ (третина кампанії) майже закриває один
// пік другого ярусу; 24⭐ (дві третини) — це преміальний гаджет плюс скін; 36⭐ (ідеальна
// кампанія) додає до титулу 100💎 — ціну найдорожчої речі в магазині. Нової валюти нема.
export const STAR_THRESHOLDS = [
  { at: 12, coins: 2500, label: () => t('12 зірок — нагорода: +2500 монет 💰') },
  { at: 24, crystals: 40, label: () => t('24 зірки — нагорода: +40 кристалів 💎') },
  { at: 36, crystals: 100, title: 'star_savior', label: () => t('36 зірок — титул «⭐ Зоряний рятівник» і +100 кристалів!') },
];

const counts = (c) => (c && c.difficulty && c.difficulty.counts) || 1;

// ⭐2: вторинні цілі забігу — 1 випадкова на забіг, data-driven.
//
// Поля дефініції:
//   id       — стабільний ключ (їде у кооп-spec і в state-синк);
//   ev       — подія, на якій ціль тікає (див. виклики game._bumpSecondary у main.js);
//   diffStar — МІНІМАЛЬНА зірка складності, з якої ціль потрапляє в пул. ★1 лишається
//              таким самим дитячим набором, як до v750: усе закривається саме по ходу
//              забігу. Вимогливі цілі підмішуються з ★2, найжорсткіші — з ★4–5;
//   coop     — чи бачить прогрес ХОСТ авторитетно для всієї команди (див. коментар
//              до COOP_SECONDARY_IDS нижче). У кооп-пул ідуть лише coop:true;
//   target   — скільки тіків треба (масштаб за складністю країни, де це доречно);
//   n        — число для тексту й умови, якщо воно НЕ дорівнює target (хвилини, відсотки);
//   gate     — необов'язковий фільтр: тік зараховується лише коли предикат істинний
//              (так працюють цілі-заперечення: «не купуй», «без гаджета»);
//   measure  — необов'язковий: замість +1 ставить прогрес = виміряному значенню
//              (комбо — це «найкраще досягнуте», а не сума).
// Усі досяжні З бафами драфту й супер-пікапом (v288) — не «pistol only» тощо, крім
// цілей, які САМІ про зброю й гейтяться зіркою складності.
const SECONDARY_OBJECTIVES = [
  // ---------- ★1: дитячий набір (як до v750 — нічого не стало важчим) ----------
  {
    id: 'elites', ev: 'elite', icon: '👹', diffStar: 1, coop: true,
    target: () => 2, label: (n) => t('Убий {n} елітних зомбі', { n }),
  },
  {
    id: 'megabox', ev: 'megabox', icon: '📦', diffStar: 1, coop: true,
    target: () => 1, label: () => t('Відкрий мегабокс'),
  },
  {
    id: 'coins', ev: 'coins', icon: '💰', diffStar: 1, coop: false,
    target: (c) => Math.round(150 * counts(c)),
    label: (n) => t('Збери {n} монет за забіг', { n }),
  },
  {
    id: 'headshots', ev: 'headshot', icon: '🎯', diffStar: 1, coop: false,
    target: () => 10, label: (n) => t('Зроби {n} хедшотів', { n }),
  },
  {
    // переможний «салют» після боса зачищає карту сам — не даруємо ціль на халяву
    id: 'kills', ev: 'kill', icon: '🧟', diffStar: 1, coop: true,
    target: (c) => Math.round(25 * counts(c)),
    gate: (level) => !level.bossDefeated,
    label: (n) => t('Переможи {n} зомбі', { n }),
  },
  {
    id: 'pickups', ev: 'pickup', icon: '🎒', diffStar: 1, coop: false,
    target: () => 8, label: (n) => t('Підбери {n} припасів', { n }),
  },
  {
    id: 'scooter', ev: 'scooter', icon: '🛴', diffStar: 1, coop: false,
    target: () => 1, label: () => t('Прокатись на самокаті'),
  },
  // ---------- ★2: треба намір, але помилка не карає ----------
  {
    id: 'combo', ev: 'combo', icon: '🔥', diffStar: 2, coop: false,
    target: () => 12,
    measure: (level) => ((level.combo && level.combo.n) | 0),
    label: (n) => t('Набери комбо ×{n}', { n }),
  },
  {
    // v751: джерело правди одне — прапорець забігу level.shopUsed (shop.buy ставить його
    // після БУДЬ-ЯКОЇ успішної покупки). Монетний лічильник забігу тут більше не читається:
    // товари за кристали й радіаційні монети коштують нуль монет і ціль не ламали.
    id: 'noshop', ev: 'bossDied', icon: '🛒', diffStar: 2, coop: false,
    target: () => 1,
    gate: (level) => !level.shopUsed,
    label: () => t('Не купуй нічого в магазині'),
  },
  // ---------- ★3: вимагають темпу або обмеження ----------
  {
    id: 'bossfast', ev: 'bossDied', icon: '⏱️', diffStar: 3, coop: true,
    target: () => 1, n: () => 9,
    gate: (level, n) => ((level.stats && level.stats.time) || 0) <= n * 60,
    label: (n) => t('Переможи боса за {n} хвилин', { n }),
  },
  {
    id: 'pistol', ev: 'kill', icon: '🔫', diffStar: 3, coop: false,
    target: () => 15,
    gate: (level) => !level.bossDefeated && !!level.player && level.player.cur === 'pistol',
    label: (n) => t('Переможи {n} зомбі з пістолета', { n }),
  },
  // ---------- ★4–5: найжорсткіші ----------
  {
    id: 'nogadget', ev: 'bossDied', icon: '🧰', diffStar: 4, coop: false,
    target: () => 1,
    gate: (level) => !level.gadgetUsed,
    label: () => t('Переможи боса без гаджета'),
  },
  {
    // поріг пострілів відсікає читерський «один влучний постріл = 100 %»
    id: 'accuracy', ev: 'bossDied', icon: '🏹', diffStar: 4, coop: false,
    target: () => 1, n: () => 60,
    gate: (level, n) => {
      const s = level.stats || {};
      return (s.shotsFired | 0) >= 40 && (s.shotsHit | 0) * 100 >= (s.shotsFired | 0) * n;
    },
    label: (n) => t('Влучність {n}% за забіг', { n }),
  },
  {
    id: 'flawless', ev: 'bossDied', icon: '🛡️', diffStar: 5, coop: false,
    target: () => 1,
    gate: (level) => level.bossHitFree === true,
    label: () => t('Не дай босу зачепити тебе'),
  },
];

export const SECONDARY_OBJECTIVE_IDS = SECONDARY_OBJECTIVES.map((o) => o.id);

// Пул цілей для конкретної зірки складності. Кумулятивний: ★5 бачить і дитячі цілі —
// різноманіття важливіше за «на високій зірці лише пекло».
export function secondaryPool(diffStar = 1, coopOnly = false) {
  const star = clampDiffStar(diffStar);
  return SECONDARY_OBJECTIVES.filter((o) => o.diffStar <= star && (!coopOnly || o.coop));
}

// ⭐ R3 «Зірки разом» (v298): у КООП-кампанії пул звужено до цілей, які ХОСТ бачить
// АВТОРИТЕТНО для всієї команди — прогрес рахує лише хост зі своєї симуляції:
//   • 'elites'   — смерть будь-якого еліта живе в хостовій симуляції (кіл-кредит байдужий);
//   • 'megabox'  — у коопі мегабокс має ЛИШЕ хост, тож відкриття завжди видно хосту;
//   • 'kills'    — будь-який зомбі команди помирає в хостовій симуляції (v750, той самий
//                  уникредитований гачок, що вже рахує елітів);
//   • 'bossfast' — годинник забігу (level.stats.time) і смерть боса — обидва хостові.
// Решта виключена навмисно: у поточному netcode хост бачить лише СВОЄ — монети гостя
// їдуть подією `lt` повз level.addCoins, hitmarker-крит б'є тільки на власних пострілах,
// пікапи/самокат/комбо/магазин/гаджети/влучність/удари по гостю живуть у гостя.
// Командний лічильник по них був би неповним.
export const COOP_SECONDARY_IDS = SECONDARY_OBJECTIVES.filter((o) => o.coop).map((o) => o.id);

// Вибір однієї цілі на забіг. seed — детерміноване число (варіює за країною/повтором),
// forceId — примусовий тип для тестів (обходить фільтр зірки: тест має дістати будь-яку).
// diffStar — зірка складності забігу; coopOnly — брати лише хост-авторитетні цілі.
// Повертає ЖИВИЙ об'єкт цілі (progress/done тікаються у грі).
export function pickSecondaryObjective(country, seed = 0, forceId = null, diffStar = 1, coopOnly = false) {
  let def = forceId ? SECONDARY_OBJECTIVES.find((o) => o.id === forceId) : null;
  if (!def) {
    const pool = secondaryPool(diffStar, coopOnly);
    const i = (((seed | 0) % pool.length) + pool.length) % pool.length;
    def = pool[i];
  }
  const target = Math.max(1, def.target(country) | 0);
  const need = def.n ? def.n(country) : target;
  return {
    id: def.id,
    ev: def.ev,
    icon: def.icon,
    target,
    need,
    progress: 0,
    done: false,
    label: () => def.label(need),
    gate: def.gate ? (level) => def.gate(level, need) : null,
    measure: def.measure || null,
  };
}
