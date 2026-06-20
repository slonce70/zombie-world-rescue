// v48 скріни Іспанії: карта/лендмарки (арена-корида, фонтан, собор), зомбі-бик toro, МАТАДОР-бос.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

const BASE = 'http://localhost:8741';
const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

await p.goto(`${BASE}/?test&fresh&lang=uk`);
await p.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await p.evaluate(() => { window.__game.save.liberated = { UKR: true }; });
await p.evaluate(() => window.__game.startLevel('ESP'));
await p.waitForFunction(() => window.__game.state === 'level' && window.__game.level
  && !document.getElementById('overlay-level-loading').classList.contains('show'), null, { timeout: 30000 });
await p.evaluate(() => window.__game.test.god());
await p.waitForTimeout(900);

const hideUI = () => {
  const hide = (id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
  hide('mission-prompt'); hide('center-prompt'); hide('toast'); hide('hint');
  document.querySelectorAll('.toast,.center-prompt,[id*="prompt"]').forEach((e) => { e.style.display = 'none'; });
};

// 1) КАРТА: піднята камера над ареною-коридою — видно трибуни, прапорці, плато
await p.evaluate(() => {
  const g = window.__game, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  // героя ставимо біля арени, дивимось на неї згори-збоку (3-тя особа)
  pl.pos.x = ar.x - 30; pl.pos.z = ar.z + 34; pl.health = 100; pl.respawnProtect = 1e9;
  pl.yaw = -0.7; pl.pitch = -0.28; pl.firstPerson = false; pl._applyView(); pl._camInit = false;
});
await new Promise((r) => setTimeout(r, 300));
await p.evaluate(hideUI);
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/v48-spain-map.png' });
console.log('map staged');

// 2) TORO: зомбі-бик крупно у кадрі
const toro = await p.evaluate(() => {
  const g = window.__game, Z = g.level.zombies, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  pl.pos.x = ar.x - 4; pl.pos.z = ar.z + 3; pl.yaw = -0.5; pl.pitch = -0.02;
  pl.firstPerson = false; pl._applyView(); pl._camInit = false; pl.respawnProtect = 1e9;
  for (const z of Z.list) { if (Math.hypot(z.x - ar.x, z.z - ar.z) < 50 && z.type !== 'boss') { z.gone = true; z.state = 'dead'; Z.scene.remove(z.rig.group); } }
  Z.list = Z.list.filter((z) => !z.gone);
  const tz = Z.spawn('toro', ar.x + 3, ar.z - 4, {});
  tz.aggroed = false; tz.state = 'wander'; tz.rig.group.rotation.y = -2.3; // боком, щоб видно роги
  return { nid: tz.nid, ztype: tz.rig.ztype };
});
await p.waitForTimeout(900);
await p.evaluate(hideUI);
await p.screenshot({ path: 'shots/v48-toro.png' });
console.log('toro staged', JSON.stringify(toro));

// 3) МАТАДОР-бос у кадрі
const boss = await p.evaluate(() => {
  const g = window.__game, Z = g.level.zombies, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  pl.pos.x = ar.x - 5; pl.pos.z = ar.z + 8; pl.yaw = -0.5; pl.pitch = 0.04;
  pl.firstPerson = false; pl._applyView(); pl._camInit = false; pl.respawnProtect = 1e9;
  for (const z of Z.list) { if (Math.hypot(z.x - ar.x, z.z - ar.z) < 55) { z.gone = true; z.state = 'dead'; Z.scene.remove(z.rig.group); } }
  Z.list = Z.list.filter((z) => !z.gone);
  const bz = Z.spawn('boss', ar.x + 2, ar.z - 5, { style: 'matador' });
  bz.aggroed = false; bz.state = 'wander'; bz.rig.group.rotation.y = -2.5;
  return { style: bz.bossStyle };
});
await p.waitForTimeout(900);
await p.evaluate(hideUI);
await p.screenshot({ path: 'shots/v48-boss.png' });
console.log('boss staged', JSON.stringify(boss));

console.log(errs.length ? ('ERRORS: ' + errs.join(' | ')) : '(no page errors)');
await b.close();
