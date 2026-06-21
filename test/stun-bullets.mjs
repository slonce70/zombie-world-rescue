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

console.log('▸ Гаджет «Оглушливі кулі»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const G = GADGETS.stunammo;
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon },
    shop: SHOP_ITEMS.some((i) => i.id === 'stunammo' && i.gadget && i.price === 1000),
  };
});
check(meta.gadget && meta.gadget.cd === 45 && meta.gadget.price === 1000 && meta.gadget.icon === '💫',
  'мета: 45с cd, 1000 монет, 💫', JSON.stringify(meta));
check(meta.shop, 'товар є в магазині');

// баф + проводка пострілу: пістолет і магнум оглушують, інша зброя — ні
const fire = await page.evaluate(() => {
  const g = window.__game;
  const pl = g.level.player;
  const Z = g.level.zombies;
  for (const z of [...Z.list]) z.state = 'dead';
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
  return { used, buff, cd, pistol, magnum, rifle, pistolNoBuff };
});
check(fire.used && fire.buff === 3 && fire.cd === 45, 'гаджет вмикає баф на 3с і ставить cd 45с', JSON.stringify(fire));
check(fire.pistol === 0.5, 'пістолет під бафом оглушує на 0.5с', JSON.stringify(fire));
check(fire.magnum === 0.5, 'магнум під бафом оглушує на 0.5с', JSON.stringify(fire));
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

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ОГЛУШЛИВІ КУЛІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
