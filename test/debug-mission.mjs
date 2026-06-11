// Діагностика: орда і ремонт вежі
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

await page.goto('http://localhost:8741/?test&fresh&country=UKR');
await page.waitForTimeout(5000);
await page.evaluate(() => window.__game.test.god());

// === ОРДА ===
await page.evaluate(() => window.__game.test.completeMission('rescue'));
console.log('Місію 1 завершено через API, чекаємо орду...');
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  const h = await page.evaluate(() => {
    const zm = window.__game.level.zombies;
    return {
      active: zm.hordeActive, pending: zm.hordePending, remaining: zm.hordeRemaining,
      hordeZ: zm.list.filter((z) => z.horde).map((z) => ({ st: z.state, d: Math.round(Math.hypot(z.x - window.__game.level.player.pos.x, z.z - window.__game.level.player.pos.z)) })),
    };
  });
  console.log(`t=${i}s active=${h.active} pending=${h.pending} remaining=${h.remaining} зомбі: ${JSON.stringify(h.hordeZ.slice(0, 6))}`);
  if (i === 7) {
    await page.evaluate(() => window.__game.test.finishHorde());
    console.log('  finishHorde()');
  }
}

// === ВЕЖА ===
console.log('--- Вежа ---');
await page.evaluate(() => {
  window.__game.test.killZombiesNear(112, -92, 30);
  window.__game.test.teleport(114.6, -90.7);
});
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.test.key('KeyE', true));
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(1000);
  const d = await page.evaluate(() => {
    const L = window.__game.level;
    const rp = L.world.repairPoint;
    const p = L.player.pos;
    return {
      dist: Math.round(Math.hypot(p.x - rp.x, p.z - rp.z) * 100) / 100,
      px: Math.round(p.x * 10) / 10, pz: Math.round(p.z * 10) / 10,
      eDown: L.game.input.keys.has('KeyE'),
      progress: Math.round(L.missions.repairProgress * 100),
      prompt: L.missions.prompt ? L.missions.prompt.text : null,
      towerState: L.missions.get('tower').state,
      pendingHorde: !!L.missions.pendingHorde,
      hordeActive: L.zombies.hordeActive,
    };
  });
  console.log(`t=${i}s`, JSON.stringify(d));
  if (d.towerState === 'done') break;
  if (i % 3 === 2) await page.evaluate(() => window.__game.test.killZombiesNear(114, -90, 30));
}
await browser.close();
