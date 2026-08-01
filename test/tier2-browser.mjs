// 🏅 Другий ярус прокачки в живій грі: вкладка видна завжди, але замкнена до повного
// викупу базової гілки; покупка йде у два кроки (попередження → підтвердження);
// ефект реально лягає на гравця; напарник по парі закривається назавжди.
import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, errors, closeTest } = await openBrowserTest({ captureConsole: false, pageErrorPrefix: '' });

const FULL_BASE = { maxhp: 4, speed: 3, damage: 3, vest: 2, helmet: 1, sneakers: 1 };
const TAB = 'Вибір героя';

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

// Готуємо сейв, перезапускаємо забіг (щоб applyGear відпрацював зі старту) і відкриваємо вкладку ярусу.
async function openTier2({ upgrades, coins = 50000, restart = true }) {
  await page.evaluate(async ([up, c, doRestart]) => {
    const g = window.__game;
    g.save.upgrades = { ...up };
    g.save.coins = c;
    if (doRestart) {
      g.victoryShown = false;
      if (g.level) g.level.__stale = true;
      g.startLevel('UKR');
    }
  }, [upgrades, coins, restart]);
  if (restart) {
    await page.waitForFunction(
      () => window.__game.state === 'level' && window.__game.level && !window.__game.level.__stale && !!window.__game.level.player,
      null, { timeout: 30000 },
    );
  }
  return page.evaluate((tab) => {
    const g = window.__game;
    g.shop.open();
    const btn = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === tab);
    if (btn) btn.click();
    const cards = [...document.querySelectorAll('.shop-item')].map((el) => ({
      id: el.dataset.id,
      name: el.querySelector('.shop-name').textContent,
      desc: el.querySelector('.shop-desc').textContent,
      price: el.querySelector('.shop-price').textContent,
      maxed: el.classList.contains('maxed'),
      confirm: el.classList.contains('confirm'),
    }));
    return { tabs: [...document.querySelectorAll('.shop-tab')].map((t) => t.textContent), cards };
  }, TAB);
}

const stats = () => page.evaluate(() => {
  const p = window.__game.level.player;
  return {
    maxArmor: p.maxArmor, armor: Math.round(p.armor), armorRegen: p.armorRegen,
    reloadMult: p.reloadMult, ammoCapRifle: p.ammoCap('rifle'), rifleReserve: p.ammo.rifle.reserve,
    closeMult: p.tier2.closeMult, farMult: p.tier2.farMult, ammoMult: p.tier2.ammoMult,
    coins: window.__game.save.coins,
    owned: Object.fromEntries(Object.entries(window.__game.save.upgrades).filter(([k]) => k.startsWith('t2-'))),
  };
});

const clickItem = (id) => page.evaluate((wanted) => {
  const el = [...document.querySelectorAll('.shop-item')].find((n) => n.dataset.id === wanted);
  if (el) el.click();
  const after = [...document.querySelectorAll('.shop-item')].find((n) => n.dataset.id === wanted);
  return after ? { desc: after.querySelector('.shop-desc').textContent, price: after.querySelector('.shop-price').textContent, confirm: after.classList.contains('confirm') } : null;
}, id);

console.log('▸ Неповна базова гілка: ярус видно, але він замкнений');
const partial = await openTier2({ upgrades: { ...FULL_BASE, sneakers: 0 } });
check(partial.tabs.includes(TAB), `вкладка «${TAB}» є в магазині: ${partial.tabs.join(', ')}`);
check(partial.cards.length === 6, `на вкладці шість товарів: ${partial.cards.length}`);
check(partial.cards.every((c) => c.price === '🔒'), 'усі шість показані замком 🔒');
check(partial.cards.every((c) => c.desc.includes('лишилось 1')), `підказка каже, скільки лишилось: ${partial.cards[0].desc}`);
const lockedBuy = await clickItem('t2-carapace');
const afterLocked = await stats();
check(!afterLocked.owned['t2-carapace'] && afterLocked.coins === 50000, 'клік по замкненому нічого не купує', JSON.stringify(afterLocked.owned));
check(lockedBuy.price === '🔒', 'після кліку картка лишається замкненою');

console.log('▸ Повна базова гілка (старий сейв) відкриває ярус без міграції');
const open = await openTier2({ upgrades: { ...FULL_BASE } });
check(open.cards.every((c) => c.price.includes('3200') || c.price.includes('3600') || c.price.includes('4200')),
  `ціни ярусу видно: ${open.cards.map((c) => c.price.replace(/\s*₴\s*/, '')).join(' · ')}`);
check(open.cards.every((c) => c.desc.includes('закриється назавжди')),
  `попередження про незворотність видно ЩЕ ДО кліку: ${open.cards[0].desc}`);
const before = await stats();
check(before.maxArmor === 150 && before.armorRegen === 0 && before.reloadMult === 1 && before.ammoMult === 1,
  'до покупки герой рівно такий, як давала базова гілка', JSON.stringify(before));

console.log('▸ Покупка у два кроки: перший клік лише попереджає');
const armed = await clickItem('t2-carapace');
const afterFirst = await stats();
check(armed.confirm && armed.price === 'Точно? Тисни ще раз', `картка чекає підтвердження: «${armed.price}»`);
check(armed.desc.includes('НАЗАВЖДИ') && armed.desc.includes('Нанопластини'), `попередження називає, що закриється: ${armed.desc}`);
check(afterFirst.coins === 50000 && !afterFirst.owned['t2-carapace'], 'перший клік монет не списав');

