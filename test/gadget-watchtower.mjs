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

console.log('▸ Гаджет «Башня спостереження»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  return {
    gadget: GADGETS.watchtower && { cd: GADGETS.watchtower.cd, price: GADGETS.watchtower.price },
    shop: SHOP_ITEMS.some((i) => i.id === 'watchtower' && i.gadget && i.price === 1000),
  };
});
check(meta.gadget && meta.gadget.cd === 125 && meta.gadget.price === 1000, 'мета: 125с cd, 1000 монет', JSON.stringify(meta));
check(meta.shop, 'товар є в магазині');

const shopBuy = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(3000);
  const before = g.save.coins;
  g.test.shopBuy('watchtower');
  const afterFirst = g.save.coins;
  g.test.shopBuy('watchtower');
  const afterSecond = g.save.coins;
  return {
    owned: g.save.gadgetsOwned.includes('watchtower'),
    active: g.save.activeGadget,
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(shopBuy.owned && shopBuy.active === 'watchtower', 'куплена башта стає owned/active', JSON.stringify(shopBuy));
check(shopBuy.firstCost === 1000 && shopBuy.secondCost === 0, 'башту не можна купити вдруге', JSON.stringify(shopBuy));

const placed = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('watchtower');
  g.test.gadgetCdReset();
  g.test.teleport(0, 150);
  p.yaw = 0;
  const used = g.test.useGadget();
  const cdAfterUse = g.level.gadgets.cd;
  const tower = g.level.gadgets.towers[0];
  if (!tower) return { used, count: 0 };
  const groundY = p.pos.y;
  g.test.teleport(tower.x + 1.2, tower.z);
  g.test.key('KeyY', true);
  g.level.gadgets.update(0.1, g.input, true);
  g.test.key('KeyY', false);
  const up = { y: p.pos.y, onTower: !!p.watchtower };
  g.test.key('KeyY', true);
  g.level.gadgets.update(0.1, g.input, true);
  g.test.key('KeyY', false);
  const down = { y: p.pos.y, onTower: !!p.watchtower };
  return {
    used,
    count: g.level.gadgets.towers.length,
    hp: tower.hp,
    cd: cdAfterUse,
    groundY,
    up,
    down,
  };
});
check(placed.used && placed.count === 1, 'башта ставиться', JSON.stringify(placed));
check(placed.hp === 200, 'прочність башти 200', JSON.stringify(placed));
check(placed.cd === 125, 'перезарядка 125с', JSON.stringify(placed));
check(placed.up.onTower && placed.up.y > placed.groundY + 3, 'Y піднімає на башту', JSON.stringify(placed));
check(!placed.down.onTower && Math.abs(placed.down.y - placed.groundY) < 1.5, 'Y спускає з башти', JSON.stringify(placed));

// 🛡 баг-фікс: мелі-зомбі не дістають гравця, поки той на башті
const melee = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const z = g.level.zombies;
  const tower = g.level.gadgets.towers[0];
  const clearProt = () => { p.respawnProtect = 0; p.buffs.bubble = 0; p.gadgetShield = 0; p.armor = 0; p.health = 100; };
  // на башті
  g.test.teleport(tower.x + 1.2, tower.z);
  g.test.key('KeyY', true); g.level.gadgets.update(0.1, g.input, true); g.test.key('KeyY', false);
  const onTower = !!p.watchtower;
  clearProt();
  z._hurt(p, 30, tower.x, tower.z);
  const hpOnTower = p.health;
  // на землі (контроль): спускаємось, мелі має проходити
  g.test.key('KeyY', true); g.level.gadgets.update(0.1, g.input, true); g.test.key('KeyY', false);
  clearProt();
  z._hurt(p, 30, p.pos.x + 1, p.pos.z);
  return { onTower, hpOnTower, hpGround: p.health };
});
check(melee.onTower && melee.hpOnTower === 100, 'на башті мелі-зомбі не б’ють', JSON.stringify(melee));
check(melee.hpGround < 100, 'на землі мелі-зомбі б’ють (контроль)', JSON.stringify(melee));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 БАШТА СПОСТЕРЕЖЕННЯ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
