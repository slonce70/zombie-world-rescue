// 🥚 R5 (v291) «Колекція та яйця»: яйця петсів (ЗАРОБЛЕНІ) і ріст петсів.
//  - пороги зірок (кожні 6) і друзів (кожен 3-й) дарують яйце; ретро-беклог для ветерана
//  - відкриття яйця → новий петс АБО дублікат→корм; шанси надруковані
//  - корм годує петса → рівень 1→3 → більший масштаб + баф магніту (коли петс активний)
//  - скриня може включати яйце; яйце НІКОЛИ не продається в магазині (дитяча безпека)
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg, d = '') => { console.log(ok ? '  ✅' : '  ❌', msg, d); if (!ok) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// ---------- пороги зірок ----------
console.log('▸ Пороги зірок (кожні 6) дарують яйце — окремо від v289 12/24/36');
const starEgg = await page.evaluate(async () => {
  const eggs = await import('/src/eggs.js');
  const save = { stars: { UKR: 3, POL: 3 }, eggs: 0, eggClaims: [], friends: {}, friendEggClaims: [], pets: [] };
  const g1 = eggs.claimStarEggs(save); // 6⭐ → +1
  const after6 = save.eggs;
  save.stars = { UKR: 3, POL: 3, DEU: 3, FRA: 3 }; // 12⭐
  const g2 = eggs.claimStarEggs(save); // → +1
  const g3 = eggs.claimStarEggs(save); // ідемпотентно → 0
  return { g1, after6, g2, g3, after12: save.eggs, claims: save.eggClaims };
});
check(starEgg.g1 === 1 && starEgg.after6 === 1, '6⭐ → 1 яйце', JSON.stringify(starEgg));
check(starEgg.g2 === 1 && starEgg.after12 === 2, '12⭐ → ще 1 яйце', JSON.stringify(starEgg));
check(starEgg.g3 === 0, 'повторний claim нічого не дублює (ідемпотентно)', JSON.stringify(starEgg));

console.log('▸ Ретро-беклог: ветеран з 36⭐ і 12 друзями одразу отримує всі яйця');
const backlog = await page.evaluate(async () => {
  const eggs = await import('/src/eggs.js');
  const { CAMPAIGN_ORDER } = await import('/src/countries.js');
  const stars = {}; const friends = {};
  for (const id of CAMPAIGN_ORDER) { stars[id] = 3; friends[id] = true; }
  const save = { stars, friends, eggs: 0, eggClaims: [], friendEggClaims: [], pets: [] };
  const n = eggs.claimBacklogEggs(save);
  return { n, eggs: save.eggs };
});
check(backlog.eggs === 6 + 4, 'ретро-беклог: 36⭐ (6 яєць) + 12 друзів (4 яйця) = 10', JSON.stringify(backlog));

// ---------- пороги друзів ----------
console.log('▸ Кожен 3-й врятований друг дарує яйце');
const friendEgg = await page.evaluate(async () => {
  const eggs = await import('/src/eggs.js');
  const save = { friends: { UKR: true, POL: true }, friendEggClaims: [], eggs: 0 };
  const a2 = eggs.claimFriendEggs(save); // 2 друзі → 0
  save.friends.DEU = true;               // 3 друзі
  const a3 = eggs.claimFriendEggs(save); // → 1
  return { a2, a3, eggs: save.eggs, claims: save.friendEggClaims };
});
check(friendEgg.a2 === 0 && friendEgg.a3 === 1 && friendEgg.eggs === 1, '2-й друг — ні, 3-й — яйце', JSON.stringify(friendEgg));

console.log('▸ Живий рятунок 3-го друга через гру видає яйце + тост');
const liveFriend = await page.evaluate(() => {
  const g = window.__game;
  g.save.friends = { UKR: true, POL: true, DEU: true };
  g.save.friendEggClaims = [];
  g.save.eggs = 0;
  g._onFriendRescued('DEU');
  return { eggs: g.save.eggs, claims: [...g.save.friendEggClaims] };
});
check(liveFriend.eggs === 1 && liveFriend.claims.includes(3), 'g._onFriendRescued дарує яйце на 3-му другові', JSON.stringify(liveFriend));

// ---------- скриня може включати яйце ----------
console.log('▸ Скриня (елітна/золота) може включати яйце — форс on/off');
const chestEgg = await page.evaluate(() => {
  const g = window.__game;
  g.save.eggs = 0;
  g._forceChestEgg = true;
  const inc = g._rollChestEgg(0.10);
  const eggsAfter = g.save.eggs;
  g._forceChestEgg = false;
  const notInc = g._rollChestEgg(0.15);
  g._forceChestEgg = null;
  return { inc, eggsAfter, notInc };
});
check(chestEgg.inc && chestEgg.eggsAfter === 1 && !chestEgg.notInc, 'скриня додає яйце (force on=так, off=ні)', JSON.stringify(chestEgg));

// ---------- відкриття яйця ----------
console.log('▸ Відкриття яйця: новий петс у колекцію АБО дублікат → 🍖 корм');
const open = await page.evaluate(async () => {
  const eggs = await import('/src/eggs.js');
  const save = { eggs: 1, pets: [], petLevels: {}, petFood: 0 };
  const r1 = eggs.openEgg(save, () => 0); // детермінований: common tier, перший петс
  const newPet = { petId: r1.petId, dup: r1.duplicate, owned: save.pets.includes(r1.petId), level: save.petLevels[r1.petId], eggsLeft: save.eggs };
  save.eggs = 1;
  const r2 = eggs.openEgg(save, () => 0); // той самий петс → дублікат
  return { newPet, dup: { duplicate: r2.duplicate, food: save.petFood } };
});
check(!open.newPet.dup && open.newPet.owned && open.newPet.level === 1 && open.newPet.eggsLeft === 0,
  'новий петс доданий (Рів.1), яйце списано', JSON.stringify(open.newPet));
check(open.dup.duplicate && open.dup.food === 2, 'дублікат → 🍖 Корм ×2', JSON.stringify(open.dup));

console.log('▸ Шанси надруковані (60/30/10)');
const odds = await page.evaluate(async () => (await import('/src/eggs.js')).eggOddsText());
check(/60%/.test(odds) && /30%/.test(odds) && /10%/.test(odds), 'eggOddsText показує 60/30/10', odds);

// ---------- 🖱️ UI-шлях: кнопка «Відкрити» в Альбомі (v294 regression) ----------
// PETS[*].name — РЯДОК (результат t()), не функція. Старий код кликав meta.name() і кидав
// TypeError ПІСЛЯ openEgg() (сейв уже змінено), тож церемонія/saveGame/renderAlbum не бігли.
console.log('▸ UI: клік «Відкрити» в Альбомі → церемонія, без page-error, лічильник впав, save збережено');
await page.evaluate(() => {
  const g = window.__game;
  if (g.level) g.endLevel();
  g.save.eggs = 3;
  g.save.pets = [];            // гарантуємо «новий петс», без дубля
  g.save.petLevels = {};
  g.saveGame();
});
await page.waitForFunction(() => window.__game.state === 'globe', null, { timeout: 15000 });
await page.click('#btn-menu'); // альбом живе у висувному меню
await page.waitForSelector('#overlay-menu.show', { timeout: 8000 });
await page.click('#btn-album');
await page.waitForSelector('#overlay-album.show', { timeout: 8000 });
await page.click('#album-content .album-tab[data-tab="pets"]');
await page.waitForSelector('.album-egg-open', { timeout: 8000 });
const errBefore = errors.length;
const uiOpen = await page.evaluate(() => {
  const btn = document.querySelector('.album-egg-open');
  const countBefore = document.querySelector('.album-egg-count').textContent;
  btn.click(); // → _openEggFromAlbum: openEgg → chestCeremony → saveGame → renderAlbum
  return {
    countBefore,
    ceremony: document.getElementById('chest-ceremony').classList.contains('show'),
    countAfter: document.querySelector('.album-egg-count').textContent, // renderAlbum оновив DOM
    eggsSave: window.__game.save.eggs,
  };
});
const persisted = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('zr-save-v1')).eggs; } catch (e) { return 'ERR'; } });
check(errors.length === errBefore, 'клік «Відкрити» БЕЗ page-error (meta.name — рядок, не виклик)', errors.slice(errBefore).join(' | '));
check(uiOpen.ceremony, 'церемонія-оверлей зʼявився після кліку', String(uiOpen.ceremony));
check(/3/.test(uiOpen.countBefore) && /2/.test(uiOpen.countAfter), 'лічильник яєць у DOM впав 3→2 після церемонії', JSON.stringify(uiOpen));
check(uiOpen.eggsSave === 2, 'save.eggs зменшено (списано яйце)', String(uiOpen.eggsSave));
check(persisted === 2, 'save.eggs=2 персистовано у localStorage', String(persisted));
await page.evaluate(() => { window.__game._closeChest(); const ov = document.getElementById('overlay-album'); if (ov) ov.classList.remove('show'); });

