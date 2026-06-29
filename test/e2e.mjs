// Повне наскрізне проходження: 3 місії → орди → бос → перемога
// Усі очікування — полінг ігрового стану (headless час тече повільніше за реальний)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const state = () => page.evaluate(() => window.__game.test.state());
const ev = (fn, ...args) => page.evaluate(([f, a]) => window.__game.test[f](...a), [fn, args]);
const shot = (name) => page.screenshot({ path: `shots/${name}.png` });
const log = (...a) => console.log('▸', ...a);
let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};

// SLOW=N множить усі таймаути: на CI-ранері з софтверним рендером ігровий час
// тече у рази повільніше реального (dt-кламп) — локально це нічого не коштує,
// бо waitFor виходить одразу при успіху
const SLOW = parseFloat(process.env.SLOW || '1');
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs * SLOW) {
    if (await fn()) return true;
    await page.waitForTimeout(400);
  }
  log(`⚠️ Таймаут очікування: ${label}`);
  return false;
}

// бойовий цикл: цілимось у найближчого зомбі і стріляємо;
// якщо вбивства зупинились (ціль за стіною) — телепортуємось впритул до цілі
async function fightUntil(condFn, timeoutMs, label) {
  const t0 = Date.now();
  let lastKills = -1;
  let stuckSince = Date.now();
  while (Date.now() - t0 < timeoutMs * SLOW) {
    if (await condFn()) return true;
    const kills = await page.evaluate(() => {
      const g = window.__game;
      const t = g.test;
      const p = g.level.player;
      let d = t.aimAtNearestZombie();
      // якщо ціль за стіною — обходимо вбік, не палимо набої в стіну
      if (d !== null && d < 45) {
        const origin = p.camera.position;
        const dir = p.forwardVec(new (origin.constructor)());
        const blockT = g.level.world.shotBlockDist(origin, dir, d);
        if (blockT < d - 1) {
          const px2 = p.pos.x + (Math.random() < 0.5 ? 6 : -6);
          const pz2 = p.pos.z + (Math.random() < 0.5 ? 6 : -6);
          t.teleport(px2, pz2);
          d = t.aimAtNearestZombie();
        }
      }
      if (d !== null && d > 45) {
        let best = null, bd = 1e9;
        for (const z of g.level.zombies.list) {
          if (z.state === 'dead') continue;
          const dd = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
          if (dd < bd) { bd = dd; best = z; }
        }
        if (best) {
          const dx = p.pos.x - best.x, dz = p.pos.z - best.z;
          const dn = Math.hypot(dx, dz) || 1;
          t.teleport(best.x + (dx / dn) * 18, best.z + (dz / dn) * 18);
          t.aimAtNearestZombie();
        }
      }
      if (p.curAmmo.mag === 0 && p.reloading <= 0) p.startReload();
      if (p.reloading <= 0) t.mouse(true);
      return g.level.stats.kills;
    });
    if (kills !== lastKills) { lastKills = kills; stuckSince = Date.now(); }
    // поріг «застрягли» теж масштабуємо SLOW: на софт-рендері 12с реального часу = мало
    // ігрових кадрів, інакше детектор хибно телепортує гравця посеред чесного бою
    if (Date.now() - stuckSince > 12000 * SLOW) {
      // застрягли (ціль за стіною) — стаємо поруч із ціллю
      await page.evaluate(() => {
        const g = window.__game;
        let best = null, bd = 1e9;
        for (const z of g.level.zombies.list) {
          if (z.state === 'dead') continue;
          const dd = Math.hypot(z.x - g.level.player.pos.x, z.z - g.level.player.pos.z);
          if (dd < bd) { bd = dd; best = z; }
        }
        if (best) g.test.teleport(best.x + 5, best.z + 5);
      });
      stuckSince = Date.now();
    }
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__game.test.mouse(false));
    await page.waitForTimeout(60);
  }
  log(`⚠️ Таймаут бою: ${label}`);
  return false;
}

log('=== ПОВНЕ ПРОХОДЖЕННЯ ===');
await page.goto(BASE + '/?test&fresh');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 20000, 'глобус');
let s = await state();
check(s.state === 'globe', 'починаємо на глобусі');
await shot('e2e-00-globe');

await page.evaluate(() => window.__game.startLevel('UKR'));
await waitFor(async () => (await state()).state === 'level', 20000, 'рівень');
s = await state();
check(s.state === 'level', 'рівень завантажено');
check(s.zombies >= 35, `зомбі на карті: ${s.zombies}`);
await ev('god'); // безсмертя для стабільності проходження — бої реальні

// --- МІСІЯ 1: хлів ---
log('Місія 1: порятунок людей');
await ev('teleport', -85, -45);
const guard1Cleared = await fightUntil(async () => (await page.evaluate(() =>
  window.__game.level.zombies.list.filter((z) => z.groupId === 100 && z.state !== 'dead').length)) === 0,
  120000, 'охорона хліва');
check(guard1Cleared, 'охорону хліва знищено в реальному бою');
await ev('teleport', -96, -67.5);
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.test.key('KeyE', true));
await page.waitForTimeout(250);
await page.evaluate(() => window.__game.test.key('KeyE', false));
await waitFor(async () => (await state()).missions.find((m) => m.id === 'rescue').state === 'done', 15000, 'місія 1');
s = await state();
check(s.missions.find((m) => m.id === 'rescue').state === 'done', 'місія 1 виконана');
const civs = await page.evaluate(() => window.__game.level.missions.civilians.length);
check(civs === 3, `цивільних врятовано: ${civs}`);
await shot('e2e-11-rescued');

