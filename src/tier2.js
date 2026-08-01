// 🏅 Другий ярус прокачки (v750): ВИБІР, а не сума.
//
// Уся базова гілка («Прокачування» + «Спорядження») коштує 2100 монет, а одна країна
// дає ~1400 — тобто до третьої країни купувати вже нічого, і решту кампанії монети
// не означають нічого, крім косметики. Після повного викупу базової гілки відкривається
// цей ярус: шість дорогих покращень, згрупованих у ТРИ ПАРИ. З пари можна взяти лише
// одне — друге закривається назавжди. Це рішення про стиль гри, а не «ще більше цифр».
//
// Чистий модуль без DOM, THREE і мережі — як countrypowers.js, season.js, stars.js.
// Нічого не зберігає сам: покупка живе у звичайному `save.upgrades[id]`, тож старий
// сейв із викупленою базовою гілкою відкриває ярус ОДРАЗУ, без міграції.
//
// ⚖️ Складається з пасивками країн (src/countrypowers.js), а не затирає їх: ярус
// приносить ВЛАСНІ поля (armorRegen, reloadMult, ammoMult, множник шкоди за дистанцією)
// і рівно один доданок у спільне поле `maxArmor` — а `applyGear` у player.js рахує
// броню з нуля як `50 + жилет + пасивка країни + ярус`.
import { t } from './i18n.js';

// Базова гілка = «Прокачування» + «Спорядження» у shop.js. Ярус відкривається лише коли
// ВСІ шість позицій викуплені до свого max. Дзеркало max'ів тримаємо тут (shop.js імпортує
// цей модуль, тож зворотний імпорт зробив би цикл), а test/tier2-unit.mjs звіряє його
// з реальним shop.js — розійтись мовчки вони не зможуть.
export const BASE_BRANCH = Object.freeze([
  { id: 'maxhp', max: 4 },
  { id: 'speed', max: 3 },
  { id: 'damage', max: 3 },
  { id: 'vest', max: 2 },
  { id: 'helmet', max: 1 },
  { id: 'sneakers', max: 1 },
]);

// Числа ефектів — в одному місці, щоб опис товару, гра і тест читали ОДНЕ джерело.
export const TIER2 = Object.freeze({
  carapaceArmor: 150, // 🧱 +150 максимальної броні
  plateRegen: 8,      // 🩹 броні за секунду
  plateDelay: 4,      // 🩹 секунд без ушкоджень до старту відновлення
  closeRange: 12,     // 🥊 метрів — «зблизька»
  closeMult: 1.5,
  farRange: 25,       // 🔭 метрів — «здалеку»
  farMult: 1.5,
  ammoMult: 1.6,      // 🎒 стеля запасу і щедрість пікапів
  reloadMult: 0.55,   // ⚙️ тривалість перезарядки (−45%)
});

// Три пари. Кожна — вибір стилю гри на одній осі, а не «більше цифр»:
// тіло — запас броні проти відновлення; постріл — впритул проти дистанції;
// боєзапас — носити більше проти перезаряджатись швидше.
export const TIER2_PAIRS = Object.freeze([
  {
    id: 'body', icon: '🫀',
    items: [
      {
        id: 't2-carapace', icon: '🧱', price: 3200,
        name: () => t('Панцир'),
        desc: () => t('+{n} максимальної броні', { n: TIER2.carapaceArmor }),
        apply: (m) => { m.maxArmor += TIER2.carapaceArmor; },
      },
      {
        id: 't2-nanoplates', icon: '🩹', price: 3200,
        name: () => t('Нанопластини'),
        desc: () => t('Броня сама наростає: +{n} за секунду, якщо {d} с тебе не били', { n: TIER2.plateRegen, d: TIER2.plateDelay }),
        apply: (m) => { m.armorRegen = TIER2.plateRegen; m.armorRegenDelay = TIER2.plateDelay; },
      },
    ],
  },
  {
    id: 'shot', icon: '🎯',
    items: [
      {
        id: 't2-pointblank', icon: '🥊', price: 4200,
        name: () => t('Впритул'),
        desc: () => t('+50% шкоди по зомбі ближче {n} метрів', { n: TIER2.closeRange }),
        apply: (m) => { m.closeMult = TIER2.closeMult; m.closeRange = TIER2.closeRange; },
      },
      {
        id: 't2-marksman', icon: '🔭', price: 4200,
        name: () => t('Далекобій'),
        desc: () => t('+50% шкоди по зомбі далі {n} метрів', { n: TIER2.farRange }),
        apply: (m) => { m.farMult = TIER2.farMult; m.farRange = TIER2.farRange; },
      },
    ],
  },
  {
    id: 'ammo', icon: '🎒',
    items: [
      {
        id: 't2-ammobelt', icon: '🎒', price: 3600,
        name: () => t('Патронташ'),
        desc: () => t('+60% до запасу набоїв: більша стеля і щедріші пікапи'),
        apply: (m) => { m.ammoMult = TIER2.ammoMult; },
      },
      {
        id: 't2-quickhands', icon: '⚙️', price: 3600,
        name: () => t('Швидкі руки'),
        desc: () => t('Перезарядка на 45% швидша'),
        apply: (m) => { m.reloadMult = TIER2.reloadMult; },
      },
    ],
  },
]);