// ---------- ріст: годування → рівень → масштаб + баф ----------
console.log('▸ Годування: Рів.1→2 (3🍖), Рів.2→3 (6🍖); баф магніту активного петса');
const feed = await page.evaluate(async () => {
  const eggs = await import('/src/eggs.js');
  const g = window.__game;
  if (g.level) g.endLevel();
  g.save.pets = ['dog']; g.save.activePet = 'dog'; g.save.petLevels = { dog: 1 }; g.save.petFood = 10;
  const lvl2 = eggs.feedPet(g.save, 'dog'); const foodAfter2 = g.save.petFood;
  const lvl3 = eggs.feedPet(g.save, 'dog'); const food = g.save.petFood;
  const noMore = eggs.feedPet(g.save, 'dog'); // Рів.3 — макс
  const magnet = eggs.activePetMagnet(g.save);
  g.victoryShown = false;
  g.startLevel('UKR');
  return { lvl2, foodAfter2, lvl3, food, noMore, magnet };
});
check(feed.lvl2 === 2 && feed.foodAfter2 === 7, 'Рів.1→2 коштує 3🍖', JSON.stringify(feed));
check(feed.lvl3 === 3 && feed.food === 1, 'Рів.2→3 коштує 6🍖', JSON.stringify(feed));
check(feed.noMore === null, 'Рів.3 — макс, годувати не можна', JSON.stringify(feed));
check(Math.abs(feed.magnet - 1.10) < 1e-6, 'Рів.3 активного петса → магніт ×1.10', String(feed.magnet));

