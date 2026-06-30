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

await page.goto(`${BASE}/?test&fresh&seed=25`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Перегружена зомбі проти людей відкривається після 12 країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const eleven = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true };
  const twelve = { ...eleven, DIN: true };
  g.save.liberated = eleven;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="overloaded-humans"]');
  g.save.liberated = twelve;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="overloaded-humans"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    tabs: [...document.querySelectorAll('.solo-tab')].map((t) => t.textContent.trim()),
    name: after && after.querySelector('.sm-name').textContent,
  };
});
check(menu.beforeExists && menu.beforeLocked, 'до 12 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked && menu.tabs.includes('ПЕРЕГРУЖЕНІ РЕЖИМИ'), 'після 12 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт режиму: 45 клонів, 5 стрільців, 125 зомбі, 5 боксерів і робот');
await page.evaluate(() => window.__game.test.startOverloadedHumans());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.humans, null, { timeout: 30000 });
const started = await page.evaluate(async () => {
  const THREE = await import('./vendor/three.module.js');
  const g = window.__game;
  const h = g.level.humans;
  h.update(0.05);
  const enemies = g.level.zombies.list.filter((z) => z.humans && z.state !== 'dead');
  const clonePos = (c) => {
    c.mesh.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(c.mesh);
    return { z: c.z, y: c.y, meshY: c.mesh.position.y, minY: b.min.y };
  };
  return {
    variant: h.variant,
    centerZ: h.cz,
    floorY: h.floorY,
    playerHp: g.level.player.health,
    playerMaxHp: g.level.player.maxHealth,
    clones: h.clones.length,
    clonePositions: h.clones.map(clonePos),
    shooters: h.clones.filter((c) => c.shooter).length,
    zombies: enemies.length,
    enemyPositions: enemies.map((z) => ({ z: z.z, y: z.y })),
    playerZ: g.level.player.pos.z,
    boxers: enemies.filter((z) => z.type === 'boxer').length,
    robots: enemies.filter((z) => z.type === 'robot').length,
    robotHp: enemies.find((z) => z.type === 'robot')?.hp,
    robotMaxHp: enemies.find((z) => z.type === 'robot')?.maxHp,
    weapons: [...g.level.player.weapons],
    currentWeapon: g.level.player.cur,
    noShop: g.level.noShop,
    noPickups: g.level.noPickups,
    noGadgets: g.level.noGadgets,
    modeShield: g.level.modeShield,
    activeGadget: g.level.gadgets.active,
    hud: h.getHudList().map((x) => x.title),
    boxerMarkers: h.getMarkers().filter((m) => m.icon === '🥊').length,
  };
});
check(started.variant === 'overloaded', 'варіант overloaded', JSON.stringify(started));
check(started.playerHp === 350 && started.playerMaxHp === 350, 'у гравця 350 HP', JSON.stringify(started));
check(started.clones === 50 && started.shooters === 5, '45 клонів + 5 стрільців', JSON.stringify(started));
check(started.zombies === 131 && started.boxers === 5 && started.robots === 1, '125 зомбі + 5 в перчатках + робот', JSON.stringify(started));
check(started.boxerMarkers === 5, '5 боксерів видно на маркерах як 🥊', JSON.stringify(started));
check(started.clonePositions.every((c) => c.z - started.centerZ > 200)
  && started.enemyPositions.every((z) => z.z - started.centerZ < -200)
  && started.playerZ - started.centerZ > 280,
  'дві армії спавняться на протилежних сторонах кімнати', JSON.stringify(started));
check(started.clonePositions.every((c) => c.y > started.floorY && c.meshY > started.floorY && c.minY >= started.floorY - 0.005)
  && started.enemyPositions.every((z) => Math.abs(z.y - started.floorY) < 0.01),
  'клони і зомбі стоять на рівній підлозі, не під землею', JSON.stringify(started));
check(started.robotHp === 1795 && started.robotMaxHp === 1795, 'робот має 1795 HP', JSON.stringify(started));
check(JSON.stringify(started.weapons) === JSON.stringify(['pistol', 'staff', 'sword']) && started.currentWeapon === 'pistol',
  'у гравця пістолет, посох і меч', JSON.stringify(started));
check(started.noShop && started.noPickups && started.noGadgets && started.activeGadget === 'shield'
  && started.modeShield.hp === 100 && started.modeShield.cd === 100,
  'немає пікапів і магазину; є тільки щит-гаджет 100 HP / 100с', JSON.stringify(started));

console.log('▸ Стрілець-клон наносить 5 HP');
const shot = await page.evaluate(() => {
  const g = window.__game;
  const h = g.level.humans;
  const shooter = h.clones.find((c) => c.shooter);
  const target = g.level.zombies.list.find((z) => z.humans && z.type !== 'robot' && z.state !== 'dead');
  target.hp = target.maxHp = 100;
  shooter.x = target.x;
  shooter.z = target.z + 10;
  shooter.hitT = 0;
  h._updateClones(0.1);
  return { hp: target.hp, shooter: !!shooter };
});
check(shot.shooter && shot.hp === 95, 'постріл стрільця знімає 5 HP', JSON.stringify(shot));

console.log('▸ Гармата робота знімає HP клону здаля');
const robotShot = await page.evaluate(() => {
  const g = window.__game;
  const h = g.level.humans;
  h.update(0.05);
  const robot = g.level.zombies.list.find((z) => z.humans && z.type === 'robot' && z.state !== 'dead');
  const clone = h.clones.find((c) => c.hp > 0);
  clone.hp = 30;
  robot.x = clone.x;
  robot.z = clone.z - 12;
  robot.y = clone.y;
  robot.rig.group.position.set(robot.x, robot.y, robot.z);
  robot.state = 'chase';
  robot.aggroed = true;
  robot.rangedCd = 0;
  robot.attackT = 0;
  robot.didHit = false;
  robot.telegraph = 0;
  robot.charging = 0;
  let sawProjectile = false;
  for (let i = 0; i < 180; i++) {
    g.level.zombies.update(1 / 60);
    if (g.level.effects.projectiles.length) sawProjectile = true;
    g.level.effects.update(1 / 60);
  }
  return { beforeHp: 30, afterHp: clone.hp, sawProjectile, robotDmg: robot.ranged && robot.ranged.dmg };
});
check(robotShot.sawProjectile && robotShot.robotDmg === 10 && robotShot.afterHp === 20,
  'снаряд робота знімає 10 HP з клона', JSON.stringify(robotShot));

console.log('▸ Фінальний екран і повтор лишаються в перегруженому режимі');
const end = await page.evaluate(() => {
  const g = window.__game;
  g._endHumansRun(false);
  return {
    lastEndMode: g._lastEndMode,
    stats: document.getElementById('arena-stats').textContent,
  };
});
check(end.lastEndMode === 'overloaded-humans' && end.stats.includes('131') && end.stats.includes('50'),
  'після завершення retry веде у перегружений режим, статистика має 131/50', JSON.stringify(end));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ПЕРЕГРУЖЕНА ЗОМБІ ПРОТИ ЛЮДЕЙ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
