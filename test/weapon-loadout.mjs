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

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Гардероб: максимум 7 зброй із 10');
const ward = await page.evaluate(async () => {
  const { WEAPON_SLOTS } = await import('/src/player.js');
  const g = window.__game;
  g.save.weapons = WEAPON_SLOTS.filter((id) => id !== 'pistol');
  g.save.weaponLoadout = ['pistol', 'rifle', 'shotgun', 'smg', 'magnum', 'sniper', 'bazooka'];
  g.saveGame();
  g.renderWardrobe();
  g._showOverlay('overlay-wardrobe');
  const weaponTab = [...document.querySelectorAll('#wardrobe-content .ward-tab')]
    .find((t) => t.textContent.trim() === 'Зброя');
  if (weaponTab) weaponTab.click();
  const state = () => ({
    tabs: [...document.querySelectorAll('#wardrobe-content .ward-tab')].map((t) => t.textContent.trim()),
    selected: [...document.querySelectorAll('#wardrobe-content .ward-card[data-kind="weapon"].equipped')].map((el) => el.dataset.id),
    saved: [...(g.save.weaponLoadout || [])],
  });
  const before = state();
  document.querySelector('#wardrobe-content .ward-card[data-kind="weapon"][data-id="laser"]')?.click();
  const afterBlocked = state();
  document.querySelector('#wardrobe-content .ward-card[data-kind="weapon"][data-id="shotgun"]')?.click();
  document.querySelector('#wardrobe-content .ward-card[data-kind="weapon"][data-id="laser"]')?.click();
  const afterSwap = state();
  document.querySelector('#wardrobe-content .ward-card[data-kind="weapon"][data-id="pistol"]')?.click();
  const afterPistolClick = state();
  return { before, afterBlocked, afterSwap, afterPistolClick };
});
check(ward.before.tabs.includes('Зброя'), `є вкладка Зброя: ${ward.before.tabs.join(', ')}`);
check(ward.before.selected.length === 7 && ward.before.selected.includes('pistol'),
  'у Гардеробі вибрано рівно 7 зброй, пістолет включений', JSON.stringify(ward.before));
check(!ward.afterBlocked.selected.includes('laser') && ward.afterBlocked.selected.length === 7,
  '8-му зброю не можна додати понад ліміт', JSON.stringify(ward.afterBlocked));
check(!ward.afterSwap.selected.includes('shotgun') && ward.afterSwap.selected.includes('laser') && ward.afterSwap.selected.length === 7,
  'після зняття однієї зброї можна взяти іншу', JSON.stringify(ward.afterSwap));
check(ward.afterPistolClick.selected.includes('pistol') && ward.afterPistolClick.selected.length === 7,
  'пістолет не можна прибрати з набору', JSON.stringify(ward.afterPistolClick));

console.log('▸ Рівень бере тільки вибрані 7');
await page.evaluate(async () => {
  const g = window.__game;
  g._hideOverlay('overlay-wardrobe');
  await g.startLevel('UKR');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
const level = await page.evaluate(() => {
  const g = window.__game;
  return { loadout: [...g.save.weaponLoadout], weapons: [...g.level.player.weapons] };
});
check(level.weapons.length === 7 && level.loadout.every((id) => level.weapons.includes(id)),
  'гравець у рівні носить тільки вибрані 7 зброй', JSON.stringify(level));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 WEAPON LOADOUT OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
