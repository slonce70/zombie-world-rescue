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

await page.goto(`${BASE}/?test&fresh&seed=24`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Зомбі проти людей відкривається після 11 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const ten = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true };
  const eleven = { ...ten, CHN: true };
  g.save.liberated = ten;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="humans"]');
  const tabsBefore = [...document.querySelectorAll('.solo-tab')].map((t) => t.textContent.trim());
  g.save.liberated = eleven;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="humans"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    name: after && after.querySelector('.sm-name').textContent,
    tabsBefore,
  };
});
check(menu.beforeExists && menu.beforeLocked && menu.tabsBefore.includes('ЗОМБІ ПРОТИ ЛЮДЕЙ'), 'до 11 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked && /ЗОМБІ ПРОТИ ЛЮДЕЙ/i.test(menu.name), 'після 11 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт режиму: 30 клонів проти 30 зомбі і робота');
await page.evaluate(() => {
  window.__game.save.coins = 200;
  window.__game.test.startHumans();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.humans, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  const h = g.level.humans;
  h.update(0.05);
  return {
    roomSize: h.roomSize,
    clones: h.clones.map((c) => ({ hp: c.hp })),
    zombies: g.level.zombies.list.filter((z) => z.humans && z.state !== 'dead').length,
    robots: g.level.zombies.list.filter((z) => z.humans && z.type === 'robot' && z.state !== 'dead').length,
    weapons: [...g.level.player.weapons],
    currentWeapon: g.level.player.cur,
    noShop: g.level.noShop,
    noPickups: g.level.noPickups,
    noGadgets: g.level.noGadgets,
    hud: h.getHudList().map((x) => x.title),
    markers: h.getMarkers().length,
  };
});
check(started.roomSize === 750, 'кімната 750 на 750 метрів', JSON.stringify(started));
check(started.clones.length === 30 && started.clones.every((c) => c.hp === 100), 'з гравцем 30 клонів по 100 HP', JSON.stringify(started));
check(started.zombies === 31 && started.robots === 1, 'вороги: 30 зомбі і 1 зомбі-робот', JSON.stringify(started));
check(JSON.stringify(started.weapons) === JSON.stringify(['pistol', 'staff', 'sword']) && started.currentWeapon === 'pistol',
  'у гравця пістолет, посох і меч', JSON.stringify(started));
check(started.noShop && started.noPickups && started.noGadgets, 'немає пікапів, магазину і гаджетів', JSON.stringify(started));
check(started.hud.some((x) => x.includes('Зомбі')) && started.markers >= 31, 'HUD і маркери показують битву', JSON.stringify(started));

console.log('▸ Програш забирає 100 монет, перемога після знищення армії');
const lose = await page.evaluate(() => {
  const g = window.__game;
  g._endHumansRun(false);
  return { coins: g.save.coins, over: g.level.humans.over, completed: g.level.humans.completed };
});
check(lose.coins === 100 && lose.over && !lose.completed, 'за поразку -100 монет', JSON.stringify(lose));

await page.evaluate(() => {
  window.__game.endLevel();
  window.__game.save.coins = 200;
  window.__game.test.startHumans();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.humans, null, { timeout: 30000 });
const win = await page.evaluate(() => {
  const g = window.__game;
  for (const z of [...g.level.zombies.list]) {
    if (!z.humans || z.state === 'dead') continue;
    z.shieldHp = 0;
    z.damage(99999, null, false);
  }
  g.level.humans.update(0.05);
  return { remaining: g.level.humans.remaining(), over: g.level.humans.over, completed: g.level.humans.completed, victoryShown: g.victoryShown };
});
check(win.remaining === 0 && win.over && win.completed && win.victoryShown, 'знищення армії завершує режим перемогою', JSON.stringify(win));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЗОМБІ ПРОТИ ЛЮДЕЙ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
