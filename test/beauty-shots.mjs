// Красиві кадри головних фіч оновлення: сніговик, дробовик, Король Мороз
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const aimAt = (sel) => page.evaluate((selFn) => {
  const g = window.__game;
  const p = g.level.player;
  const target = eval(selFn);
  if (!target) return false;
  const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
  p.yaw = Math.atan2(-dx, -dz);
  const eyeY = p.pos.y + 1.62;
  const ty = target.y + (target.rig ? target.rig.height * 0.5 : 1);
  p.pitch = Math.atan2(ty - eyeY, Math.hypot(dx, dz));
  return true;
}, sel);

await page.goto('http://localhost:8741/?test&fresh&country=POL');
await page.waitForTimeout(8000);
await page.evaluate(() => window.__game.test.god());

// 1. Сніговик зблизька (вид від 3-ї особи, щоб видно і героя, і сніговика)
await page.evaluate(() => {
  const g = window.__game;
  const sm = g.level.zombies.list.find((z) => z.type === 'snowman' && z.state !== 'dead');
  g.test.teleport(sm.x + 7, sm.z + 2);
  sm.aggroed = true;
  sm.state = 'chase';
});
await aimAt(`g.level.zombies.list.find((z) => z.type === 'snowman' && z.state !== 'dead')`);
await page.waitForTimeout(2500);
await aimAt(`g.level.zombies.list.find((z) => z.type === 'snowman' && z.state !== 'dead')`);
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/beauty-snowman.png' });
console.log('✓ сніговик');

// 2. Дробовик у руках (від 1-ї особи) зі пострілом
await page.evaluate(() => window.__game.test.giveWeapon('shotgun'));
await page.waitForTimeout(900);
await aimAt(`g.level.zombies.list.find((z) => z.state !== 'dead')`);
await page.evaluate(() => window.__game.test.mouse(true));
await page.waitForTimeout(120);
await page.screenshot({ path: 'shots/beauty-shotgun.png' });
await page.evaluate(() => window.__game.test.mouse(false));
console.log('✓ дробовик');

// 3. Король Мороз у кадрі
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(800);
  const u = await page.evaluate(() => {
    window.__game.test.finishHorde();
    return window.__game.level.missions.bossUnlocked;
  });
  if (u) break;
}
await page.evaluate(() => window.__game.test.teleport(-10, -168));
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(500);
  if (await page.evaluate(() => window.__game.level.missions.bossStarted)) break;
}
// підпускаємо боса на 8-12 м і дивимось на нього
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.zombies.boss;
  if (b) g.test.teleport(b.x, b.z + 10);
});
await aimAt(`g.level.zombies.boss`);
await page.waitForTimeout(600);
await aimAt(`g.level.zombies.boss`);
await page.screenshot({ path: 'shots/beauty-frost-boss.png' });
console.log('✓ Король Мороз');

await browser.close();
