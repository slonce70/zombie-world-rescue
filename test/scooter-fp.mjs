// 🛴 Чесне 1-е лице на самокаті: під час їзди НЕ має бути бігового покачування (bobAmp).
// Баг: від 1-ї особи камера/зброя тряслись як при бігу, бо bobAmp рахується від
// сирої швидкості, а самокат їде швидко (rideSpeed до 12.5). Від 3-ї особи — поза 'ride', тому ок.
// Гард: на самокаті у 1-й особі bobAmp придушено; при звичайному бігу — великий (контроль, щоб тест мав зуби).
import { chromium } from 'playwright';
const SLOW = Number(process.env.SLOW || 1);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
let failed = 0;
const check = (c, m) => { console.log(c ? '  ✅' : '  ❌', m); if (!c) failed++; };

await page.goto('http://localhost:8741/?test&fresh&country=UKR');
await page.waitForFunction(
  () => window.__game && window.__game.state === 'level' && window.__game.level && window.__game.level.player,
  null, { timeout: 30000 * SLOW }
);

// сідаємо на самокат і вмикаємо 1-е лице
await page.evaluate(() => {
  const g = window.__game;
  g.test.mountScooter(0);
  g.level.player.firstPerson = true;
  g.level.player._applyView();
});

// тримаємо газ (W), щоб набрати швидкість
await page.keyboard.down('KeyW');
await page.waitForFunction(() => window.__game.level.player.rideSpeed > 8, null, { timeout: 25000 * SLOW });
await page.waitForTimeout(1500 * SLOW); // даємо bobAmp усталитись

const riding = await page.evaluate(() => {
  const p = window.__game.level.player;
  return { riding: !!p.riding, fp: p.firstPerson, rideSpeed: p.rideSpeed, bobAmp: p.bobAmp };
});
await page.keyboard.up('KeyW');
console.log('RIDING FP:', JSON.stringify(riding));
check(riding.riding && riding.fp, 'на самокаті у 1-й особі');
check(riding.rideSpeed > 8, `швидкість самоката висока (${riding.rideSpeed.toFixed(1)})`);
check(riding.bobAmp < 0.3, `bobAmp придушено під час їзди (${riding.bobAmp.toFixed(2)}) — без бігового тряса`);

// контроль: зійшли і біжимо — bobAmp має бути великим (інакше тест нічого не перевіряє)
await page.evaluate(() => window.__game.test.dismountScooter());
await page.keyboard.down('KeyW');
await page.waitForTimeout(1800 * SLOW);
const running = await page.evaluate(() => {
  const p = window.__game.level.player;
  return { riding: !!p.riding, bobAmp: p.bobAmp, speed: Math.hypot(p.vel.x, p.vel.z) };
});
await page.keyboard.up('KeyW');
console.log('RUNNING:', JSON.stringify(running));
check(!running.riding, 'зійшли з самоката');
check(running.bobAmp > 0.5, `при звичайному бігу bobAmp великий (${running.bobAmp.toFixed(2)}) — контроль`);

check(errs.length === 0, `без JS-помилок (${errs[0] || 'ok'})`);
await browser.close();
console.log(failed === 0 ? '\n🎉 ЧЕСНЕ 1-Е ЛИЦЕ НА САМОКАТІ' : `\n❌ САМОКАТ-FP: ${failed} провалів`);
process.exit(failed === 0 ? 0 : 1);
