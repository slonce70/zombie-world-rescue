// Діагностика місії 3: чому склад не зачищається реальним боєм
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto('http://localhost:8741/?test&fresh&country=UKR');
await page.waitForTimeout(5000);
await page.evaluate(() => window.__game.test.god());
await page.evaluate(() => window.__game.test.teleport(128, 38));

for (let i = 0; i < 40; i++) {
  const info = await page.evaluate(() => {
    const g = window.__game;
    const t = g.test;
    const p = g.level.player;
    const zone = g.level.zombies.list.filter((z) => z.zone === 'warehouse' && z.state !== 'dead');
    const d = t.aimAtNearestZombie();
    if (p.curAmmo.mag === 0 && p.reloading <= 0) p.startReload();
    if (p.reloading <= 0) t.mouse(true);
    return {
      zone: zone.length,
      zonePos: zone.slice(0, 4).map((z) => `${z.type}@(${Math.round(z.x)},${Math.round(z.z)})hp${Math.round(z.hp)}st:${z.state}`),
      nearest: d === null ? null : Math.round(d),
      player: `(${Math.round(p.pos.x)},${Math.round(p.pos.z)})`,
      kills: g.level.stats.kills,
      hits: g.level.stats.shotsHit,
      shots: g.level.stats.shotsFired,
    };
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__game.test.mouse(false));
  await page.waitForTimeout(60);
  if (i % 5 === 0) console.log(`i=${i}`, JSON.stringify(info));
  if (info.zone === 0) { console.log('ЗАЧИЩЕНО на i=' + i); break; }
}
await page.screenshot({ path: 'shots/debug-warehouse.png' });
await browser.close();
