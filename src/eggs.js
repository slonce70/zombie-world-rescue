// 🥚 R5 (v291) «Колекція та яйця»: яйця петсів (ЗАРОБЛЕНІ, не куплені) і ріст петсів.
// Червона лінія дитячої безпеки: яйця ніколи не продаються за гроші/кристали; шанси
// завжди показані; дублікат завжди компенсується кормом. Без таймерів/FOMO.
//
// Чисті хелпери (без DOM/звуку) — щоб main.js (тости/церемонія), friends.js (подія) і
// тести викликали ту саму логіку. Персист: save.eggs, save.eggClaims, save.friendEggClaims,
// save.petFood, save.petLevels → SAVE_PROGRESS_KEYS (cloudsave.js) + guard у тесті.
import { t } from './i18n.js';
import { PETS } from './characters.js';
import { starTotal } from './stars.js';
import { rescuedFriendCount } from './friends.js';

// 🌟 Пороги зірок, що дарують яйце (кожні 6 сумарних зірок). ОКРЕМИЙ список claim'ів —
// НЕ чіпає наявні v289-пороги 12/24/36 (монети/кристали/титул) у stars.js STAR_THRESHOLDS.
const EGG_STAR_MILESTONES = [6, 12, 18, 24, 30, 36];
// 🤝 Кожен 3-й врятований друг дарує яйце (з теплим тостом від друга).
const EGG_FRIEND_MILESTONES = [3, 6, 9, 12];
// 🎁 Шанс, що церемонія скрині включить яйце (solo-only чести).
export const ELITE_CHEST_EGG_CHANCE = 0.10;
export const GOLDEN_CHEST_EGG_CHANCE = 0.15;

// 🥚 Тир-пули для вилуплення. slimepet і radiationlizard ВИКЛЮЧЕНІ — вони лишаються
// ексклюзивом своїх джерел (Глава 3 / Розділ Радіація). Ціни в магазині у решти майже
// однакові (dog 350, решта 1500), тож тиримо тематично «за крутизною» — так дитина
// відчуває рідкість. Шанси друкуються на яйці (eggOddsText).
const EGG_TIERS = [
  { id: 'common', pct: 60, label: () => t('звичайний'), pets: ['dog', 'cat', 'bunny', 'penguin', 'turtle', 'frog'] },
  { id: 'rare', pct: 30, label: () => t('рідкісний'), pets: ['fox', 'panda', 'parrot', 'robo'] },
  { id: 'epic', pct: 10, label: () => t('епічний'), pets: ['dino', 'dragon', 'unicorn'] },
];

// «60% звичайний · 30% рідкісний · 10% епічний» — друкується просто на рядку яйця.
export function eggOddsText() {
  return EGG_TIERS.map((tr) => `${tr.pct}% ${tr.label()}`).join(' · ');
}

// ---------- Ріст петсів ----------
export const PET_MAX_LEVEL = 3;
// Вартість наступного рівня у кормі: Рів.1→2 = 3 🍖, Рів.2→3 = 6 🍖.
const PET_FEED_COST = { 2: 3, 3: 6 };
// Візуальний масштаб моделі за рівнем (×1.12 / ×1.25) + іскри на Рів.3.
export const PET_LEVEL_SCALE = { 1: 1, 2: 1.12, 3: 1.25 };
// Дрібний баф: радіус магніту монет ×1.05 (Рів.2) / ×1.10 (Рів.3). Супер-магніт (v288) виграє.
const PET_MAGNET_BONUS = { 1: 1, 2: 1.05, 3: 1.10 };

export function petLevel(save, id) {
  const lv = save && save.petLevels && save.petLevels[id];
  return (lv >= 1 && lv <= PET_MAX_LEVEL) ? (lv | 0) : 1;
}

export function feedCost(nextLevel) {
  return PET_FEED_COST[nextLevel] || 0;
}

