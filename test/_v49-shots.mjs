// v49 скріни Італії: карта/лендмарки (Колізей, похила вежа, римські руїни),
// зомбі-гладіатор, ЦЕЗАР-бос.
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
await p.evaluate(() => window.__game.startLevel('ITA'));
await p.waitForFunction(() => window.__game.state === 'level' && window.__game.level
  && !document.getElementById('overlay-level-loading').classList.contains('show'), null, { timeout: 30000 });
await p.evaluate(() => window.__game.test.god());
await p.waitForTimeout(900);

const hideUI = () => {
  const hide = (id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
  hide('mission-prompt'); hide('center-prompt'); hide('toast'); hide('hint');
  document.querySelectorAll('.toast,.center-prompt,[id*="prompt"]').forEach((e) => { e.style.display = 'none'; });
};

// 1) КАРТА: камера над ареною Колізею — видно яруси арок, прапори, пісок
await p.evaluate(() => {
  const g = window.__game, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  // ставимо героя біля південного входу арени, дивимось на яруси арок (3-тя особа, згори-збоку)
  pl.pos.x = ar.x - 24; pl.pos.z = ar.z + 30; pl.health = 100; pl.respawnProtect = 1e9;
  pl.yaw = -0.6; pl.pitch = -0.22; pl.firstPerson = false; pl._applyView(); pl._camInit = false;
});
await new Promise((r) => setTimeout(r, 300));
await p.evaluate(hideUI);
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/v49-italy-map.png' });
console.log('map staged (Колізей)');

// 1b) Похила вежа: нахил у площині X. Стаємо ПІВДЕННІШЕ і дивимось на північ —
// тоді нахил уздовж X читається як виразний боковий перекос вежі.
await p.evaluate(() => {
  const g = window.__game, pl = g.level.player;
  const tw = g.level.world.layout.tower;
  pl.pos.x = tw.x; pl.pos.z = tw.z + 28; pl.yaw = 0.0; pl.pitch = 0.18;
  pl.firstPerson = false; pl._applyView(); pl._camInit = false; pl.respawnProtect = 1e9;
});
await p.waitForTimeout(700);
await p.evaluate(hideUI);
await p.screenshot({ path: 'shots/v49-leaning-tower.png' });
console.log('leaning tower staged');

// 2) GLADIATOR: зомбі-гладіатор крупно у кадрі
const glad = await p.evaluate(() => {
  const g = window.__game, Z = g.level.zombies, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  pl.pos.x = ar.x - 4; pl.pos.z = ar.z + 3; pl.yaw = -0.5; pl.pitch = -0.02;
  pl.firstPerson = false; pl._applyView(); pl._camInit = false; pl.respawnProtect = 1e9;
  for (const z of Z.list) { if (Math.hypot(z.x - ar.x, z.z - ar.z) < 50 && z.type !== 'boss') { z.gone = true; z.state = 'dead'; Z.scene.remove(z.rig.group); } }
  Z.list = Z.list.filter((z) => !z.gone);
  const gz = Z.spawn('gladiator', ar.x + 3, ar.z - 4, {});
  gz.aggroed = false; gz.state = 'wander'; gz.rig.group.rotation.y = -2.3; // боком — видно меч і щит
  return { nid: gz.nid, ztype: gz.rig.ztype };
});
await p.waitForTimeout(900);
await p.evaluate(hideUI);
await p.screenshot({ path: 'shots/v49-gladiator.png' });
console.log('gladiator staged', JSON.stringify(glad));

// 3) ЦЕЗАР-бос у кадрі
const boss = await p.evaluate(() => {
  const g = window.__game, Z = g.level.zombies, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  pl.pos.x = ar.x - 5; pl.pos.z = ar.z + 9; pl.yaw = -0.5; pl.pitch = 0.06;
  pl.firstPerson = false; pl._applyView(); pl._camInit = false; pl.respawnProtect = 1e9;
  for (const z of Z.list) { if (Math.hypot(z.x - ar.x, z.z - ar.z) < 55) { z.gone = true; z.state = 'dead'; Z.scene.remove(z.rig.group); } }
  Z.list = Z.list.filter((z) => !z.gone);
  const bz = Z.spawn('boss', ar.x + 2, ar.z - 5, { style: 'gladiator' });
  bz.aggroed = false; bz.state = 'wander'; bz.rig.group.rotation.y = -2.5;
  // правильна табличка з ім'ям боса (без артефакту дефолтного імені)
  const bn = document.getElementById('boss-name');
  if (bn) bn.textContent = g.level.country.boss.name;
  return { style: bz.bossStyle };
});
await p.waitForTimeout(900);
await p.evaluate(hideUI);
await p.screenshot({ path: 'shots/v49-boss.png' });
console.log('boss staged', JSON.stringify(boss));

console.log(errs.length ? ('ERRORS: ' + errs.join(' | ')) : '(no page errors)');
await b.close();
