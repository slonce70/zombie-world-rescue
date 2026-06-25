import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=POL`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Сніг на дахах');
const snow = await page.evaluate(() => {
  const g = window.__game;
  const world = g.level.world;
  const whiteMaxY = (cx, cz) => {
    let max = -Infinity;
    world.staticGroup.traverse((o) => {
      const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      const col = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
      if (!pos || !col) return;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (Math.abs(x - cx) > 7 || Math.abs(z - cz) > 7) continue;
        const r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
        if (r > 0.9 && gg > 0.9 && b > 0.9 && y > world.groundH(cx, cz) + 4) max = Math.max(max, y);
      }
    });
    return max;
  };
  const h = 4.2;
  const ordinary = { x: 26, z: 4 };
  const enterable = { x: 26, z: -14 };
  const ordinaryRoofTop = world.groundH(ordinary.x, ordinary.z) + 0.4 + h + h * 0.55;
  const enterableRoofTop = world.groundH(enterable.x, enterable.z) + 0.46 + h + h * 0.5;
  return {
    ordinaryLift: +(whiteMaxY(ordinary.x, ordinary.z) - ordinaryRoofTop).toFixed(3),
    enterableLift: +(whiteMaxY(enterable.x, enterable.z) - enterableRoofTop).toFixed(3),
  };
});
check(snow.ordinaryLift >= 0 && snow.ordinaryLift <= 0.08,
  `звичайний сніг лежить на даху, не висить над ним: lift=${snow.ordinaryLift}`);
check(snow.enterableLift >= 0 && snow.enterableLift <= 0.08,
  `сніг на будинку з дверима теж лежить на даху: lift=${snow.enterableLift}`);

console.log('▸ Headshot з автомата не гальмує серію');
const hitstop = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const realHitTest = g.level.zombies.hitTest;
  let actualShotWeapon = null;
  const realEmit = g.level.bus.emit.bind(g.level.bus);
  g.level.bus.emit = (ev, ...args) => {
    if (ev === 'hitmarker') actualShotWeapon = args[1];
    return realEmit(ev, ...args);
  };
  g.level.zombies.hitTest = () => ({
    zombie: { state: 'alive', stats: {}, damage() {}, lastHitBy: 0 },
    t: 10,
    point: p.pos.clone().setY(p.pos.y + 2),
    headshot: true,
  });
  p.giveWeapon('rifle');
  p.switchWeapon('rifle');
  p.ammo.rifle.mag = 30;
  p.shootCd = 0;
  p._shoot();
  g.level.zombies.hitTest = realHitTest;
  g.level.bus.emit = realEmit;
  g._hitstopT = 0;
  g.level.bus.emit('hitmarker', true, 'rifle');
  const rifleHeadshot = g._hitstopT;
  g._hitstopT = 0;
  g.level.bus.emit('hitmarker', true, 'pistol');
  const pistolHeadshot = g._hitstopT;
  g._hitstopT = 0;
  g.level.bus.emit('hitmarker', false, 'rifle');
  const rifleBody = g._hitstopT;
  return { actualShotWeapon, rifleHeadshot, pistolHeadshot, rifleBody };
});
check(hitstop.actualShotWeapon === 'rifle', 'реальний постріл передає weapon=rifle у hitmarker', JSON.stringify(hitstop));
check(hitstop.rifleHeadshot === 0, 'автоматичний headshot не запускає hitstop', JSON.stringify(hitstop));
check(hitstop.pistolHeadshot >= 0.04, 'пістолетний headshot лишає hitstop-ефект', JSON.stringify(hitstop));
check(hitstop.rifleBody === 0, 'звичайне влучання автомата без hitstop', JSON.stringify(hitstop));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ВІЗУАЛЬНІ БАГИ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
