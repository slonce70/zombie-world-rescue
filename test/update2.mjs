// Тести великого оновлення: Польща, сніговики, дробовик, гранати, комбо, рекорди, кампанія, тач
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};
const state = () => page.evaluate(() => window.__game.test.state());
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

// ============ ПОЛЬЩА ============
console.log('▸ Польща: зимовий рівень');
await page.goto(BASE + '/?test&fresh&country=POL');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 25000, 'рівень');
let s = await state();
check(s.country === 'POL', 'країна POL');
const types = await page.evaluate(() => {
  const c = {};
  for (const z of window.__game.level.zombies.list) c[z.type] = (c[z.type] || 0) + 1;
  return c;
});
check((types.snowman || 0) >= 5, `сніговики на карті: ${types.snowman}`);
const snow = await page.evaluate(() => !!window.__game.level.world.snowMesh);
check(snow, 'снігопад активний');
const hpScaled = await page.evaluate(() => {
  const w = window.__game.level.zombies.list.find((z) => z.type === 'walker');
  return w ? w.maxHp : 0;
});
check(hpScaled === 91, `складність: HP волоцюги 70→${hpScaled} (×1.3)`);

// ============ СНІГОВИК КИДАЄ СНІЖКИ ============
console.log('▸ Сніговик: дальня атака');
await page.evaluate(() => {
  const g = window.__game;
  const w = g.level.world;
  const V = g.level.player.pos.constructor; // THREE.Vector3
  const sm = g.level.zombies.list.find((z) => z.type === 'snowman');
  // ДЕТЕРМІНІЗМ: ставимо гравця рівно за 12 м від сніговика в напрямку з ЧИСТОЮ лінією.
  // (раніше брали фіксований +x → інколи будівля на точці блукання глушила кидок = флак на CI)
  const dirs = [[12, 0], [-12, 0], [0, 12], [0, -12], [8.5, 8.5], [-8.5, -8.5]];
  let px = sm.x + 12, pz = sm.z;
  for (const [dx, dz] of dirs) {
    const x = sm.x + dx, z = sm.z + dz, y = w.groundH(x, z);
    const from = new V(sm.x, sm.y + 1.3, sm.z);
    const dir = new V(x - sm.x, (y + 1.2) - (sm.y + 1.3), z - sm.z);
    const dist = dir.length(); dir.normalize();
    if (w.shotBlockDist(from, dir, dist) > dist - 1.5) { px = x; pz = z; break; }
  }
  g.test.teleport(px, pz);
  sm.aggroed = true; sm.state = 'chase'; sm.rangedCd = 0.1;
  sm.telegraph = 0; sm.charging = 0; sm.stunT = 0;
});
const hpBefore = (await state()).player.health;
const gotProjectile = await waitFor(async () => page.evaluate(() => {
  const g = window.__game;
  // підтримуємо «готовність кидати», не перериваючи вже розпочату атаку
  const sm = g.level.zombies.list.find((z) => z.type === 'snowman' && z.state !== 'dead');
  if (sm && sm.state === 'chase' && sm.rangedCd > 1.0) { sm.aggroed = true; sm.rangedCd = 0.1; }
  return g.level.effects.projectiles.length > 0;
}), 30000, 'сніжка летить');
check(gotProjectile, 'сніговик кинув сніжку');
await waitFor(async () => (await state()).player.health < hpBefore, 12000, 'влучання сніжки');
s = await state();
check(s.player.health < hpBefore, `сніжка влучила (HP ${hpBefore}→${Math.round(s.player.health)})`);
await page.screenshot({ path: 'shots/u2-snowman-fight.png' });

// ============ ДРОБОВИК ============
console.log('▸ Дробовик');
await page.evaluate(() => {
  window.__game.test.god();
  window.__game.test.giveWeapon('shotgun');
});
s = await state();
check(s.player.weapons.includes('shotgun'), 'дробовик у арсеналі');
check(s.player.cur === 'shotgun', 'дробовик у руках');
const firedBefore0 = await page.evaluate(() => {
  const g = window.__game;
  g.test.aimAtNearestZombie();
  return g.level.stats.shotsFired;
});
await page.evaluate(() => window.__game.test.mouse(true));
await page.waitForTimeout(200);
await page.evaluate(() => window.__game.test.mouse(false));
const shotOk = await waitFor(async () =>
  (await page.evaluate(() => window.__game.level.stats.shotsFired)) > firedBefore0, 8000, 'постріл');
