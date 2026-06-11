// Смоук-тест: глобус і вхід у рівень, скріншоти, помилки консолі
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:8741';
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });
const shot = (p, name) => p.screenshot({ path: `shots/${name}.png` });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// 1. Глобус
await page.goto(BASE + '/?test&fresh');
await page.waitForTimeout(4500);
await shot(page, '01-globe');
const s1 = await page.evaluate(() => window.__game && window.__game.test.state());
console.log('GLOBE STATE:', JSON.stringify(s1));

// 2. Вхід у рівень напряму
await page.goto(BASE + '/?test&fresh&country=UKR');
await page.waitForTimeout(6000);
await shot(page, '02-level-spawn');
const s2 = await page.evaluate(() => window.__game.test.state());
console.log('LEVEL STATE:', JSON.stringify(s2));

// 3. Рух уперед 2с
await page.evaluate(() => window.__game.test.key('KeyW', true));
await page.waitForTimeout(2000);
await page.evaluate(() => window.__game.test.key('KeyW', false));
await shot(page, '03-after-walk');
const s3 = await page.evaluate(() => window.__game.test.state());
console.log('AFTER WALK:', JSON.stringify(s3.player));

// 4. Третя особа
await page.evaluate(() => window.__game.test.key('KeyV', true));
await page.waitForTimeout(400);
await page.evaluate(() => window.__game.test.key('KeyV', false));
await page.waitForTimeout(600);
await shot(page, '04-third-person');

// 5. Стрільба в найближчого зомбі
await page.evaluate(() => {
  window.__game.test.teleport(-70, -40);
  window.__game.test.aimAtNearestZombie();
});
await page.waitForTimeout(300);
await page.evaluate(() => window.__game.test.mouse(true));
await page.waitForTimeout(250);
await page.evaluate(() => window.__game.test.mouse(false));
await shot(page, '05-shooting');
const s5 = await page.evaluate(() => window.__game.test.state());
console.log('AFTER SHOT:', JSON.stringify({ shots: s5.stats.shotsFired, hits: s5.stats.shotsHit, kills: s5.stats.kills }));

console.log('FPS:', s5.fps);
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
