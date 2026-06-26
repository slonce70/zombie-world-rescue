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
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  const item = SHOP_ITEMS.find((i) => i.id === 'frogskin');
  const military = SHOP_ITEMS.find((i) => i.id === 'militaryskin');
  g.save.crystals = 14;
  const coins0 = g.save.coins;
  g.test.shopBuy('frogskin');
  const denied = { crystals: g.save.crystals, owned: g.save.skins.includes('frog') };
  g.save.crystals = 15;
  g.test.shopBuy('frogskin');
  const bought = { crystals: g.save.crystals, coins: g.save.coins, owned: g.save.skins.includes('frog'), active: g.save.activeSkin };
  g.test.shopBuy('frogskin');
  const afterSecond = g.save.crystals;
  g.save.crystals = 15;
  g.test.shopBuy('militaryskin');
  const militaryBought = { crystals: g.save.crystals, owned: g.save.skins.includes('military'), active: g.save.activeSkin };
  let militaryBuilt = false;
  try { militaryBuilt = !!makeHero('military', g.save.hero).group; } catch (e) { militaryBuilt = false; }
  return {
    item: item && { crystalPrice: item.crystalPrice, skin: item.skin, max: item.max },
    military: HERO_SKINS.military && military && { name: HERO_SKINS.military.name, crystalPrice: military.crystalPrice, skin: military.skin, max: military.max },
    militaryBought,
    militaryBuilt,
    coins0,
    denied,
    bought,
    afterSecond,
  };
});
check(buy.item && buy.item.crystalPrice === 15 && buy.item.skin === 'frog' && buy.item.max === 1,
  'frog skin є в магазині за 15 кристалів', JSON.stringify(buy.item));
check(buy.military && buy.military.crystalPrice === 15 && buy.military.skin === 'military' && buy.military.max === 1,
  'військовий скін є в магазині за 15 кристалів', JSON.stringify(buy.military));
check(buy.denied.crystals === 14 && !buy.denied.owned, '14 кристалів недостатньо для покупки', JSON.stringify(buy.denied));
check(buy.bought.crystals === 0 && buy.bought.coins === buy.coins0 && buy.bought.owned && buy.bought.active === 'frog',
  '15 кристалів купують скін без списання монет і одягають його', JSON.stringify(buy.bought));
check(buy.afterSecond === 0, 'повторна покупка не списує кристали', JSON.stringify(buy));
check(buy.militaryBought.crystals === 0 && buy.militaryBought.owned && buy.militaryBought.active === 'military',
  '15 кристалів купують військовий скін і одягають його', JSON.stringify(buy.militaryBought));
check(buy.militaryBuilt, 'makeHero("military") будується без помилок');

