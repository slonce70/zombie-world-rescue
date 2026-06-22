import { chromium } from 'playwright';
const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Гаджет «Золоте яблуко»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const G = GADGETS.goldapple;
  return {
    meta: G && { cd: G.cd, price: G.price, icon: G.icon },
    shop: SHOP_ITEMS.some((i) => i.id === 'goldapple' && i.gadget && i.price === 1000),
  };
});
check(meta.meta && meta.meta.cd === 45 && meta.meta.price === 1000 && meta.meta.icon === '🍎', 'мета: 45с cd, 1000 монет, 🍎', JSON.stringify(meta));
check(meta.shop, 'товар є в магазині за 1000');

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(3000);
  const before = g.save.coins;
  g.test.shopBuy('goldapple');
  return { owned: g.save.gadgetsOwned.includes('goldapple'), active: g.save.activeGadget, cost: before - g.save.coins };
});
check(buy.owned && buy.cost === 1000, 'куплене яблуко owned, -1000 монет', JSON.stringify(buy));

const eff = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  g.test.unlockGadget('goldapple'); g.test.gadgetCdReset();
  const baseMax = p.maxHealth; p.health = baseMax;
  g.test.useGadget();
  const onUse = { maxHealth: p.maxHealth, health: p.health, appleT: p.appleT };
  // прокручуємо >5с напряму — headless-RAF майже стоїть (dt клампиться)
  for (let i = 0; i < 60; i++) p.update(0.1, g.input, true);
  const afterExpire = { maxHealth: p.maxHealth, health: p.health, appleT: p.appleT };
  return { baseMax, onUse, afterExpire };
});
check(eff.onUse.maxHealth === eff.baseMax + 20 && eff.onUse.health === eff.baseMax + 20, 'яблуко дає +20 макс і +20 HP', JSON.stringify(eff));
check(eff.onUse.appleT > 4.5, 'таймер ~5с', JSON.stringify(eff));
check(eff.afterExpire.maxHealth === eff.baseMax && eff.afterExpire.appleT === 0, 'через 5с бонус згасає — maxHealth назад до базового', JSON.stringify(eff));
check(eff.afterExpire.health <= eff.baseMax, 'HP клампиться до базового макс після згасання', JSON.stringify(eff));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ЗОЛОТЕ ЯБЛУКО ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