await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.pet, null, { timeout: 30000 });
const scale = await page.evaluate(() => {
  const g = window.__game;
  return {
    base: g.level.pet._baseScale,
    lvl: g.level.pet.petLevel,
    groupScale: g.level.pet.model.group.scale.x,
    getPetMagnet: g.level.effects.getPetMagnet(),
  };
});
check(Math.abs(scale.base - 1.25) < 1e-6 && scale.lvl === 3, 'Рів.3 петс у рівні: масштаб моделі ×1.25', JSON.stringify(scale));
check(Math.abs(scale.groupScale - 1.25) < 1e-6, 'масштаб застосовано до 3D-моделі', JSON.stringify(scale));
check(Math.abs(scale.getPetMagnet - 1.10) < 1e-6, 'effects.getPetMagnet застосовує баф активного петса', JSON.stringify(scale));

// ---------- дитяча безпека: яйце не продається ----------
console.log('▸ Дитяча безпека: яйце НІКОЛИ не в магазині (жодної вкладки)');
const shop = await page.evaluate(() => {
  const g = window.__game;
  g.shop.open();
  let text = '';
  const tabs = [...document.getElementById('shop-tabs').querySelectorAll('.shop-tab')];
  for (const b of tabs) { b.click(); text += ' ' + document.getElementById('shop-grid').innerText; }
  g.shop.close();
  return { text, hasEgg: /🥚|яйц|egg/i.test(text) };
});
const shopRegistry = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  return SHOP_ITEMS.some((i) => i.egg || i.eggs || /🥚|яйц/i.test(`${i.id} ${typeof i.name === 'string' ? i.name : ''}`));
});
check(!shop.hasEgg, 'у DOM магазину немає 🥚/«яйце» на продаж', shop.text.slice(0, 120));
check(!shopRegistry, 'жоден товар SHOP_ITEMS не дає яйця', String(shopRegistry));

check(errors.length === 0, `без JS-помилок (${errors.slice(0, 2).join(' | ')})`);
console.log(failed === 0 ? '🎉 PET-EGGS OK' : `❌ ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