console.log('▸ Другий клік купує, ефект одразу на гравці');
await clickItem('t2-carapace');
const bought = await stats();
check(bought.owned['t2-carapace'] === 1, 'покупка записана в сейв');
check(bought.coins === 50000 - 3200, `списано 3200 монет: ${bought.coins}`);
check(bought.maxArmor === 300, `+150 максимальної броні (150 → ${bought.maxArmor})`);
check(bought.armor === 300, `нову броню видано одразу: ${bought.armor}`);

console.log('▸ Напарник по парі закритий назавжди, інші пари вільні');
const afterPair = await page.evaluate((tab) => {
  const g = window.__game;
  g.shop.render();
  const btn = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === tab);
  if (btn) btn.click();
  return [...document.querySelectorAll('.shop-item')].map((el) => ({
    id: el.dataset.id, desc: el.querySelector('.shop-desc').textContent, price: el.querySelector('.shop-price').textContent,
  }));
}, TAB);
const nano = afterPair.find((c) => c.id === 't2-nanoplates');
const marks = afterPair.find((c) => c.id === 't2-marksman');
check(nano.price === '🔒' && nano.desc.includes('назавжди'), `Нанопластини закриті: «${nano.desc}»`);
check(marks.price.includes('4200'), `сусідня пара лишилась вільною: «${marks.price}»`);
await clickItem('t2-nanoplates');
await clickItem('t2-nanoplates');
const stillOne = await stats();
check(!stillOne.owned['t2-nanoplates'] && stillOne.armorRegen === 0, 'закрите не купується навіть двома кліками', JSON.stringify(stillOne.owned));
check(stillOne.coins === 50000 - 3200, 'монети за закрите не списались');

console.log('▸ Ефекти двох інших пар реально лягають на гравця');
const dist = await page.evaluate(() => {
  const p = window.__game.level.player;
  return { at5: p.tier2.closeMult, near: p.tier2.closeRange };
});
check(dist.at5 === 1, 'без покупки пари «Постріл» множника дистанції нема');
await openTier2({ upgrades: { ...FULL_BASE, 't2-carapace': 1 } });
await clickItem('t2-marksman');
await clickItem('t2-marksman');
await clickItem('t2-quickhands');
await clickItem('t2-quickhands');
const full = await stats();
check(full.owned['t2-marksman'] === 1 && full.owned['t2-quickhands'] === 1, 'куплено по одному з двох інших пар', JSON.stringify(full.owned));
check(full.farMult === 1.5 && full.closeMult === 1, 'Далекобій діє, Впритул — ні');
check(full.reloadMult === 0.55, `перезарядка вкоротилась: ×${full.reloadMult}`);
check(full.maxArmor === 300, 'куплений раніше Панцир не стерся новими покупками');

console.log('▸ Патронташ піднімає стелю й наявний запас, і робить це РІВНО раз');
const belt = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.level.player;
  const capBefore = p.ammoCap('rifle');
  const reserveBefore = p.ammo.rifle.reserve;
  g.save.upgrades['t2-ammobelt'] = 1;
  p.applyGear(g.save.upgrades, { maxArmor: 0, damageTakenMult: 1 });
  const once = { cap: p.ammoCap('rifle'), reserve: p.ammo.rifle.reserve };
  p.applyGear(g.save.upgrades, { maxArmor: 0, damageTakenMult: 1 });
  p.applyGear(g.save.upgrades, { maxArmor: 0, damageTakenMult: 1 });
  return { capBefore, reserveBefore, once, twice: { cap: p.ammoCap('rifle'), reserve: p.ammo.rifle.reserve } };
});
check(belt.once.cap === Math.round(belt.capBefore * 1.6), `стеля запасу ×1.6: ${belt.capBefore} → ${belt.once.cap}`);
check(belt.once.reserve === Math.round(belt.reserveBefore * 1.6), `наявний запас підтягнуто: ${belt.reserveBefore} → ${belt.once.reserve}`);
check(belt.twice.reserve === belt.once.reserve, 'повторний applyGear патронів більше не доливає');

console.log('▸ Режим із фіксованим лоадаутом лишається поза ярусом');
const knockout = await page.evaluate(async () => {
  const g = window.__game;
  g.save.upgrades = { maxhp: 4, speed: 3, damage: 3, vest: 2, helmet: 1, sneakers: 1, 't2-carapace': 1, 't2-marksman': 1 };
  if (g.level) g.level.__stale = true;
  g.startKnockout();
  return true;
});
if (knockout) {
  await page.waitForFunction(
    () => window.__game.state === 'level' && window.__game.level && !window.__game.level.__stale && !!window.__game.level.player,
    null, { timeout: 30000 },
  );
}
const ko = await page.evaluate(() => {
  const p = window.__game.level.player;
  return { maxArmor: p.maxArmor, farMult: p.tier2.farMult, knockout: !!window.__game.level.knockout };
});
check(ko.knockout, 'запустився саме Нокаут');
check(ko.farMult === 1, 'у фіксованому лоадауті ярус не діє — як і пасивки країн', JSON.stringify(ko));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  fail += errors.length;
}
console.log(fail === 0 ? '🎉 ЯРУС 2 ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail === 0 ? 0 : 1);
