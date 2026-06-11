// Перегравання рівня після перемоги: ресурси диспозяться і відновлюються коректно
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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

async function speedrun() {
  await page.evaluate(() => {
    const g = window.__game;
    g.test.god();
    g.test.completeMission('rescue');
    g.test.completeMission('tower');
    g.test.completeMission('warehouse');
  });
  await waitFor(async () => {
    await page.evaluate(() => window.__game.test.finishHorde());
    return await page.evaluate(() => window.__game.level.missions.bossUnlocked);
  }, 60000, 'арена');
  await page.evaluate(() => window.__game.test.teleport(-10, -168));
  await waitFor(async () => (await state()).bossStarted, 15000, 'бос');
  await waitFor(async () => {
    await page.evaluate(() => window.__game.test.damageBoss(300));
    return (await state()).victoryShown;
  }, 60000, 'перемога');
}

console.log('▸ Проходження №1');
await page.goto('http://localhost:8741/?test&fresh&country=UKR');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 25000, 'рівень 1');
await speedrun();
check((await state()).victoryShown, 'перемога №1');
await page.click('#btn-victory-globe');
await waitFor(async () => (await state()).state === 'globe', 10000, 'глобус');
check((await state()).state === 'globe', 'повернулись на глобус');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/replay-globe.png' });

console.log('▸ Проходження №2 (та сама сесія, нові ресурси)');
await page.evaluate(() => window.__game.startLevel('UKR'));
await waitFor(async () => (await state()).state === 'level', 25000, 'рівень 2');
let s = await state();
check(s.state === 'level', 'рівень №2 завантажено');
check(s.zombies >= 35, `зомбі знову на карті: ${s.zombies}`);
await page.waitForTimeout(2000);
await page.screenshot({ path: 'shots/replay-level2.png' });
// швидка перевірка що рендер живий (зомбі рухаються, постріл працює)
await page.evaluate(() => { window.__game.test.god(); window.__game.test.teleport(-85, -45); window.__game.test.aimAtNearestZombie(); });
await page.waitForTimeout(400);
await page.evaluate(() => window.__game.test.mouse(true));
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.test.mouse(false));
s = await state();
check(s.stats.shotsFired > 0, 'стрільба працює у повторному рівні');
await speedrun();
check((await state()).victoryShown, 'перемога №2');

console.log('');
console.log(failed === 0 ? '🎉 ПЕРЕГРАВАННЯ ПРАЦЮЄ' : `❌ ПРОВАЛЕНО: ${failed}`);
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