console.log('▸ Обмін кристалів на монети');
const exchange = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  const item = SHOP_ITEMS.find((i) => i.id === 'coins500');
  const item1000 = SHOP_ITEMS.find((i) => i.id === 'coins1000');
  const item5100 = SHOP_ITEMS.find((i) => i.id === 'coins5100');
  const itemXp = SHOP_ITEMS.find((i) => i.id === 'passxp25');
  g.save.coins = 50;
  g.save.crystals = 9;
  g.test.shopBuy('coins500');
  const denied = { coins: g.save.coins, crystals: g.save.crystals };
  g.save.crystals = 10;
  g.test.shopBuy('coins500');
  const bought = { coins: g.save.coins, crystals: g.save.crystals };
  g.save.crystals = 10;
  g.test.shopBuy('coins500');
  const second = { coins: g.save.coins, crystals: g.save.crystals };
  g.save.coins = 50;
  g.save.crystals = 20;
  g.test.shopBuy('coins1000');
  const denied1000 = { coins: g.save.coins, crystals: g.save.crystals };
  g.save.crystals = 21;
  g.test.shopBuy('coins1000');
  const bought1000 = { coins: g.save.coins, crystals: g.save.crystals };
  g.save.coins = 50;
  g.save.crystals = 99;
  g.test.shopBuy('coins5100');
  const denied5100 = { coins: g.save.coins, crystals: g.save.crystals };
  g.save.crystals = 100;
  g.test.shopBuy('coins5100');
  const bought5100 = { coins: g.save.coins, crystals: g.save.crystals };
  g.save.coins = 50;
  g.save.xp = 0;
  g.save.crystals = 9;
  g.test.shopBuy('passxp25');
  const deniedXp = { xp: g.save.xp, coins: g.save.coins, crystals: g.save.crystals };
  g.save.crystals = 10;
  g.test.shopBuy('passxp25');
  const boughtXp = { xp: g.save.xp, coins: g.save.coins, crystals: g.save.crystals, level: g.progress.level };
  return {
    item: item && { crystalPrice: item.crystalPrice, coinBundle: item.coinBundle, max: item.max },
    item1000: item1000 && { crystalPrice: item1000.crystalPrice, coinBundle: item1000.coinBundle, max: item1000.max },
    item5100: item5100 && { crystalPrice: item5100.crystalPrice, coinBundle: item5100.coinBundle, max: item5100.max },
    itemXp: itemXp && { crystalPrice: itemXp.crystalPrice, passXp: itemXp.passXp, max: itemXp.max },
    denied,
    bought,
    second,
    denied1000,
    bought1000,
    denied5100,
    bought5100,
    deniedXp,
    boughtXp,
  };
});
check(exchange.item && exchange.item.crystalPrice === 10 && exchange.item.coinBundle === 500 && exchange.item.max === Infinity,
  '500 монет є в магазині за 10 кристалів', JSON.stringify(exchange.item));
check(exchange.item1000 && exchange.item1000.crystalPrice === 21 && exchange.item1000.coinBundle === 1000 && exchange.item1000.max === Infinity,
  '1000 монет є в магазині за 21 кристал', JSON.stringify(exchange.item1000));
check(exchange.item5100 && exchange.item5100.crystalPrice === 100 && exchange.item5100.coinBundle === 5100 && exchange.item5100.max === Infinity,
  '5100 монет є в магазині за 100 кристалів', JSON.stringify(exchange.item5100));
check(exchange.itemXp && exchange.itemXp.crystalPrice === 10 && exchange.itemXp.passXp === 25 && exchange.itemXp.max === Infinity,
  '25 XP Зоряного шляху є в магазині за 10 кристалів', JSON.stringify(exchange.itemXp));
check(exchange.denied.coins === 50 && exchange.denied.crystals === 9,
  '9 кристалів недостатньо для обміну', JSON.stringify(exchange.denied));
check(exchange.bought.coins === 550 && exchange.bought.crystals === 0,
  '10 кристалів купують 500 монет', JSON.stringify(exchange.bought));
check(exchange.second.coins === 1050 && exchange.second.crystals === 0,
  'обмін можна купувати повторно', JSON.stringify(exchange.second));
check(exchange.denied1000.coins === 50 && exchange.denied1000.crystals === 20,
  '20 кристалів недостатньо для 1000 монет', JSON.stringify(exchange.denied1000));
check(exchange.bought1000.coins === 1050 && exchange.bought1000.crystals === 0,
  '21 кристал купує 1000 монет', JSON.stringify(exchange.bought1000));
check(exchange.denied5100.coins === 50 && exchange.denied5100.crystals === 99,
  '99 кристалів недостатньо для 5100 монет', JSON.stringify(exchange.denied5100));
check(exchange.bought5100.coins === 5150 && exchange.bought5100.crystals === 0,
  '100 кристалів купують 5100 монет', JSON.stringify(exchange.bought5100));
check(exchange.deniedXp.xp === 0 && exchange.deniedXp.coins === 50 && exchange.deniedXp.crystals === 9,
  '9 кристалів недостатньо для 25 XP', JSON.stringify(exchange.deniedXp));
check(exchange.boughtXp.xp === 25 && exchange.boughtXp.coins === 50 && exchange.boughtXp.crystals === 0 && exchange.boughtXp.level === 1,
  '10 кристалів купують 25 XP Зоряного шляху', JSON.stringify(exchange.boughtXp));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 КРИСТАЛИ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