export function canFeed(save, id) {
  if (!save || !(save.pets || []).includes(id)) return false;
  const lv = petLevel(save, id);
  if (lv >= PET_MAX_LEVEL) return false;
  return (save.petFood || 0) >= feedCost(lv + 1);
}

// Годуємо петса → наступний рівень. Повертає новий рівень або null (не можна).
export function feedPet(save, id) {
  if (!canFeed(save, id)) return null;
  const next = petLevel(save, id) + 1;
  save.petFood = (save.petFood || 0) - feedCost(next);
  if (!save.petLevels || typeof save.petLevels !== 'object') save.petLevels = {};
  save.petLevels[id] = next;
  return next;
}

// Множник радіуса магніту монет від АКТИВНОГО петса (для effects.getPetMagnet).
export function activePetMagnet(save) {
  if (!save || !save.activePet || !(save.pets || []).includes(save.activePet)) return 1;
  return PET_MAGNET_BONUS[petLevel(save, save.activePet)] || 1;
}

// ---------- Заробіток яєць (ретро-безпечний) ----------
// Нараховує яйця за ВСІ ще не видані пороги зірок ≤ поточної суми. Ідемпотентно
// (захищено save.eggClaims). Повертає кількість щойно виданих яєць.
export function claimStarEggs(save) {
  if (!save) return 0;
  if (!Array.isArray(save.eggClaims)) save.eggClaims = [];
  const tot = starTotal(save);
  let granted = 0;
  for (const m of EGG_STAR_MILESTONES) {
    if (tot >= m && !save.eggClaims.includes(m)) {
      save.eggClaims.push(m);
      save.eggs = (save.eggs || 0) + 1;
      granted++;
    }
  }
  return granted;
}

// Нараховує яйця за ще не видані пороги друзів (кожен 3-й). Ідемпотентно.
export function claimFriendEggs(save) {
  if (!save) return 0;
  if (!Array.isArray(save.friendEggClaims)) save.friendEggClaims = [];
  const n = rescuedFriendCount(save);
  let granted = 0;
  for (const m of EGG_FRIEND_MILESTONES) {
    if (n >= m && !save.friendEggClaims.includes(m)) {
      save.friendEggClaims.push(m);
      save.eggs = (save.eggs || 0) + 1;
      granted++;
    }
  }
  return granted;
}

// Ретро-бекап: усі накопичені пороги одразу (ветеран з 36⭐/12 друзями). Повертає total.
export function claimBacklogEggs(save) {
  return claimStarEggs(save) + claimFriendEggs(save);
}

// Обираємо петса з тир-пулу за шансами. rng: () => [0,1).
function pickEggPet(rng = Math.random) {
  const r = rng() * 100;
  let acc = 0;
  let tier = EGG_TIERS[EGG_TIERS.length - 1];
  for (const tr of EGG_TIERS) {
    acc += tr.pct;
    if (r < acc) { tier = tr; break; }
  }
  const pool = tier.pets.filter((id) => PETS[id]);
  const petId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] || tier.pets[0];
  return { petId, tier: tier.id };
}

// Відкриваємо одне яйце: списуємо, обираємо петса. Новий → у колекцію (Рів.1);
// вже є → дублікат → +2 🍖 корму. Повертає результат (caller показує церемонію), або null.
export function openEgg(save, rng = Math.random) {
  if (!save || (save.eggs || 0) <= 0) return null;
  save.eggs -= 1;
  const { petId, tier } = pickEggPet(rng);
  if (!Array.isArray(save.pets)) save.pets = [];
  if (save.pets.includes(petId)) {
    save.petFood = (save.petFood || 0) + 2;
    return { petId, tier, duplicate: true, food: 2 };
  }
  save.pets.push(petId);
  if (!save.petLevels || typeof save.petLevels !== 'object') save.petLevels = {};
  if (!save.petLevels[petId]) save.petLevels[petId] = 1;
  return { petId, tier, duplicate: false };
}