// орда №1 — реальний бій
check(await waitFor(async () => (await state()).hordeActive, 30000, 'початок орди 1'), 'орда №1 почалась');
await shot('e2e-12-horde1');
const killsBefore = (await state()).stats.kills;
check(await fightUntil(async () => !(await state()).hordeActive, 240000, 'орда 1'), 'орда №1 відбита');
s = await state();
check(s.stats.kills - killsBefore >= 12, `у бою з ордою вбито: ${s.stats.kills - killsBefore}`);
log(`  всього вбито: ${s.stats.kills}, монети: ${s.coins}, точність: ${Math.round((s.stats.shotsHit / Math.max(1, s.stats.shotsFired)) * 100)}%`);

// --- МІСІЯ 2: вежа ---
log('Місія 2: радіовежа');
await ev('killZombiesNear', 112, -92, 30);
await ev('teleport', 114.6, -90.7);
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.test.key('KeyE', true));
const towerOk = await waitFor(async () => {
  await ev('killZombiesNear', 114, -90, 32); // хвилі захисту прибираємо, щоб не відривали від E
  return (await state()).missions.find((m) => m.id === 'tower').state === 'done';
}, 60000, 'ремонт вежі');
await page.evaluate(() => window.__game.test.key('KeyE', false));
check(towerOk, 'місія 2 виконана (утримання E)');
await shot('e2e-20-tower-fixed');
check(await waitFor(async () => (await state()).hordeActive, 30000, 'початок орди 2'), 'орда №2 почалась');
await ev('finishHorde');
await waitFor(async () => !(await state()).hordeActive, 15000, 'кінець орди 2');

// --- МІСІЯ 3: склад ---
log('Місія 3: склад зброї');
await ev('teleport', 128, 38);
const warehouseCleared = await fightUntil(async () => (await page.evaluate(() =>
  window.__game.level.zombies.countAliveInZone('warehouse'))) === 0, 240000, 'склад');
check(warehouseCleared, 'склад зачищено в реальному бою');
await shot('e2e-30-warehouse-cleared');
await ev('teleport', 126, 49.5);
await page.waitForTimeout(400);
await page.evaluate(() => window.__game.test.key('KeyE', true));
await page.waitForTimeout(250);
await page.evaluate(() => window.__game.test.key('KeyE', false));
await waitFor(async () => (await state()).missions.find((m) => m.id === 'warehouse').state === 'done', 15000, 'місія 3');
s = await state();
check(s.missions.find((m) => m.id === 'warehouse').state === 'done', 'місія 3 виконана');
check(s.player.weapons.includes('rifle'), 'автомат отримано');
check(s.player.cur === 'rifle', 'автомат у руках');
await shot('e2e-31-rifle');
check(await waitFor(async () => (await state()).hordeActive, 30000, 'початок орди 3'), 'орда №3 почалась');
await ev('finishHorde');
await waitFor(async () => !(await state()).hordeActive, 15000, 'кінець орди 3');

// --- Магазин ---
log('Магазин');
await ev('giveCoins', 500);
await page.keyboard.press('KeyB');
await page.waitForTimeout(800);
await shot('e2e-40-shop');
const coinsBefore = (await state()).coins;
// магазин тепер із вкладками — відкриваємо потрібну
await page.click('.shop-tab:has-text("Прокачування")');
await page.waitForTimeout(300);
await page.click('.shop-item[data-id="maxhp"]');
await page.waitForTimeout(400);
s = await state();
check(s.coins === coinsBefore - 120, `покупка пройшла (${coinsBefore} → ${s.coins})`);
const hpAfter = await page.evaluate(() => window.__game.level.player.maxHealth);
check(hpAfter === 125, `макс. здоров'я тепер ${hpAfter}`);
await page.keyboard.press('KeyB');
await page.waitForTimeout(400);

// --- БОС ---
log('Бос');
check(await waitFor(async () => {
  const st = await state();
  return st.missions.every((m) => m.state === 'done');
}, 10000, 'всі місії'), 'усі 3 місії виконані');
await waitFor(async () => (await page.evaluate(() => window.__game.level.missions.bossUnlocked)), 20000, 'арена відкрита');
await ev('teleport', -10, -150);
await page.waitForTimeout(600);
await ev('teleport', -10, -168);
check(await waitFor(async () => (await state()).bossStarted, 15000, 'старт боса'), 'бій з босом почався');
s = await state();
check(s.bossHp > 0, `бос має HP: ${s.bossHp}`);
await shot('e2e-50-boss');
check(await fightUntil(async () => {
  const st = await state();
  if (st.bossHp !== null && st.bossHp > 500) await ev('damageBoss', 30); // прискорюємо, але стріляємо реально
  return st.bossHp === null && st.bossStarted;
}, 240000, 'бос'), 'боса переможено');
check(await waitFor(async () => (await state()).victoryShown, 20000, 'екран перемоги'), 'екран перемоги показано');
await shot('e2e-60-victory');

// --- Повернення на глобус ---
await page.click('#btn-victory-globe');
await waitFor(async () => (await state()).state === 'globe', 10000, 'глобус 2');
s = await state();
check(s.state === 'globe', 'повернулись на глобус');
await page.waitForTimeout(1500);
await shot('e2e-61-globe-liberated');
const lib = await page.evaluate(() => window.__game.save.liberated);
check(lib.UKR === true, 'Україна позначена звільненою');

console.log('');
console.log(failed === 0 ? '🎉 УСІ ПЕРЕВІРКИ ПРОЙДЕНО' : `❌ ПРОВАЛЕНО ПЕРЕВІРОК: ${failed}`);
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
closeServer();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
