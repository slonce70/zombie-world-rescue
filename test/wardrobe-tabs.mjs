import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

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
  const shield = document.querySelector('#wardrobe-content .ward-card[data-kind="gadget"][data-id="shield"]');
  return {
    tabs, active0, visible0, active1, visible1,
    shieldDesc: shield?.querySelector('.ward-desc')?.textContent.trim() || '',
    shieldStat: shield?.querySelector('.ward-stat')?.textContent.trim() || '',
  };
});

check(['Скіни', 'Гаджети', 'Танці', 'Улюбленці', 'Башта', 'Кулі', 'Герой'].every((x) => ward.tabs.includes(x)),
  `є верхні вкладки: ${ward.tabs.join(', ')}`);
check(ward.active0 === 'Скіни' && ward.visible0.length && ward.visible0.every((x) => x === 'skin'),
  `за замовчуванням видно тільки скіни: ${ward.active0}/${ward.visible0.join(', ')}`);
check(ward.active1 === 'Гаджети' && ward.visible1.length && ward.visible1.every((x) => x === 'gadget'),
  `вкладка гаджетів показує тільки гаджети: ${ward.active1}/${ward.visible1.join(', ')}`);
check(ward.shieldDesc.includes('поглинає 50 шкоди') && ward.shieldStat.includes('30с'),
  `картка гаджета пояснює дію і перезарядку: ${ward.shieldDesc}/${ward.shieldStat}`);

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ВКЛАДКИ ГАРДЕРОБА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
