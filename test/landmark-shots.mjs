// Красиві кадри нових ландмарків обох карт
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const look = (x, z, yaw, pitch = -0.1) => page.evaluate(([a, b, c, d]) => {
  window.__game.test.teleport(a, b);
  window.__game.test.setAim(c, d);
}, [x, z, yaw, pitch]);

// УКРАЇНА
await page.goto('http://localhost:8741/?test&fresh&country=UKR');
await page.waitForTimeout(8000);
await page.evaluate(() => window.__game.test.god());

// соняшники (поле на схід, дивимось зі заходу на схід)
await look(60, 6, -Math.PI / 2, -0.05);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/lm-sunflowers.png' });
console.log('✓ соняшники');

// ставок з пірсом
await look(-55, 55, Math.PI, -0.15);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/lm-pond.png' });
console.log('✓ ставок');

// вітряк
await look(-130, -2, Math.PI / 2 + 0.5, 0.05);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/lm-windmill.png' });
console.log('✓ вітряк');

// ПОЛЬЩА
await page.goto('http://localhost:8741/?test&fresh&country=POL');
await page.waitForTimeout(8000);
await page.evaluate(() => window.__game.test.god());

// ринкова площа з ратушею (дивимось з півдня на північ)
await look(0, 12, 0, 0);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/lm-square.png' });
console.log('✓ площа');

// замерзле озеро
await look(60, 32, -Math.PI / 2, -0.1);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/lm-lake.png' });
console.log('✓ озеро');

// замок-арена
await look(12, -125, 0, 0);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/lm-castle.png' });
console.log('✓ замок');

// депо
await look(-95, 70, Math.PI / 2 + 0.7, -0.05);
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/lm-depot.png' });
console.log('✓ депо');

await browser.close();
