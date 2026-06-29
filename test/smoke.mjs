// Смоук-тест: глобус і вхід у рівень, скріншоти, помилки консолі.
// Тепер із РЕАЛЬНИМИ перевірками й кодом виходу — щоб зламана гра валила CI, а не світилась зеленим.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });
const shot = async (p, name) => {
  try {
    await p.screenshot({ path: `shots/${name}.png`, timeout: 8000 });
  } catch (e) {
    console.log(`  ⚠️ screenshot skipped: ${name} (${e.message.split('\n')[0]})`);
  }
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

// 1. Глобус
await page.goto(BASE + '/?test&fresh');
await page.waitForTimeout(4500);
await shot(page, '01-globe');
const s1 = await page.evaluate(() => window.__game && window.__game.test.state());
console.log('GLOBE STATE:', JSON.stringify(s1));
check(!!s1, 'window.__game.test.state() доступний');
check(s1 && s1.state === 'globe', `стартуємо на глобусі (state=${s1 && s1.state})`);

// 2. Вхід у рівень напряму
await page.goto(BASE + '/?test&fresh&country=UKR');
await page.waitForTimeout(6000);
await shot(page, '02-level-spawn');
const s2 = await page.evaluate(() => window.__game.test.state());
console.log('LEVEL STATE:', JSON.stringify(s2));
check(s2.state === 'level', `рівень завантажено (state=${s2.state})`);
check(s2.zombies > 0, `зомбі на карті: ${s2.zombies}`);

// 3. Рух уперед — на GitHub runner софтверний рендер іноді сильно розтягує RAF,
// тому тримаємо ввід до фактичного руху, а не рівно 2 секунди.
let s3 = null;
let moved = 0;
await page.evaluate(() => window.__game.test.key('KeyW', true));
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.test.key('KeyW', true));
  s3 = await page.evaluate(() => window.__game.test.state());
  moved = Math.hypot(s3.player.x - s2.player.x, s3.player.z - s2.player.z);
  if (moved > 0.5) break;
}
await shot(page, '03-after-walk');
await page.evaluate(() => window.__game.test.key('KeyW', false));
console.log('AFTER WALK:', JSON.stringify({ player: s3.player, moved, time: s3.stats.time }));
check(moved > 0.2, `гравець зрушив на ${moved.toFixed(2)} (цикл і ввід живі)`);

// 4. Третя особа
await page.evaluate(() => window.__game.test.key('KeyV', true));
await page.waitForTimeout(400);
await page.evaluate(() => window.__game.test.key('KeyV', false));
await page.waitForTimeout(600);
await shot(page, '04-third-person');

// 5. Стрільба в найближчого зомбі — постріл реєструється
await page.evaluate(() => {
  window.__game.test.teleport(-70, -40);
  window.__game.test.aimAtNearestZombie();
});
await page.waitForTimeout(300);
// headless-RAF буває 1-3 fps — пульсуємо кілька разів, поки постріл не пройде
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => window.__game.test.mouse(true));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__game.test.mouse(false));
  if ((await page.evaluate(() => window.__game.test.state())).stats.shotsFired > 0) break;
}
await shot(page, '05-shooting');
const s5 = await page.evaluate(() => window.__game.test.state());
console.log('AFTER SHOT:', JSON.stringify({ shots: s5.stats.shotsFired, hits: s5.stats.shotsHit, kills: s5.stats.kills }));
check(s5.stats.shotsFired > 0, `стрільба працює (пострілів: ${s5.stats.shotsFired})`);
check(s5.stats.time > s2.stats.time, `ігровий час іде (${s2.stats.time.toFixed(2)} → ${s5.stats.time.toFixed(2)}, fps=${s5.fps})`);

console.log('FPS:', s5.fps);
// мережевий шум (404/429 від опційних хмарних сервісів) — не привід валити смоук
const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log('CONSOLE ERRORS:\n' + realErrors.join('\n'));

console.log(failed === 0 ? '\n🎉 СМОУК ПРОЙДЕНО' : `\n❌ СМОУК ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 && realErrors.length === 0 ? 0 : 1);
