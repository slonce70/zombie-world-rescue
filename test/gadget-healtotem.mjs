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

console.log('▸ Гаджет «Тотем відновлення»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'healtotem');
  return {
    gadget: GADGETS.healtotem && { cd: GADGETS.healtotem.cd, icon: GADGETS.healtotem.icon },
    item: item && { crystalPrice: item.crystalPrice, max: item.max, gadget: item.gadget },
  };
});
check(meta.gadget && meta.gadget.cd === 45 && meta.gadget.icon === '🪬', 'мета: 45с cd, 🪬', JSON.stringify(meta));
check(meta.item && meta.item.crystalPrice === 20 && meta.item.max === 1 && meta.item.gadget,
  'тотем продається як гаджет за 20 кристалів', JSON.stringify(meta.item));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 50;
  g.save.crystals = 19;
  g.test.shopBuy('healtotem');
  const denied = { coins: g.save.coins, crystals: g.save.crystals, owned: g.save.gadgetsOwned.includes('healtotem') };
  g.save.crystals = 20;
  g.test.shopBuy('healtotem');
  const bought = { coins: g.save.coins, crystals: g.save.crystals, owned: g.save.gadgetsOwned.includes('healtotem'), active: g.save.activeGadget };
  g.save.crystals = 20;
  g.test.shopBuy('healtotem');
  return { denied, bought, afterSecond: { coins: g.save.coins, crystals: g.save.crystals } };
});
check(buy.denied.crystals === 19 && !buy.denied.owned, '19 кристалів недостатньо', JSON.stringify(buy.denied));
check(buy.bought.crystals === 0 && buy.bought.coins === 50 && buy.bought.owned && buy.bought.active === 'healtotem',
  '20 кристалів купують тотем назавжди і не списують монети', JSON.stringify(buy.bought));
check(buy.afterSecond.crystals === 20 && buy.afterSecond.coins === 50, 'повторна покупка не списує кристали', JSON.stringify(buy.afterSecond));

const effect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('healtotem');
  g.save.activeGadget = 'healtotem';
  g.test.gadgetCdReset();
  g.test.teleport(0, 130);
  p.yaw = 0;
  p.health = 40;
  const used = g.test.useGadget();
  const totem = (g.level.gadgets.totems || [])[0];
  if (!totem || typeof g.level.gadgets._updateTotems !== 'function') {
    return { start: { used, count: (g.level.gadgets.totems || []).length, hp: null, cd: g.level.gadgets.cd }, inside: { hp: p.health }, outside: { hp: p.health }, afterHit: { count: (g.level.gadgets.totems || []).length } };
  }
  const start = { used, count: g.level.gadgets.totems.length, hp: totem && totem.hp, cd: g.level.gadgets.cd };
  p.pos.x = totem.x + 3.9;
  p.pos.z = totem.z + 3.9;
  g.level.gadgets._updateTotems(1);
  const inside = { hp: p.health };
  p.health = 40;
  p.pos.x = totem.x + 4.1;
  p.pos.z = totem.z;
  g.level.gadgets._updateTotems(1);
  const outside = { hp: p.health };
  const z = g.test.spawnZombie('walker', totem.x + 0.5, totem.z);
  z.aggroed = true;
  z.stats.dmg = 80;
  g.level.gadgets._updateTotems(1);
  return { start, inside, outside, afterHit: { count: g.level.gadgets.totems.length } };
});
check(effect.start.used && effect.start.count === 1 && effect.start.hp === 50, 'тотем ставиться з 50 HP', JSON.stringify(effect.start));
check(effect.start.cd === 45, 'перезарядка тотема 45с', JSON.stringify(effect.start));
check(effect.inside.hp === 45, 'в площі 8×8 тотем лікує 5 HP за секунду', JSON.stringify(effect.inside));
check(effect.outside.hp === 40, 'поза площою 8×8 тотем не лікує', JSON.stringify(effect.outside));
check(effect.afterHit.count === 0, 'зомбі можуть зламати тотем', JSON.stringify(effect.afterHit));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ТОТЕМ ВІДНОВЛЕННЯ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
