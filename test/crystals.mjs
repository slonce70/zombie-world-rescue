import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Кристали з мегабокса');
const drop = await page.evaluate(() => {
  const g = window.__game;
  const withRoll = (roll) => {
    const old = Math.random;
    Math.random = () => roll;
    try { g.openMegaboxReward(0, 0); } finally { Math.random = old; }
  };
  const start = g.save.crystals;
  withRoll(0.77);
  const afterHit = g.save.crystals;
  withRoll(0.78);
  return { start, afterHit, afterMiss: g.save.crystals };
});
check(drop.start === 0, 'новий сейв має 0 кристалів', JSON.stringify(drop));
check(drop.afterHit - drop.start === 15, 'roll 0.77 (<78%) дає +15 кристалів', JSON.stringify(drop));
check(drop.afterMiss === drop.afterHit, 'roll 0.78 не дає кристали', JSON.stringify(drop));

console.log('▸ Купівля скінів за кристали');
const buy = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  const item = SHOP_ITEMS.find((i) => i.id === 'frogskin');
  g.save.crystals = 14;
  const coins0 = g.save.coins;
  g.test.shopBuy('frogskin');
  const denied = { crystals: g.save.crystals, owned: g.save.skins.includes('frog') };
  g.save.crystals = 15;
  g.test.shopBuy('frogskin');
  const bought = { crystals: g.save.crystals, coins: g.save.coins, owned: g.save.skins.includes('frog'), active: g.save.activeSkin };
  g.test.shopBuy('frogskin');
  return { item: item && { crystalPrice: item.crystalPrice, skin: item.skin, max: item.max }, coins0, denied, bought, afterSecond: g.save.crystals };
});
check(buy.item && buy.item.crystalPrice === 15 && buy.item.skin === 'frog' && buy.item.max === 1,
  'frog skin є в магазині за 15 кристалів', JSON.stringify(buy.item));
check(buy.denied.crystals === 14 && !buy.denied.owned, '14 кристалів недостатньо для покупки', JSON.stringify(buy.denied));
check(buy.bought.crystals === 0 && buy.bought.coins === buy.coins0 && buy.bought.owned && buy.bought.active === 'frog',
  '15 кристалів купують скін без списання монет і одягають його', JSON.stringify(buy.bought));
check(buy.afterSecond === 0, 'повторна покупка не списує кристали', JSON.stringify(buy));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 КРИСТАЛИ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
