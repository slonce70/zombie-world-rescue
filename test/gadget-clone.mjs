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
  const hyper = SHOP_ITEMS.find((i) => i.id === 'clone-hyper');
  return {
    gadget: GADGETS.clone && { cd: GADGETS.clone.cd, price: GADGETS.clone.price },
    shop: SHOP_ITEMS.some((i) => i.id === 'clone' && i.gadget && i.price === 1000),
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget },
  };
});
check(meta.gadget && meta.gadget.cd === 50 && meta.gadget.price === 1000, 'мета: 50с cd, 1000 монет', JSON.stringify(meta));
check(meta.shop, 'товар є в магазині');
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.hyper === 'clone' && meta.hyper.needsGadget === 'clone',
  'гіперзаряд клона коштує 5000 і потребує базовий клон', JSON.stringify(meta.hyper));

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

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(12000);
  const before = g.save.coins;
  g.test.shopBuy('clone-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('clone-hyper');
  return {
    hypers: g.save.gadgetHypers || [],
    firstCost: before - afterFirst,
    secondCost: afterFirst - g.save.coins,
  };
});
check(hyperBuy.hypers.includes('clone') && hyperBuy.firstCost === 5000 && hyperBuy.secondCost === 0,
  'гіперзаряд клона купується один раз і зберігається', JSON.stringify(hyperBuy));

await page.goto(`${BASE}/?test&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const persisted = await page.evaluate(() => (window.__game.save.gadgetHypers || []).includes('clone'));
check(persisted, 'гіперзаряд клона лишається після перезавантаження сторінки');

const fight = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('clone');
  g.save.gadgetHypers = [];
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
  near.aggroed = far.aggroed = false;
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

const hyperFight = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.gadgets.clones = [];
  g.save.gadgetHypers = ['clone'];
  g.save.activeGadget = 'clone';
  g.test.gadgetCdReset();
  g.test.teleport(10, 120);
  p.yaw = 0;
  for (const z of g.level.zombies.list) z.state = 'dead';
  const used = g.test.useGadget();
  const clones = g.level.gadgets.clones || [];
  const target = g.test.spawnZombie('tank', clones[0].x + 8, clones[0].z);
  target.hp = target.maxHp = 1000;
  target.aggroed = false;
  for (const c of clones) c.hitT = 0;
  g.level.gadgets._updateClones(0.1);
  return { used, count: clones.length, hp: clones.map((c) => c.hp), farDmg: 1000 - target.hp };
});
check(hyperFight.used && hyperFight.count === 2, 'гіпер-клон спавнить 2 клони', JSON.stringify(hyperFight));
check(hyperFight.hp.length === 2 && hyperFight.hp.every((hp) => hp === 50), 'у кожного гіпер-клона 50 HP', JSON.stringify(hyperFight));
check(hyperFight.farDmg === 10, 'обидва гіпер-клони мають пістолет по 5 HP', JSON.stringify(hyperFight));

const cloneShield = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.gadgets.clones = [];
  g.save.gadgetHypers = [];
  g.save.activeGadget = 'clone';
  g.test.gadgetCdReset();
  g.test.teleport(30, 120);
  p.yaw = 0;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.useGadget();
  const clone = g.level.gadgets.clones[0];
  const start = { hp: clone.hp, shield: clone.shieldHp };
  g.level.zombies._hurt({ clone }, 12);
  const after12 = { hp: clone.hp, shield: clone.shieldHp };
  g.level.zombies._hurt({ clone }, 10);
  return { start, after12, final: { hp: clone.hp, shield: clone.shieldHp } };
});
check(cloneShield.start.hp === 50 && cloneShield.start.shield === 20,
  'клон стартує з 50 HP і 1 щитом на 20 HP', JSON.stringify(cloneShield.start));
check(cloneShield.after12.hp === 50 && cloneShield.after12.shield === 8,
  'щит клона поглинає перші 12 шкоди', JSON.stringify(cloneShield.after12));
check(cloneShield.final.hp === 48 && cloneShield.final.shield === 0,
  'після 20 шкоди щит зникає, решта проходить у HP', JSON.stringify(cloneShield.final));

const cloneAggro = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.gadgets.clones = [];
  g.save.gadgetHypers = [];
  g.save.activeGadget = 'clone';
  g.test.gadgetCdReset();
  g.test.teleport(0, 120);
  p.yaw = 0;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.useGadget();
  const clone = g.level.gadgets.clones[0];
  g.test.teleport(80, 120);
  const z = g.test.spawnZombie('walker', clone.x + 1.0, clone.z);
  z.state = 'wander';
  z.aggroed = false;
  z.sleeping = false;
  clone.hp = 50;
  for (let i = 0; i < 8; i++) g.level.zombies.update(0.2);
  return { aggroed: z.aggroed, state: z.state, cloneHp: clone.hp, cloneShield: clone.shieldHp, playerHp: p.health };
});
check(cloneAggro.aggroed && (cloneAggro.cloneHp < 50 || cloneAggro.cloneShield < 20) && cloneAggro.playerHp === 100,
  'зомбі агряться на клона і бʼють його, коли гравець далеко', JSON.stringify(cloneAggro));

const formation = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.gadgets.clones = [];
  g.save.gadgetHypers = ['clone'];
  g.save.activeGadget = 'clone';
  g.test.gadgetCdReset();
  g.test.teleport(20, 120);
  p.yaw = 0;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.useGadget();
  const clones = g.level.gadgets.clones;
  const target = g.test.spawnZombie('tank', clones[0].x + 18, clones[0].z);
  target.hp = target.maxHp = 1000;
  target.aggroed = false;
  for (const c of clones) c.hitT = 999;
  let minDist = Infinity;
  for (let i = 0; i < 30; i++) {
    g.level.gadgets._updateClones(0.1);
    minDist = Math.min(minDist, Math.hypot(clones[0].x - clones[1].x, clones[0].z - clones[1].z));
  }
  return { count: clones.length, minDist, finalDist: Math.hypot(clones[0].x - clones[1].x, clones[0].z - clones[1].z) };
});
check(formation.count === 2 && formation.minDist >= 0.9,
  'гіпер-клони рухаються поруч, а не всередині один одного', JSON.stringify(formation));

const blockedShot = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.gadgets.clones = [];
  g.save.gadgetHypers = [];
  g.save.activeGadget = 'clone';
  g.test.gadgetCdReset();
  g.test.teleport(40, 120);
  p.yaw = 0;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.useGadget();
  const clone = g.level.gadgets.clones[0];
  const target = g.test.spawnZombie('tank', clone.x + 8, clone.z);
  target.hp = target.maxHp = 1000;
  target.aggroed = false;
  clone.hitT = 0;
  const old = g.level.world.shotBlockDist;
  g.level.world.shotBlockDist = () => 1;
  g.level.gadgets._updateClones(0.1);
  g.level.world.shotBlockDist = old;
  return { hp: target.hp, dmg: 1000 - target.hp };
});
check(blockedShot.dmg === 0, 'клон не стріляє крізь стіну будинка', JSON.stringify(blockedShot));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 КЛОН ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
