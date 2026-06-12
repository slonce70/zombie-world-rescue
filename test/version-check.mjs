import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

// 1. Звичайне завантаження: тег версії, без перезавантажень
await page.goto('http://localhost:8741/');
await page.evaluate(() => localStorage.setItem('zr-save-v1', JSON.stringify({ coins: 500, upgrades: {}, liberated: { UKR: true, POL: true }, weapons: [], records: {} })));
await page.reload();
await page.waitForTimeout(4000);
const r1 = await page.evaluate(() => ({
  tag: document.getElementById('version-tag').textContent,
  target: window.__game.globe.targetId,
  allDone: window.__game.globe.allDone,
}));
console.log('NORMAL:', JSON.stringify(r1));

// 2. Симуляція нової версії на сервері → авто-reload на глобусі
await page.evaluate(() => window.__game._onNewVersion(4));
await page.waitForTimeout(3000);
const r2 = await page.evaluate(() => ({
  reloadedMark: sessionStorage.getItem('zr-reload-for'),
  tag: document.getElementById('version-tag').textContent,
  state: window.__game && window.__game.state,
}));
console.log('AFTER FAKE UPDATE (reloaded):', JSON.stringify(r2));

// 3. Друга спроба з тією ж версією → не циклить, показує підказку
await page.evaluate(() => window.__game._onNewVersion(4));
await page.waitForTimeout(500);
const r3 = await page.evaluate(() => document.getElementById('version-tag').textContent);
console.log('SECOND TRY TAG:', r3);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
await browser.close();
