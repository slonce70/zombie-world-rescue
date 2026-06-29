import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
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

console.log('▸ Профі набір');
const pro = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  const item = SHOP_ITEMS.find((i) => i.id === 'propack');
  g.shop.open();
  const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Набори');
  if (tab) tab.click();
  const card = document.querySelector('.shop-item[data-id="propack"]');
  const p = g.level.player;
  p.grenades = 0;
  p.ammo.bazooka.reserve = 0;
  p.ammo.rifle.reserve = 0;
  g.save.skins = ['classic', 'custom'];
  g.save.activeSkin = 'classic';
  g.save.xp = 0;
  g.save.coins = 3499;
  g.save.crystals = 35;
  g.test.shopBuy('propack');
  const deniedCoins = { coins: g.save.coins, crystals: g.save.crystals, grenades: p.grenades, xp: g.save.xp, skins: [...g.save.skins] };
  g.save.coins = 3500;
  g.save.crystals = 34;
  g.test.shopBuy('propack');
  const deniedCrystals = { coins: g.save.coins, crystals: g.save.crystals, grenades: p.grenades, xp: g.save.xp, skins: [...g.save.skins] };
  g.save.coins = 3500;
  g.save.crystals = 35;
  g.test.shopBuy('propack');
  const bought = {
    coins: g.save.coins,
    crystals: g.save.crystals,
    grenades: p.grenades,
    rockets: p.ammo.bazooka.reserve,
    ammo: p.ammo.rifle.reserve,
    xp: g.save.xp,
    skins: [...g.save.skins],
    activeSkin: g.save.activeSkin,
  };
  g.shop.close();
  return {
    item: item && { name: item.name, cat: item.cat, price: item.price, crystalPrice: item.crystalPrice, max: item.max },
    card: card && { price: card.querySelector('.shop-price')?.textContent.trim(), desc: card.querySelector('.shop-desc')?.textContent.trim() },
    deniedCoins,
    deniedCrystals,
    bought,
  };
});

check(pro.item && pro.item.name === 'Профі набір' && pro.item.cat === 'Набори',
  'профі набір є у вкладці «Набори»', JSON.stringify(pro.item));
check(pro.item && pro.item.price === 3500 && pro.item.crystalPrice === 35 && pro.item.max === Infinity,
  'профі набір коштує 3500 монет і 35 кристалів', JSON.stringify(pro.item));
check(pro.card && /3500/.test(pro.card.price) && /35/.test(pro.card.price) && pro.card.desc.includes('250 XP'),
  'картка профі набору показує ціну і склад', JSON.stringify(pro.card));
check(pro.deniedCoins.coins === 3499 && pro.deniedCoins.crystals === 35 && pro.deniedCoins.grenades === 0 && pro.deniedCoins.xp === 0 && !pro.deniedCoins.skins.includes('gold'),
  '3499 монет недостатньо для профі набору', JSON.stringify(pro.deniedCoins));
check(pro.deniedCrystals.coins === 3500 && pro.deniedCrystals.crystals === 34 && pro.deniedCrystals.grenades === 0 && pro.deniedCrystals.xp === 0 && !pro.deniedCrystals.skins.includes('gold'),
  '34 кристалів недостатньо для профі набору', JSON.stringify(pro.deniedCrystals));
check(pro.bought.coins === 100 && pro.bought.crystals === 0 && pro.bought.grenades === 5 && pro.bought.rockets === 3
  && pro.bought.ammo === 90 && pro.bought.xp === 250 && pro.bought.skins.includes('gold') && pro.bought.activeSkin === 'gold',
  'купівля профі набору дає золотий скін, 5 гранат, 3 ракети, 250 XP і 90 патронів', JSON.stringify(pro.bought));

console.log('▸ Військовий набір');
const military = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  const item = SHOP_ITEMS.find((i) => i.id === 'militarypack');
  g.shop.open();
  const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Набори');
  if (tab) tab.click();
  const card = document.querySelector('.shop-item[data-id="militarypack"]');
  const p = g.level.player;
  p.grenades = 0;
  p.ammo.bazooka.reserve = 0;
  p.ammo.rifle.reserve = 0;
  g.save.skins = ['classic', 'custom'];
  g.save.activeSkin = 'classic';
  g.save.coins = 999;
  g.save.crystals = 20;
  g.test.shopBuy('militarypack');
  const deniedCoins = { coins: g.save.coins, crystals: g.save.crystals, grenades: p.grenades, skins: [...g.save.skins] };
  g.save.coins = 1000;
  g.save.crystals = 19;
  g.test.shopBuy('militarypack');
  const deniedCrystals = { coins: g.save.coins, crystals: g.save.crystals, grenades: p.grenades, skins: [...g.save.skins] };
  g.save.coins = 1000;
  g.save.crystals = 20;
  g.test.shopBuy('militarypack');
  const bought = {
    coins: g.save.coins,
    crystals: g.save.crystals,
    grenades: p.grenades,
    rockets: p.ammo.bazooka.reserve,
    ammo: p.ammo.rifle.reserve,
    skins: [...g.save.skins],
    activeSkin: g.save.activeSkin,
  };
  g.shop.close();
  return {
    item: item && { name: item.name, cat: item.cat, price: item.price, crystalPrice: item.crystalPrice, max: item.max },
    card: card && { price: card.querySelector('.shop-price')?.textContent.trim(), desc: card.querySelector('.shop-desc')?.textContent.trim() },
    deniedCoins,
    deniedCrystals,
    bought,
  };
});

check(military.item && military.item.name === 'Військовий набір' && military.item.cat === 'Набори',
  'військовий набір є у вкладці «Набори»', JSON.stringify(military.item));
check(military.item && military.item.price === 1000 && military.item.crystalPrice === 20 && military.item.max === Infinity,
  'військовий набір коштує 1000 монет і 20 кристалів', JSON.stringify(military.item));
check(military.card && /1000/.test(military.card.price) && /20/.test(military.card.price) && military.card.desc.includes('+120'),
  'картка військового набору показує ціну і склад', JSON.stringify(military.card));
check(military.deniedCoins.coins === 999 && military.deniedCoins.crystals === 20 && military.deniedCoins.grenades === 0 && !military.deniedCoins.skins.includes('military'),
  '999 монет недостатньо для військового набору', JSON.stringify(military.deniedCoins));
check(military.deniedCrystals.coins === 1000 && military.deniedCrystals.crystals === 19 && military.deniedCrystals.grenades === 0 && !military.deniedCrystals.skins.includes('military'),
  '19 кристалів недостатньо для військового набору', JSON.stringify(military.deniedCrystals));
check(military.bought.coins === 0 && military.bought.crystals === 0 && military.bought.grenades === 5 && military.bought.rockets === 5
  && military.bought.ammo === 120 && military.bought.skins.includes('military') && military.bought.activeSkin === 'military',
  'купівля військового набору дає військовий скін, 5 гранат, 5 ракет і 120 патронів', JSON.stringify(military.bought));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 НАБОРИ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
