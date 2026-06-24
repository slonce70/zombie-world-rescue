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

console.log('▸ Золотий скін героя');
const res = await page.evaluate(async () => {
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'goldskin');
  const g = window.__game;
  g.test.giveCoins(6000);
  const before = g.save.coins;
  g.test.shopBuy('goldskin');
  const afterFirst = g.save.coins;
  g.test.shopBuy('goldskin');
  const afterSecond = g.save.coins;
  let built = false;
  try { built = !!makeHero('gold', g.save.hero).group; } catch (e) { built = false; }
  return {
    meta: HERO_SKINS.gold && item && { price: item.price, skin: item.skin, max: item.max, cat: item.cat },
    owned: g.save.skins.includes('gold'),
    active: g.save.activeSkin,
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
    built,
  };
});
check(res.meta && res.meta.price === 2500 && res.meta.skin === 'gold' && res.meta.max === 1,
  'золотий скін є в магазині за 2500 монет', JSON.stringify(res.meta));
check(res.owned && res.active === 'gold' && res.firstCost === 2500 && res.secondCost === 0,
  'покупка додає скін назавжди, одягає його і не списує вдруге', JSON.stringify(res));
check(res.built, 'makeHero("gold") будується без помилок');

await page.goto(`${BASE}/?test&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const persisted = await page.evaluate(() => ({ owned: window.__game.save.skins.includes('gold'), active: window.__game.save.activeSkin }));
check(persisted.owned && persisted.active === 'gold', 'золотий скін лишається після перезавантаження', JSON.stringify(persisted));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЗОЛОТИЙ СКІН ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
