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

console.log('▸ Гаджет «Оглушливі кулі»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const G = GADGETS.stunammo;
  const hyper = SHOP_ITEMS.find((i) => i.id === 'stunammo-hyper');
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon },
    shop: SHOP_ITEMS.some((i) => i.id === 'stunammo' && i.gadget && i.price === 1000),
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper },
  };
});
check(meta.gadget && meta.gadget.cd === 45 && meta.gadget.price === 1000 && meta.gadget.icon === '💫',
  'мета: 45с cd, 1000 монет, 💫', JSON.stringify(meta));
check(meta.shop, 'товар є в магазині');
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.hyper === 'stunammo',
  'гіперзаряд оглушливих куль коштує 5000₴ і купується один раз', JSON.stringify(meta.hyper));

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.test.unlockGadget('stunammo');
  g.test.giveCoins(12000);
  const before = g.save.coins;
  g.test.shopBuy('stunammo-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('stunammo-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(hyperBuy.hypers.includes('stunammo') && hyperBuy.firstCost === 5000 && hyperBuy.secondCost === 0,
  'гіперзаряд оглушливих куль зберігається назавжди', JSON.stringify(hyperBuy));

await page.goto(`${BASE}/?test&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const hyperPersisted = await page.evaluate(() => (window.__game.save.gadgetHypers || []).includes('stunammo'));
check(hyperPersisted, 'гіперзаряд оглушливих куль лишається після перезавантаження сторінки');

// баф + проводка пострілу: пістолет і магнум оглушують, інша зброя — ні
const fire = await page.evaluate(() => {
  const g = window.__game;
  const pl = g.level.player;
  const Z = g.level.zombies;
  for (const z of [...Z.list]) z.state = 'dead';
  g.save.gadgetHypers = [];
  g.test.unlockGadget('stunammo');
  g.test.gadgetCdReset();
  pl.firstPerson = true;
  g.test.teleport(0, 0);
  pl.yaw = 0; pl.pitch = 0;
  const used = g.test.useGadget();
  const buff = pl.stunAmmoT;
  const cd = g.level.gadgets.cd;

  const shootFresh = (weapon, x, z) => {
    if (weapon !== 'pistol') g.test.giveWeapon(weapon);
    pl.switchWeapon(weapon);
    const zb = g.test.spawnZombie('walker', x, z);
    zb.maxHp = zb.hp = 99999;
    g.test.aimAtNearestZombie();
    pl._shoot();
    const stun = zb.stunT;
    zb.state = 'dead';
    return stun;
  };

  const pistol = shootFresh('pistol', 0, -6);
  const magnum = shootFresh('magnum', 0, -6);
  const rifle = shootFresh('rifle', 0, -6); // контроль: автомат не оглушує
  pl.stunAmmoT = 0;
  const pistolNoBuff = shootFresh('pistol', 0, -6); // контроль: без бафа не оглушує
  g.save.gadgetHypers = ['stunammo'];
  pl.stunAmmoT = 3;
  const pistolHyper = shootFresh('pistol', 0, -6);
  return { used, buff, cd, pistol, magnum, rifle, pistolNoBuff, pistolHyper };
});
check(fire.used && fire.buff === 3 && fire.cd === 45, 'гаджет вмикає баф на 3с і ставить cd 45с', JSON.stringify(fire));
check(fire.pistol === 0.5, 'пістолет під бафом оглушує на 0.5с', JSON.stringify(fire));
check(fire.magnum === 0.5, 'магнум під бафом оглушує на 0.5с', JSON.stringify(fire));
check(fire.pistolHyper === 1, 'гіперзаряд збільшує оглушення до 1с', JSON.stringify(fire));
check(fire.rifle === 0, 'автомат НЕ оглушує (контроль)', JSON.stringify(fire));
check(fire.pistolNoBuff === 0, 'без бафа пістолет НЕ оглушує (контроль)', JSON.stringify(fire));

// гейт: оглушений зомбі не б'є гравця, поки таймер не сплине
const gate = await page.evaluate(() => {
  const g = window.__game;
  const pl = g.level.player;
  const Z = g.level.zombies;
  for (const z of [...Z.list]) z.state = 'dead';
  g.test.teleport(0, 0);
  const setup = (stun) => {
    pl.health = 100; pl.respawnProtect = 0; pl.buffs.bubble = 0; pl.gadgetShield = 0; pl.armor = 0;
    const z = g.test.spawnZombie('walker', 0.5, 1.2); // майже впритул
    z.state = 'chase'; z.aggroed = true; z.didHit = false; z.attackT = -1;
    z.stunT = stun;
    return z;
  };
  const zs = setup(0.5);
  for (let i = 0; i < 8; i++) Z.update(0.05); // 0.4с — у межах оглушення
  const hpStunned = pl.health;
  const stunLeft = zs.stunT;
  zs.state = 'dead';
  const zc = setup(0);
  for (let i = 0; i < 12; i++) Z.update(0.05); // 0.6с — без оглушення встигає вдарити
  const hpControl = pl.health;
  zc.state = 'dead';
  return { hpStunned, stunLeft, hpControl };
});
check(gate.hpStunned === 100 && gate.stunLeft < 0.5 && gate.stunLeft > 0, 'оглушений зомбі не б’є і таймер тане', JSON.stringify(gate));
check(gate.hpControl < 100, 'без оглушення зомбі б’є (контроль)', JSON.stringify(gate));

// кооп: хост застосовує оглушення з пострілу гостя (4-й елемент hits), лише пістолет/магнум
console.log('▸ Кооп: хост приймає прапорець оглушення від гостя');
const host = await page.evaluate(async () => {
  const { HostNet } = await import('/src/net/host.js');
  const { weaponToIdx } = await import('/src/net/protocol.js');
  const { Vector3 } = await import('/vendor/three.module.js');
  const mk = () => ({ nid: 88, x: 3, z: 0, state: 'chase', stunT: 0, damage() {} });
  const h = Object.create(HostNet.prototype);
  let zombie = mk();
  h.level = {
    player: { pos: new Vector3(0, 0, 0) },
    zombies: { byNid: (n) => (n === 88 ? zombie : null) },
    effects: { tracer() {} }, audio: { shot() {} },
  };
  h.remotes = new Map([[2, { pos: new Vector3(0, 0, 0), muzzleWorld: (v) => v.set(0, 1, 0) }]]);
  h._tmpV = new Vector3();
  h.ev = () => {};
  h._onShot(2, { w: weaponToIdx('pistol'), hits: [[88, 30, 0, 1]] });
  const pistol = zombie.stunT;
  zombie = mk();
  h._onShot(2, { w: weaponToIdx('pistol'), hits: [[88, 30, 0, 1, 1]] });
  const pistolHyper = zombie.stunT;
  zombie = mk();
  h._onShot(2, { w: weaponToIdx('rifle'), hits: [[88, 30, 0, 1]] }); // контроль: автомат не оглушує
  const rifle = zombie.stunT;
  zombie = mk();
  h._onShot(2, { w: weaponToIdx('pistol'), hits: [[88, 30, 0, 0]] }); // контроль: без прапорця
  const noFlag = zombie.stunT;
  return { pistol, pistolHyper, rifle, noFlag };
});
check(host.pistol === 0.5, 'хост оглушує з пістолета гостя', JSON.stringify(host));
check(host.pistolHyper === 1, 'хост приймає гіпер-оглушення гостя на 1с', JSON.stringify(host));
check(host.rifle === 0, 'хост НЕ оглушує з автомата гостя (контроль)', JSON.stringify(host));
check(host.noFlag === 0, 'хост НЕ оглушує без прапорця (контроль)', JSON.stringify(host));

// фікс: вогнетривкий щит гасить вогонь, але зомбі все одно агриться
console.log('▸ Фікс: вогнетривкий щит — зомбі помічає вогнемет');
const fireShield = await page.evaluate(() => {
  const g = window.__game;
  const z = g.test.spawnZombie('shield', 0, -6);
  z.shieldFireproof = true; z.aggroed = false; z.state = 'wander';
  const hpBefore = z.shieldHp;
  z.damage(20, null, false, { fire: true }); // вогонь у фронт щита
  const r = { aggroed: z.aggroed, shieldHp: z.shieldHp, hpBefore };
  z.state = 'dead';
  return r;
});
check(fireShield.aggroed === true, 'вогнетривкий щит агриться від вогнемета', JSON.stringify(fireShield));
check(fireShield.shieldHp === fireShield.hpBefore, 'вогонь не шкодить вогнетривкому щиту (як і було)', JSON.stringify(fireShield));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ОГЛУШЛИВІ КУЛІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
