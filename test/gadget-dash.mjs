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

console.log('▸ Гаджет «Ривок»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const G = GADGETS.dash;
  const item = SHOP_ITEMS.find((i) => i.id === 'dash');
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon },
    item: item && { price: item.price, max: item.max, gadget: item.gadget },
  };
});
check(meta.gadget && meta.gadget.cd === 30 && meta.gadget.price === 1000 && meta.gadget.icon === '🏃',
  'мета: 30с cd, 1000 монет, 🏃', JSON.stringify(meta));
check(meta.item && meta.item.price === 1000 && meta.item.max === 1 && meta.item.gadget,
  'ривок продається як гаджет за 1000 монет', JSON.stringify(meta.item));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 999;
  g.test.shopBuy('dash');
  const denied = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('dash') };
  g.save.coins = 1000;
  g.test.shopBuy('dash');
  const bought = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('dash'), active: g.save.activeGadget };
  g.save.coins = 1000;
  g.test.shopBuy('dash');
  return { denied, bought, afterSecond: { coins: g.save.coins } };
});
check(buy.denied.coins === 999 && !buy.denied.owned, '999 монет недостатньо', JSON.stringify(buy.denied));
check(buy.bought.coins === 0 && buy.bought.owned && buy.bought.active === 'dash',
  '1000 монет купують ривок назавжди і роблять активним', JSON.stringify(buy.bought));
check(buy.afterSecond.coins === 1000, 'повторна покупка не списує монети', JSON.stringify(buy.afterSecond));

const dash = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('dash');
  g.test.gadgetCdReset();
  g.test.teleport(0, 150);
  p.yaw = 0;
  p.vel.set(4, 0, 4);
  p.health = 100;
  p.respawnProtect = 0;
  const before = { x: p.pos.x, z: p.pos.z };
  const used = g.test.useGadget();
  const after = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  const groundY = Math.max(g.level.world.groundH(after.x, after.z), g.level.world.floorAt(after.x, after.z, after.y));
  const velAfterDash = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
  p.takeDamage(40, after.x + 1, after.z);
  const protectedHp = p.health;
  const protectLeft = p.respawnProtect;
  p.respawnProtect = 0;
  p.takeDamage(40, after.x + 1, after.z);
  return {
    used,
    cd: g.level.gadgets.cd,
    moved: Math.hypot(after.x - before.x, after.z - before.z),
    forward: before.z - after.z,
    offGround: Math.abs(after.y - groundY),
    velAfterDash,
    protectLeft,
    protectedHp,
    damagedHp: p.health,
  };
});
check(dash.used && dash.cd === 30, 'ривок спрацьовує і ставить cd 30с', JSON.stringify(dash));
check(dash.moved >= 6 && dash.moved <= 9 && dash.forward > 5,
  'гравець ривком зміщується вперед приблизно на 8м', JSON.stringify(dash));
check(dash.offGround < 0.5 && dash.velAfterDash === 0, 'ривок ставить героя на землю і гасить стару швидкість', JSON.stringify(dash));
check(dash.protectLeft > 0 && dash.protectedHp === 100 && dash.damagedHp < 100,
  'після ривка є коротка невразливість, потім шкода знову проходить', JSON.stringify(dash));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РИВОК ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