check(shotOk, 'постріл дробовиком');
await page.screenshot({ path: 'shots/u2-shotgun.png' });

// ============ ГРАНАТА ============
console.log('▸ Граната');
const grenadeTest = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  // дивимось трохи вниз у бік найближчого зомбі
  g.test.aimAtNearestZombie();
  const before = { grenades: p.grenades, kills: g.level.stats.kills };
  const ok = p.throwGrenade();
  return { ok, before };
});
check(grenadeTest.ok, 'граната кинута');
check(await waitFor(async () =>
  (await page.evaluate(() => window.__game.level.effects.grenadesLive.length)) === 0, 30000, 'вибух гранати'),
'граната вибухнула');
s = await state();
check(s.grenades === grenadeTest.before.grenades - 1, `гранат лишилось: ${s.grenades}`);

// вибух гранати вбиває зомбі — кладемо точно під ноги (сам кидок перевірено вище)
const killsBefore = (await state()).stats.kills;
await page.evaluate(() => {
  const g = window.__game;
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead');
  if (z) {
    const pos = g.level.player.pos.clone().set(z.x, z.y + 0.5, z.z);
    const vel = g.level.player.pos.clone().set(0, 0, 0);
    g.level.effects.spawnGrenade(pos, vel);
  }
});
check(await waitFor(async () => (await state()).stats.kills > killsBefore, 30000, 'вибух убив зомбі'),
  `вибух гранати вбиває зомбі (було ${killsBefore})`);

// ============ КОМБО ============
console.log('▸ Комбо');
await page.evaluate(() => {
  const g = window.__game;
  // швидко вбиваємо 5 зомбі поспіль
  let n = 0;
  for (const z of g.level.zombies.list) {
    if (z.state !== 'dead' && n < 5) { z.damage(99999, null, false); n++; }
  }
});
check(await waitFor(async () => (await state()).combo >= 5, 6000, 'комбо'), 'комбо x5 зараховано');
check(await waitFor(async () =>
  (await page.evaluate(() => document.getElementById('combo').classList.contains('show'))), 6000, 'комбо UI'),
'комбо-лічильник на екрані');

// ============ ШВИДКЕ ПРОХОДЖЕННЯ ПОЛЬЩІ → БОС МОРОЗ ============
console.log('▸ Король Мороз');
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
await waitFor(async () => {
  await page.evaluate(() => window.__game.test.finishHorde());
  return await page.evaluate(() => window.__game.level.missions.bossUnlocked);
}, 150000, 'арена');
await page.evaluate(() => {
  const a = window.__game.level.world.layout.arena;
  window.__game.test.teleport(a.x, a.z);
});
await waitFor(async () => (await state()).bossStarted, 15000, 'бос стартував');
s = await state();
check(s.bossStarted, 'бій з Королем Морозом почався');
check(s.bossHp === 2400, `HP Мороза: ${s.bossHp}`);
const bossName = await page.evaluate(() => document.getElementById('boss-name').textContent);
check(bossName.includes('МОРОЗ'), `ім'я боса на екрані: "${bossName}"`);
await page.screenshot({ path: 'shots/u2-frost-boss.png' });
// чекаємо великої сніжки: тримаємось на дистанції 15-25 м від боса
const bossThrew = await waitFor(async () => {
  return await page.evaluate(() => {
    const g = window.__game;
    const b = g.level.zombies.boss;
    if (b) {
      const d = Math.hypot(b.x - g.level.player.pos.x, b.z - g.level.player.pos.z);
      if (d < 12 || d > 35) {
        // стаємо за 18 м на південь від боса (в межах арени)
        const a = g.level.world.layout.arena;
        g.test.teleport(b.x, Math.min(b.z + 18, a.z + a.r - 4));
      }
    }
    return g.level.effects.projectiles.some((p) => p.size > 0.4);
  });
}, 90000, 'сніжка боса');
check(bossThrew, 'Мороз кидає великі сніжки');
// просаджуємо до ~70% — має прикликати сніговиків (поріг 75%)
await page.evaluate(() => window.__game.test.damageBoss(750));
await page.waitForTimeout(4000);
const minions = await page.evaluate(() => {
  const a = window.__game.level.world.layout.arena;
  return window.__game.level.zombies.list.filter((z) => z.type === 'snowman' && z.state !== 'dead'
    && Math.hypot(z.x - a.x, z.z - a.z) < 30).length;
});
check(minions > 0, `Мороз прикликав сніговиків: ${minions}`);
// добиваємо
await waitFor(async () => {
  const st = await state();
  if (st.bossHp !== null) await page.evaluate(() => window.__game.test.damageBoss(300));
  return st.bossHp === null;
}, 120000, 'смерть боса');
check(await waitFor(async () => (await state()).victoryShown, 20000, 'перемога'), 'екран перемоги');
const recPOL = await page.evaluate(() => window.__game.save.records.POL);
check(!!recPOL, `рекорд POL збережено: ${JSON.stringify(recPOL)}`);
await page.screenshot({ path: 'shots/u2-victory-poland.png' });

