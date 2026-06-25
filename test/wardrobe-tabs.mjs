import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Вкладки гардероба');
const ward = await page.evaluate(() => {
  const g = window.__game;
  g.renderWardrobe();
  g._showOverlay('overlay-wardrobe');
  const tabs = [...document.querySelectorAll('#wardrobe-content .ward-tab')].map((t) => t.textContent.trim());
  const active0 = document.querySelector('#wardrobe-content .ward-tab.on')?.textContent.trim();
  const visible0 = [...document.querySelectorAll('#wardrobe-content .ward-pane:not([hidden]) .ward-card')]
    .map((el) => el.dataset.kind);
  const gadgetTab = [...document.querySelectorAll('#wardrobe-content .ward-tab')].find((t) => t.textContent.trim() === 'Гаджети');
  if (gadgetTab) gadgetTab.click();
  const active1 = document.querySelector('#wardrobe-content .ward-tab.on')?.textContent.trim();
  const visible1 = [...document.querySelectorAll('#wardrobe-content .ward-pane:not([hidden]) .ward-card')]
    .map((el) => el.dataset.kind);
  return { tabs, active0, visible0, active1, visible1 };
});

check(['Скіни', 'Гаджети', 'Танці', 'Улюбленці', 'Башта', 'Кулі', 'Герой'].every((x) => ward.tabs.includes(x)),
  `є верхні вкладки: ${ward.tabs.join(', ')}`);
check(ward.active0 === 'Скіни' && ward.visible0.length && ward.visible0.every((x) => x === 'skin'),
  `за замовчуванням видно тільки скіни: ${ward.active0}/${ward.visible0.join(', ')}`);
check(ward.active1 === 'Гаджети' && ward.visible1.length && ward.visible1.every((x) => x === 'gadget'),
  `вкладка гаджетів показує тільки гаджети: ${ward.active1}/${ward.visible1.join(', ')}`);

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ВКЛАДКИ ГАРДЕРОБА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
