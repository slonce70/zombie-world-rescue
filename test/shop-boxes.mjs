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

console.log('▸ Великий бокс у магазині');
const res = await page.evaluate(async () => {
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  g.shop.open();
  const tabs = [...document.querySelectorAll('.shop-tab')].map((t) => t.textContent);
  const boxTab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Бокси');
  if (boxTab) boxTab.click();
  const boxItems = [...document.querySelectorAll('.shop-item')].map((i) => i.dataset.id);
  g.shop.close();

  const buyWithRoll = (roll) => {
    const old = Math.random;
    Math.random = () => roll;
    const before = { coins: g.save.coins, crystals: g.save.crystals || 0, skins: [...g.save.skins], active: g.save.activeSkin };
    try { g.test.shopBuy('bigbox'); } finally { Math.random = old; }
    return { before, after: { coins: g.save.coins, crystals: g.save.crystals || 0, skins: [...g.save.skins], active: g.save.activeSkin } };
  };

  g.save.coins = 50;
  g.save.crystals = 9;
  const denied = buyWithRoll(0.1);
  g.save.coins = 50;
  g.save.crystals = 10;
  const coins = buyWithRoll(0.64);
  g.save.coins = 50;
  g.save.crystals = 10;
  const crystals = buyWithRoll(0.91);
  g.save.coins = 50;
  g.save.crystals = 10;
  const skin = buyWithRoll(0.99);

  let built = false, looksSilver = false;
  try {
    const rig = makeHero('silver', g.save.hero);
    built = !!rig.group;
    looksSilver = rig.heroSkin === 'silver';
  } catch (e) { built = false; }

  const item = SHOP_ITEMS.find((i) => i.id === 'bigbox');
  return {
    tabs,
    boxItems,
    item: item && { crystalPrice: item.crystalPrice, max: item.max, cat: item.cat },
    silverMeta: HERO_SKINS.silver,
    denied,
    coins,
    crystals,
    skin,
    built,
    looksSilver,
  };
});

check(res.tabs.includes('Бокси') && res.boxItems.includes('bigbox'), `є розділ «Бокси» з великим боксом: ${res.tabs.join(', ')}`);
check(res.item && res.item.crystalPrice === 10 && res.item.max === Infinity && res.item.cat === 'Бокси',
  'великий бокс коштує 10 кристалів і купується повторно', JSON.stringify(res.item));
check(res.denied.after.crystals === 9 && res.denied.after.coins === 50,
  '9 кристалів недостатньо для великого бокса', JSON.stringify(res.denied));
check(res.coins.after.crystals === 0 && res.coins.after.coins === 250,
  'roll 0.64 дає 200 монет', JSON.stringify(res.coins));
check(res.crystals.after.crystals === 15 && res.crystals.after.coins === 50,
  'roll 0.91 дає 15 кристалів після ціни бокса', JSON.stringify(res.crystals));
check(res.skin.after.crystals === 0 && res.skin.after.skins.includes('silver') && res.skin.after.active === 'silver',
  'roll 0.99 дає срібний скін і одягає його', JSON.stringify(res.skin));
check(res.silverMeta && res.built && res.looksSilver, 'срібний скін має метадані і будується без fallback', JSON.stringify({ meta: res.silverMeta, built: res.built, looksSilver: res.looksSilver }));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 БОКСИ МАГАЗИНУ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