// Плаский список із посиланням на пару і на «суперника» — того, кого покупка закриє.
export const TIER2_ITEMS = Object.freeze(TIER2_PAIRS.flatMap((pair) => pair.items.map((item, i) => ({
  ...item, pair: pair.id, pairIcon: pair.icon, rival: pair.items[1 - i].id,
}))));

export const tier2Item = (id) => TIER2_ITEMS.find((i) => i.id === id) || null;

// Скільки сходинок базової гілки ще не викуплено (0 — гілка повна).
export function baseBranchLeft(upgrades) {
  const u = upgrades && typeof upgrades === 'object' ? upgrades : {};
  let left = 0;
  for (const step of BASE_BRANCH) left += Math.max(0, step.max - (Number(u[step.id]) || 0));
  return left;
}

export const baseBranchDone = (upgrades) => baseBranchLeft(upgrades) === 0;

// Обране в парі (або null). Якщо сейв якимось дивом має обидва — беремо перше за таблицею,
// щоб гра поводилась однаково скрізь.
export function tier2Chosen(upgrades, pairId) {
  const u = upgrades && typeof upgrades === 'object' ? upgrades : {};
  const pair = TIER2_PAIRS.find((p) => p.id === pairId);
  if (!pair) return null;
  return TIER2_ITEMS.find((i) => i.pair === pair.id && (Number(u[i.id]) || 0) > 0) || null;
}

// Чому товар недоступний:
//   { kind: 'owned' }                 — уже куплений
//   { kind: 'base', left }            — базова гілка ще не викуплена (лишилось left сходинок)
//   { kind: 'rival', rival }          — у цій парі вже обрано інше, назавжди
//   null                              — можна купувати
export function tier2Lock(upgrades, id) {
  const item = tier2Item(id);
  if (!item) return null;
  const u = upgrades && typeof upgrades === 'object' ? upgrades : {};
  if ((Number(u[id]) || 0) > 0) return { kind: 'owned', item };
  const left = baseBranchLeft(u);
  if (left > 0) return { kind: 'base', left };
  const rival = tier2Item(item.rival);
  if ((Number(u[item.rival]) || 0) > 0) return { kind: 'rival', rival };
  return null;
}

// Нейтральний набір: рівно те, що має гравець без жодної покупки ярусу.
export const neutralTier2Mods = () => ({
  maxArmor: 0,        // доданок до максимальної броні (🧱 Панцир)
  armorRegen: 0,      // броні за секунду (🩹 Нанопластини)
  armorRegenDelay: 0, // секунд без ушкоджень до старту відновлення
  closeMult: 1,       // множник шкоди по близьких цілях (🥊 Впритул)
  closeRange: 0,
  farMult: 1,         // множник шкоди по далеких цілях (🔭 Далекобій)
  farRange: 0,
  ammoMult: 1,        // стеля запасу набоїв і щедрість пікапів (🎒 Патронташ)
  reloadMult: 1,      // тривалість перезарядки (⚙️ Швидкі руки)
});

// Набір модифікаторів гравця. Застосовує player.applyGear — там само, де вже
// застосовуються жилет, шолом і кросівки.
export function tier2Mods(upgrades) {
  const mods = neutralTier2Mods();
  const u = upgrades && typeof upgrades === 'object' ? upgrades : {};
  // гейт діє і на ЕФЕКТ, а не лише на вітрину: сейв без повної базової гілки
  // (відкат версії, ручна правка) сили ярусу не отримує
  if (!baseBranchDone(u)) return mods;
  for (const pair of TIER2_PAIRS) {
    const chosen = tier2Chosen(u, pair.id);
    if (chosen) chosen.apply(mods);
  }
  return mods;
}

// Множник шкоди за дистанцією до цілі (метри). Пара «Постріл» взаємно виключна,
// тож обидві гілки одночасно спрацювати не можуть.
export function rangeDamageMult(mods, dist) {
  if (!mods || !(dist >= 0)) return 1;
  if (mods.closeMult > 1 && dist <= mods.closeRange) return mods.closeMult;
  if (mods.farMult > 1 && dist >= mods.farRange) return mods.farMult;
  return 1;
}
