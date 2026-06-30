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
  const hyper = SHOP_ITEMS.find((i) => i.id === 'dash-hyper');
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon },
    item: item && { price: item.price, max: item.max, gadget: item.gadget },
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget },
  };
});
check(meta.gadget && meta.gadget.cd === 30 && meta.gadget.price === 1000 && meta.gadget.icon === '🏃',
  'мета: 30с cd, 1000 монет, 🏃', JSON.stringify(meta));
check(meta.item && meta.item.price === 1000 && meta.item.max === 1 && meta.item.gadget,
  'ривок продається як гаджет за 1000 монет', JSON.stringify(meta.item));
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.hyper === 'dash' && meta.hyper.needsGadget === 'dash',
  'гіперзаряд ривка коштує 5000 і потребує базовий ривок', JSON.stringify(meta.hyper));

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

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.save.gadgetHypers = [];
  g.save.gadgetsOwned = [];
  g.test.giveCoins(12000);
  const beforeLocked = g.save.coins;
  g.test.shopBuy('dash-hyper');
  const afterLocked = g.save.coins;
  g.test.unlockGadget('dash');
  g.test.shopBuy('dash-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('dash-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    lockedCost: beforeLocked - afterLocked,
    firstCost: afterLocked - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(hyperBuy.hypers.includes('dash') && hyperBuy.lockedCost === 0 && hyperBuy.firstCost === 5000 && hyperBuy.secondCost === 0,
  'гіперзаряд ривка купується після базового гаджета один раз', JSON.stringify(hyperBuy));

const dash = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('dash');
  g.save.gadgetHypers = [];
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

const hyperDash = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  for (const zb of g.level.zombies.list) zb.state = 'dead';
  g.test.unlockGadget('dash');
  g.save.gadgetHypers = ['dash'];
  g.save.activeGadget = 'dash';
  g.test.gadgetCdReset();
  g.test.teleport(0, 150);
  p.yaw = 0;
  p.health = 100;
  p.respawnProtect = 0;
  g.level.gadgets._meteorFires = [];
  const before = { x: p.pos.x, z: p.pos.z };
  const used = g.test.useGadget();
  const after = { x: p.pos.x, z: p.pos.z };
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  const fires = g.level.gadgets._meteorFires;
  const fireCount = fires.length;
  const fire = fires[Math.floor(fires.length / 2)];
  if (!fire) {
    return {
      used,
      moved,
      forward: before.z - after.z,
      protectedFor: p.respawnProtect,
      protectedHp: p.health,
      fireCount: 0,
      after2s: { nearDmg: 0, farDmg: 0, fires: 0 },
      after9s: 0,
      expired: 0,
    };
  }
  const near = g.level.zombies.spawn('tank', fire.x, fire.z, {});
  const far = g.level.zombies.spawn('tank', fire.x + 5, fire.z, {});
  near.hp = near.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  for (let i = 0; i < 4; i++) g.level.gadgets._updateMeteorFires(0.5);
  const after2s = { nearDmg: 1000 - near.hp, farDmg: 1000 - far.hp, fires: g.level.gadgets._meteorFires.length };
  for (let i = 0; i < 14; i++) g.level.gadgets._updateMeteorFires(0.5);
  const after9s = g.level.gadgets._meteorFires.length;
  for (let i = 0; i < 3; i++) g.level.gadgets._updateMeteorFires(0.5);
  const protectedFor = p.respawnProtect;
  p.takeDamage(40, p.pos.x + 1, p.pos.z);
  const protectedHp = p.health;
  return {
    used,
    moved,
    forward: before.z - after.z,
    protectedFor,
    protectedHp,
    fireCount,
    after2s,
    after9s,
    expired: g.level.gadgets._meteorFires.length,
  };
});
check(hyperDash.used && hyperDash.moved >= 10 && hyperDash.moved <= 13 && hyperDash.forward > 9,
  'гіпер-ривок переносить приблизно на 12 метрів', JSON.stringify(hyperDash));
check(hyperDash.protectedFor >= 2.9 && hyperDash.protectedHp === 100,
  'гіпер-ривок дає 3 секунди невразливості', JSON.stringify(hyperDash));
check(hyperDash.fireCount >= 3, 'гіпер-ривок лишає вогняний слід', JSON.stringify(hyperDash));
check(hyperDash.after2s.nearDmg === 10 && hyperDash.after2s.farDmg === 0,
  'вогняний слід ривка наносить 5 HP/с тільки поруч', JSON.stringify(hyperDash.after2s));
check(hyperDash.after9s > 0 && hyperDash.expired === 0,
  'вогняний слід тримається 10 секунд і потім прибирається', JSON.stringify(hyperDash));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РИВОК ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
