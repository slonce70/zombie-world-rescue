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

console.log('▸ Набори в магазині');
const pack = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  const item = SHOP_ITEMS.find((i) => i.id === 'starterpack');
  g.shop.open();
  const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Набори');
  if (tab) tab.click();
  const card = document.querySelector('.shop-item[data-id="starterpack"]');
  const p = g.level.player;
  p.grenades = 0;
  p.ammo.bazooka.reserve = 0;
  p.ammo.rifle.reserve = 0;
  g.save.coins = 499;
  g.save.crystals = 10;
  g.test.shopBuy('starterpack');
  const deniedCoins = { coins: g.save.coins, crystals: g.save.crystals, grenades: p.grenades, rockets: p.ammo.bazooka.reserve, ammo: p.ammo.rifle.reserve };
  g.save.coins = 500;
  g.save.crystals = 9;
  g.test.shopBuy('starterpack');
  const deniedCrystals = { coins: g.save.coins, crystals: g.save.crystals, grenades: p.grenades, rockets: p.ammo.bazooka.reserve, ammo: p.ammo.rifle.reserve };
  g.save.coins = 500;
  g.save.crystals = 10;
  g.test.shopBuy('starterpack');
  const bought = { coins: g.save.coins, crystals: g.save.crystals, grenades: p.grenades, rockets: p.ammo.bazooka.reserve, ammo: p.ammo.rifle.reserve };
  g.shop.close();
  return {
    item: item && { name: item.name, cat: item.cat, price: item.price, crystalPrice: item.crystalPrice, max: item.max },
    tab: !!tab,
    card: card && { price: card.querySelector('.shop-price')?.textContent.trim(), desc: card.querySelector('.shop-desc')?.textContent.trim() },
    deniedCoins,
    deniedCrystals,
    bought,
  };
});

check(pack.item && pack.item.name === 'Стартовий набір' && pack.item.cat === 'Набори',
  'стартовий набір є у вкладці «Набори»', JSON.stringify(pack.item));
check(pack.item && pack.item.price === 500 && pack.item.crystalPrice === 10 && pack.item.max === Infinity,
  'набір коштує 500 монет і 10 кристалів', JSON.stringify(pack.item));
check(pack.tab && pack.card && /500/.test(pack.card.price) && /10/.test(pack.card.price) && pack.card.desc.includes('+2'),
  'картка набору показує ціну і склад', JSON.stringify(pack.card));
check(pack.deniedCoins.coins === 499 && pack.deniedCoins.crystals === 10 && pack.deniedCoins.grenades === 0,
  '499 монет недостатньо навіть із 10 кристалами', JSON.stringify(pack.deniedCoins));
check(pack.deniedCrystals.coins === 500 && pack.deniedCrystals.crystals === 9 && pack.deniedCrystals.grenades === 0,
  '9 кристалів недостатньо навіть із 500 монетами', JSON.stringify(pack.deniedCrystals));
check(pack.bought.coins === 0 && pack.bought.crystals === 0 && pack.bought.grenades === 2 && pack.bought.rockets === 1 && pack.bought.ammo === 30,
  'купівля додає 2 гранати, 1 ракету і 30 патронів', JSON.stringify(pack.bought));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 НАБОРИ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
