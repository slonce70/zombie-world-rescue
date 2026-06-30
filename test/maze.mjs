import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
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

await page.goto(`${BASE}/?test&fresh&seed=23`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Лабіринт відкривається після 11 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const ten = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true };
  const eleven = { ...ten, CHN: true };
  g.save.liberated = ten;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="maze"]');
  const tabsBefore = [...document.querySelectorAll('.solo-tab')].map((t) => t.textContent.trim());
  g.save.liberated = eleven;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="maze"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    name: after && after.querySelector('.sm-name').textContent,
    tabsBefore,
  };
});
check(menu.beforeExists && menu.beforeLocked && menu.tabsBefore.includes('ЛАБІРИНТ'), 'до 11 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked && /ЛАБІРИНТ/i.test(menu.name), 'після 11 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт Лабіринту: 3 ключі, вихід і перемога після збору ключів');
await page.evaluate(() => window.__game.test.startMaze());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.maze, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  const m = g.level.maze;
  return {
    keys: m.keys.map((k) => ({ taken: k.taken })),
    exitOpen: m.exit.open,
    mazeZombies: g.level.zombies.list.filter((z) => z.maze && z.state !== 'dead').length,
    noShop: g.level.noShop,
    noPickups: g.level.noPickups,
    noGadgets: g.level.noGadgets,
    hud: m.getHudList().map((x) => x.title),
    markers: m.getMarkers().length,
  };
});
check(started.keys.length === 3 && started.keys.every((k) => !k.taken), 'стартує 3 ключі', JSON.stringify(started));
check(!started.exitOpen && started.mazeZombies >= 6, 'вихід закритий, зомбі патрулюють коридори', JSON.stringify(started));
check(started.noShop && started.noPickups && !started.noGadgets, 'магазин і пікапи вимкнені, гаджети дозволені', JSON.stringify(started));
check(started.hud.some((x) => x.includes('ключ')) && started.markers >= 4, 'HUD і маркери показують ключі та вихід', JSON.stringify(started));

const finish = await page.evaluate(() => {
  const g = window.__game;
  const m = g.level.maze;
  for (const key of m.keys) m.collectKey(key);
  const open = m.exit.open;
  m.finish();
  return { keys: m.keysTaken, open, over: m.over, completed: m.completed, victoryShown: g.victoryShown };
});
check(finish.keys === 3 && finish.open, '3 ключі відкривають вихід', JSON.stringify(finish));
check(finish.over && finish.completed && finish.victoryShown, 'вихід завершує режим перемогою', JSON.stringify(finish));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЛАБІРИНТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
