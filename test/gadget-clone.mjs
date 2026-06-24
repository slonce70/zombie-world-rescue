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

console.log('▸ Гаджет «Клон»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  return {
    gadget: GADGETS.clone && { cd: GADGETS.clone.cd, price: GADGETS.clone.price },
    shop: SHOP_ITEMS.some((i) => i.id === 'clone' && i.gadget && i.price === 1000),
  };
});
check(meta.gadget && meta.gadget.cd === 50 && meta.gadget.price === 1000, 'мета: 50с cd, 1000 монет', JSON.stringify(meta));
check(meta.shop, 'товар є в магазині');

const bought = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(3000);
  const before = g.save.coins;
  g.test.shopBuy('clone');
  const afterFirst = g.save.coins;
  g.test.shopBuy('clone');
  return {
    owned: g.save.gadgetsOwned.includes('clone'),
    active: g.save.activeGadget,
    firstCost: before - afterFirst,
    secondCost: afterFirst - g.save.coins,
  };
});
check(bought.owned && bought.active === 'clone', 'куплений клон стає owned/active', JSON.stringify(bought));
check(bought.firstCost === 1000 && bought.secondCost === 0, 'клона не можна купити вдруге', JSON.stringify(bought));

const fight = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('clone');
  g.save.activeGadget = 'clone';
  g.test.gadgetCdReset();
  g.test.teleport(0, 120);
  p.yaw = 0;
  for (const z of g.level.zombies.list) z.state = 'dead';
  const used = g.test.useGadget();
  const clone = (g.level.gadgets.clones || [])[0];
  if (!clone || typeof g.level.gadgets._updateClones !== 'function') return { used, count: 0, cd: g.level.gadgets.cd };
  const near = g.test.spawnZombie('tank', clone.x + 1.2, clone.z);
  const far = g.test.spawnZombie('tank', clone.x + 8, clone.z);
  near.hp = near.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  clone.hitT = 0;
  g.level.gadgets._updateClones(0.1);
  const nearDmg = 1000 - near.hp;
  near.state = 'dead';
  clone.hitT = 0;
  g.level.gadgets._updateClones(0.1);
  return {
    used,
    count: g.level.gadgets.clones.length,
    hp: clone.hp,
    cd: g.level.gadgets.cd,
    nearDmg,
    farDmg: 1000 - far.hp,
  };
});
check(fight.used && fight.count === 1, 'клон спавниться', JSON.stringify(fight));
check(fight.hp === 50, 'у клона 50 HP', JSON.stringify(fight));
check(fight.cd === 50, 'перезарядка 50с', JSON.stringify(fight));
check(fight.nearDmg === 10, 'зблизька меч наносить 10 HP', JSON.stringify(fight));
check(fight.farDmg === 5, 'здалека пістолет наносить 5 HP', JSON.stringify(fight));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 КЛОН ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
