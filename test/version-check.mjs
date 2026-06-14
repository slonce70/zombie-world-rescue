// Авто-оновлення PWA: тег версії, авто-reload на нову версію, анти-цикл.
// Тепер із перевірками й кодом виходу.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

// 1. Звичайне завантаження: тег версії, без перезавантажень
await page.goto('http://localhost:8741/');
await page.evaluate(() => localStorage.setItem('zr-save-v1', JSON.stringify({ coins: 500, upgrades: {}, liberated: { UKR: true, POL: true }, weapons: [], records: {} })));
await page.reload();
await page.waitForTimeout(4000);
const r1 = await page.evaluate(() => ({
  tag: document.getElementById('version-tag').textContent,
  appV: window.__APP_VERSION,
  target: window.__game.globe.targetId,
}));
console.log('NORMAL:', JSON.stringify(r1));
check(/^v\d+$/.test(r1.tag), `тег версії показано (${r1.tag})`);
check(r1.tag === 'v' + r1.appV, `тег = v${r1.appV}`);

// 2. Симуляція нової версії на сервері → авто-reload на глобусі (v вище за поточну)
const newV = r1.appV + 1;
await page.evaluate((v) => window.__game._onNewVersion(v), newV);
await page.waitForTimeout(3000);
const r2 = await page.evaluate(() => ({
  reloadedMark: sessionStorage.getItem('zr-reload-for'),
  tag: document.getElementById('version-tag').textContent,
  state: window.__game && window.__game.state,
}));
console.log('AFTER FAKE UPDATE (reloaded):', JSON.stringify(r2));
check(r2.reloadedMark === String(newV), `позначка перезавантаження = ${newV}`);
check(r2.state === 'globe', 'після reload знову на глобусі');

// 3. Друга спроба з тією ж версією → не циклить, показує підказку оновити вручну
await page.evaluate((v) => window.__game._onNewVersion(v), newV);
await page.waitForTimeout(500);
const r3 = await page.evaluate(() => document.getElementById('version-tag').textContent);
console.log('SECOND TRY TAG:', r3);
check(/Онови|Ctrl|⌘|Shift/i.test(r3), 'друга спроба не циклить — показує підказку «онови вручну»');

// ігноруємо мережевий шум (429 від хмарного сейва/реле тощо — гра їх ковтає тихо);
// фейлимось лише на справжніх JS-помилках/винятках сторінки
const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log('ERRORS:\n' + realErrors.join('\n'));
console.log(failed === 0 ? '\n🎉 ВЕРСІЮВАННЯ ОК' : `\n❌ ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 && realErrors.length === 0 ? 0 : 1);
