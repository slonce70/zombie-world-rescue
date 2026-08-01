// 🎡 Каталог режимів (v710-A): доступ більше не залежить від кампанії.
// На чистому сейві всі кімнатні режими відкриті, сюжет лишається послідовним,
// а секція «СЬОГОДНІ» показує 4 детерміновані слоти дня.
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=710`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

const catalog = await page.evaluate(async () => {
  const g = window.__game;
  g.renderSoloMenu();
  const cards = [...document.querySelectorAll('#solo-modes .solo-mode')];
  const byMode = new Map();
  for (const card of cards) {
    const id = card.dataset.mode;
    if (!byMode.has(id)) byMode.set(id, card.classList.contains('locked'));
  }
  const { todaySlots, ROTATION_SLOTS } = await import('/src/rotation.js');
  const { SOLO_MODE_GROUPS } = await import('/src/modes.js');
  return {
    lockedIds: [...byMode].filter(([, locked]) => locked).map(([id]) => id),
    uniqueCards: byMode.size,
    totalCards: cards.length,
    todayIds: [...document.querySelectorAll('.solo-recommended .solo-mode')].map((m) => m.dataset.mode),
    todayTitle: document.getElementById('solo-recommended-title')?.textContent,
    categories: SOLO_MODE_GROUPS.map((group) => group.id),
    categoryCounts: SOLO_MODE_GROUPS.map((group) => group.ids.length),
    // що НАМАЛЬОВАНО в кожній категорії + число з її заголовка
    rendered: [...document.querySelectorAll('.solo-category')].map((cat) => ({
      id: cat.dataset.category,
      ids: [...cat.querySelectorAll('.solo-mode')].map((m) => m.dataset.mode),
      badge: Number(cat.querySelector('summary > span')?.textContent),
      order: SOLO_MODE_GROUPS.find((gr) => gr.id === cat.dataset.category).ids,
    })),
    coopBadges: document.querySelectorAll('.sm-coop').length,
    slots: todaySlots(g._dayIndex()),
    slotsRepeat: todaySlots(g._dayIndex()),
    slotsNextDay: todaySlots(g._dayIndex() + 1),
    rotationSlots: ROTATION_SLOTS,
    liberated: Object.keys(g.save.liberated || {}).length,
  };
});

check(catalog.liberated === 0, 'перевірка йде на чистому сейві', JSON.stringify(catalog.liberated));
check(catalog.uniqueCards === 19, 'у каталозі 19 карток', JSON.stringify(catalog.uniqueCards));
check(catalog.lockedIds.length === 2
  && catalog.lockedIds.includes('infected') && catalog.lockedIds.includes('chapter3'),
'заблоковані лише Глава 2 і Глава 3', JSON.stringify(catalog.lockedIds));
check(catalog.categories.join(',') === 'quick,long' && catalog.categoryCounts.join(',') === '11,8',
  'дві категорії за довжиною сесії: 11 швидких і 8 довгих', JSON.stringify(catalog));
check(catalog.todayIds.length === 4 && /СЬОГОДНІ|TODAY|СЕГОДНЯ/.test(catalog.todayTitle || ''),
  'секція «СЬОГОДНІ» показує 4 картки', JSON.stringify(catalog.todayTitle));
check(catalog.coopBadges > 0, 'кооп-режими позначені бейджем 🤝', JSON.stringify(catalog.coopBadges));

// ---------- «СЬОГОДНІ» не дублює категорії ----------
check(catalog.totalCards === catalog.uniqueCards,
  'жодна картка не намальована двічі на одному екрані',
  JSON.stringify({ total: catalog.totalCards, unique: catalog.uniqueCards }));
const inCategories = catalog.rendered.flatMap((cat) => cat.ids);
check(!catalog.todayIds.some((id) => inCategories.includes(id)),
  'підбірка дня не повторюється в категоріях нижче',
  JSON.stringify({ today: catalog.todayIds, categories: inCategories }));
check(new Set([...catalog.todayIds, ...inCategories]).size === 19,
  'усі 19 режимів лишаються досяжними: підбірка дня нічого не запирає',
  JSON.stringify([...catalog.todayIds, ...inCategories]));
check(catalog.rendered.every((cat) => cat.badge === cat.ids.length),
  'лічильник у заголовку категорії дорівнює числу її карток',
  JSON.stringify(catalog.rendered.map((cat) => [cat.id, cat.badge, cat.ids.length])));
check(catalog.rendered.every((cat) =>
  cat.ids.join(',') === cat.order.filter((id) => cat.ids.includes(id)).join(',')),
'категорія зберігає свій порядок режимів', JSON.stringify(catalog.rendered.map((cat) => cat.ids)));

const slots = catalog.slots;
check(slots.length === catalog.rotationSlots && new Set(slots).size === slots.length,
  'слоти дня — 4 різних режими', JSON.stringify(slots));
check(slots.join(',') === catalog.slotsRepeat.join(','),
  'той самий день дає той самий набір', JSON.stringify([slots, catalog.slotsRepeat]));
check(slots.join(',') !== catalog.slotsNextDay.join(','),
  'наступний день дає інший набір', JSON.stringify([slots, catalog.slotsNextDay]));

console.log('▸ Кімнатний режим стартує без звільнених країн');
const start = await page.evaluate(async () => {
  const g = window.__game;
  g.startKnockout();
  for (let i = 0; i < 60 && g.state !== 'level'; i++) await new Promise((r) => setTimeout(r, 250));
  return { state: g.state, knockout: !!g.level?.knockout };
});
check(start.state === 'level' && start.knockout,
  'Нокаут запускається на чистому сейві', JSON.stringify(start));

check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));

await closeTest();
if (failed) process.exit(1);
console.log('\n🎉 КАТАЛОГ РЕЖИМІВ ВІДКРИТИЙ І РОТУЄТЬСЯ');
