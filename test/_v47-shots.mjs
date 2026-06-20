// v47 скріни: чарівник у кадрі + анти-вогонь щитоносець (синій щит). Спавн через eval, 3-тя особа.
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
await p.evaluate(() => { window.__game.save.liberated = { UKR: true, POL: true, DEU: true }; });
await p.evaluate(() => window.__game.startLevel('DEU'));
await p.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
await p.waitForTimeout(800);

// 1) Чарівник у кадрі (3-тя особа, дивимось на північ -Z, ворог перед героєм)
const a = await p.evaluate(() => {
  const g = window.__game, Z = g.level.zombies, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  // гравець збоку, дивиться по діагоналі на чарівника — щоб ворог був ЧІТКО у кадрі
  pl.pos.x = ar.x - 4; pl.pos.z = ar.z + 2; pl.health = 100; pl.respawnProtect = 1e9;
  pl.yaw = -0.5; pl.pitch = -0.02; pl.firstPerson = false; pl._applyView(); pl._camInit = false;
  for (const z of Z.list) { if (Math.hypot(z.x - ar.x, z.z - ar.z) < 45 && z.type !== 'boss') { z.gone = true; z.state = 'dead'; Z.scene.remove(z.rig.group); } }
  Z.list = Z.list.filter((z) => !z.gone);
  const w = Z.spawn('wizard', ar.x + 3, ar.z - 5, {});
  w.aggroed = false; w.state = 'wander';
  w.rig.group.rotation.y = -2.4; // повертаємо боком, щоб видно посох-орб
  // декілька прислужників поряд — щоб кадр «розповідав» про призов
  for (let i = 0; i < 2; i++) {
    const mz = Z.spawn(i % 2 ? 'runner' : 'walker', ar.x + 6 - i * 2, ar.z - 8, {});
    mz.aggroed = false; mz.state = 'wander'; mz.rig.group.rotation.y = Math.PI;
  }
  // ховаємо центральний промпт/тости, щоб не загороджували ворога
  const hide = (id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
  hide('mission-prompt'); hide('center-prompt'); hide('toast'); hide('hint');
  document.querySelectorAll('.toast,.center-prompt,[id*="prompt"]').forEach((e) => { e.style.display = 'none'; });
  return { nid: w.nid, hp: w.hp };
});
await p.waitForTimeout(1200);
await p.screenshot({ path: 'shots/v47-wizard.png' });
console.log('wizard staged', JSON.stringify(a));

// 2) Анти-вогонь щитоносець: спавнимо щити, поки не випаде fireproof (синій щит будується в spawn())
const s = await p.evaluate(() => {
  const g = window.__game, Z = g.level.zombies, pl = g.level.player;
  const ar = g.level.world.layout.arena;
  pl.pos.x = ar.x; pl.pos.z = ar.z; pl.yaw = 0; pl.pitch = -0.04; pl.firstPerson = false; pl._applyView(); pl._camInit = false; pl.respawnProtect = 1e9;
  for (const z of Z.list) { if (Math.hypot(z.x - ar.x, z.z - ar.z) < 45 && z.type !== 'boss') { z.gone = true; z.state = 'dead'; Z.scene.remove(z.rig.group); } }
  Z.list = Z.list.filter((z) => !z.gone);
  let w = null;
  for (let tries = 0; tries < 60 && !w; tries++) {
    const c = Z.spawn('shield', ar.x, ar.z - 5, {});
    if (c.shieldFireproof) { w = c; } else { c.gone = true; c.state = 'dead'; Z.scene.remove(c.rig.group); Z.list = Z.list.filter((z) => !z.gone); }
  }
  if (w) { w.aggroed = false; w.state = 'wander'; w.rig.group.rotation.y = Math.PI; }
  return { found: !!w, fp: w && w.shieldFireproof };
});
await p.waitForTimeout(1200);
await p.screenshot({ path: 'shots/v47-shield.png' });
console.log('shield staged', JSON.stringify(s));

console.log(errs.length ? ('ERRORS: ' + errs.join(' | ')) : '(no page errors)');
await b.close();