// ============ КАМПАНІЯ НА ГЛОБУСІ ============
console.log('▸ Кампанія');
await page.click('#btn-victory-globe');
await waitFor(async () => (await state()).state === 'globe', 10000, 'глобус');
await page.waitForTimeout(1500);
s = await state();
check(s.liberated.includes('POL'), 'Польща звільнена');
await page.screenshot({ path: 'shots/u2-globe-poland.png' });

// зброя збереглась — заходимо в Україну і маємо дробовик
await page.evaluate(() => window.__game.startLevel('UKR'));
await waitFor(async () => (await state()).state === 'level', 25000, 'Україна повторно');
s = await state();
check(s.player.weapons.includes('shotgun'), 'дробовик зберігся між країнами');

// ============ ТАЧ-КЕРУВАННЯ ============
console.log('▸ Мобільне керування');
await page.goto(BASE + '/?test&country=UKR&touch');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 25000, 'рівень тач');
const touchVisible = await page.evaluate(() => {
  const ui = document.getElementById('touch-ui');
  return getComputedStyle(ui).display !== 'none' && !!document.getElementById('tb-fire');
});
check(touchVisible, 'тач-інтерфейс показано');
// віртуальний джойстик: тиснемо зліва і тягнемо вгору
const posBefore = await page.evaluate(() => ({ x: window.__game.level.player.pos.x, z: window.__game.level.player.pos.z }));
await page.touchscreen.tap(200, 600); // пробудження
await page.evaluate(() => {
  // синтетичні touch-події на канві
  const canvas = window.__game.renderer.domElement;
  const mk = (type, id, x, y) => {
    const t = new Touch({ identifier: id, target: canvas, clientX: x, clientY: y });
    canvas.dispatchEvent(new TouchEvent(type, {
      touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true,
    }));
  };
  mk('touchstart', 1, 200, 600);
  mk('touchmove', 1, 200, 540);
});
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const canvas = window.__game.renderer.domElement;
  const t = new Touch({ identifier: 1, target: canvas, clientX: 200, clientY: 540 });
  canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true, cancelable: true }));
});
const posAfter = await page.evaluate(() => ({ x: window.__game.level.player.pos.x, z: window.__game.level.player.pos.z }));
const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);
check(moved > 2, `джойстик рухає гравця (${moved.toFixed(1)} м)`);
// кнопка вогню
const firedBefore = await page.evaluate(() => window.__game.level.stats.shotsFired);
await page.evaluate(() => {
  const el = document.getElementById('tb-fire');
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [], changedTouches: [] }));
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const el = document.getElementById('tb-fire');
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [] }));
});
const firedAfter = await page.evaluate(() => window.__game.level.stats.shotsFired);
check(firedAfter > firedBefore, `кнопка вогню стріляє (${firedBefore}→${firedAfter})`);
await page.screenshot({ path: 'shots/u2-touch.png' });

console.log('');
console.log(failed === 0 ? '🎉 УСІ ТЕСТИ ОНОВЛЕННЯ ПРОЙДЕНО' : `❌ ПРОВАЛЕНО: ${failed}`);
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
