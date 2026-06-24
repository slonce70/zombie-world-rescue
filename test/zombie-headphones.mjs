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

console.log('▸ Зомбі в навушниках');
const res = await page.evaluate(() => {
  const g = window.__game;
  const pl = g.level.player;
  const Z = g.level.zombies;
  for (const z of [...Z.list]) z.state = 'dead';

  const hpZombie = g.test.spawnZombie('headphones', 0, -7);
  const meta = { type: hpZombie.type, hp: hpZombie.hp, maxHp: hpZombie.maxHp, stunImmune: hpZombie.stats.stunImmune === true };
  hpZombie.state = 'dead';

  g.save.gadgetHypers = ['stunammo'];
  pl.stunAmmoT = 3;
  pl.firstPerson = true;
  pl.switchWeapon('pistol');
  g.test.teleport(0, 0);
  pl.yaw = 0; pl.pitch = 0;

  const shoot = (type) => {
    const z = g.test.spawnZombie(type, 0, -7);
    z.maxHp = z.hp = 99999;
    g.test.aimAtNearestZombie();
    pl._shoot();
    const stun = z.stunT;
    z.state = 'dead';
    pl.shootCd = 0;
    return stun;
  };

  return { meta, walkerStun: shoot('walker'), headphonesStun: shoot('headphones') };
});
check(res.meta.type === 'headphones' && res.meta.hp === 102 && res.meta.maxHp === 102 && res.meta.stunImmune,
  'має 102 HP і прапор імунітету до оглушення', JSON.stringify(res.meta));
check(res.walkerStun === 1, 'контроль: walker оглушується гіпер-кулями на 1с', JSON.stringify(res));
check(res.headphonesStun === 0, 'зомбі в навушниках НЕ оглушується оглушливими кулями', JSON.stringify(res));

const host = await page.evaluate(async () => {
  const { HostNet } = await import('/src/net/host.js');
  const { weaponToIdx } = await import('/src/net/protocol.js');
  const { Vector3 } = await import('/vendor/three.module.js');
  const mk = (stunImmune) => ({ nid: 77, x: 3, z: 0, state: 'chase', stunT: 0, stats: { stunImmune }, damage() {} });
  const h = Object.create(HostNet.prototype);
  let zombie = mk(false);
  h.level = {
    player: { pos: new Vector3(0, 0, 0) },
    zombies: { byNid: (n) => (n === 77 ? zombie : null) },
    effects: { tracer() {} }, audio: { shot() {} },
  };
  h.remotes = new Map([[2, { pos: new Vector3(0, 0, 0), muzzleWorld: (v) => v.set(0, 1, 0) }]]);
  h._tmpV = new Vector3();
  h.ev = () => {};
  h._onShot(2, { w: weaponToIdx('pistol'), hits: [[77, 30, 0, 1, 1]] });
  const walker = zombie.stunT;
  zombie = mk(true);
  h._onShot(2, { w: weaponToIdx('pistol'), hits: [[77, 30, 0, 1, 1]] });
  return { walker, headphones: zombie.stunT };
});
check(host.walker === 1 && host.headphones === 0,
  'кооп-хост теж не оглушує зомбі в навушниках', JSON.stringify(host));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЗОМБІ В НАВУШНИКАХ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
