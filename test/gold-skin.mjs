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

console.log('▸ Скін Чарівник');
const wizard = await page.evaluate(async () => {
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'wizardskin');
  const g = window.__game;
  g.save.crystals = 25;
  const before = g.save.crystals;
  g.test.shopBuy('wizardskin');
  const afterFirst = g.save.crystals;
  g.test.shopBuy('wizardskin');
  const afterSecond = g.save.crystals;
  let built = false, looksWizard = false;
  try {
    const rig = makeHero('wizard', g.save.hero);
    built = !!rig.group;
    looksWizard = rig.heroSkin === 'wizard';
  } catch (e) { built = false; }
  return {
    meta: HERO_SKINS.wizard && item && { price: item.price, crystalPrice: item.crystalPrice, skin: item.skin, max: item.max, cat: item.cat },
    owned: g.save.skins.includes('wizard'),
    active: g.save.activeSkin,
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
    built,
    looksWizard,
  };
});
check(wizard.meta && wizard.meta.price === 0 && wizard.meta.crystalPrice === 25 && wizard.meta.skin === 'wizard' && wizard.meta.max === 1,
  'скін Чарівник є в магазині за 25 кристалів', JSON.stringify(wizard.meta));
check(wizard.owned && wizard.active === 'wizard' && wizard.firstCost === 25 && wizard.secondCost === 0,
  'покупка додає Чарівника назавжди, одягає його і не списує вдруге', JSON.stringify(wizard));
check(wizard.built && wizard.looksWizard, 'makeHero("wizard") використовує окремий builder Чарівника, не fallback', JSON.stringify(wizard));

await page.goto(`${BASE}/?test&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const persisted = await page.evaluate(() => ({
  gold: window.__game.save.skins.includes('gold'),
  wizard: window.__game.save.skins.includes('wizard'),
  active: window.__game.save.activeSkin,
}));
check(persisted.gold && persisted.wizard && persisted.active === 'wizard',
  'куплені скіни лишаються після перезавантаження, активний Чарівник', JSON.stringify(persisted));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЗОЛОТИЙ СКІН ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
