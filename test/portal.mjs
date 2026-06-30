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

await page.goto(`${BASE}/?test&fresh&seed=22`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Портал відкривається після 9 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const eight = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
  const nine = { ...eight, EGY: true };
  g.save.liberated = eight;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="portal"]');
  const tabsBefore = [...document.querySelectorAll('.solo-tab')].map((t) => t.textContent.trim());
  g.save.liberated = nine;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="portal"]');
  const tabsAfter = [...document.querySelectorAll('.solo-tab')].map((t) => t.textContent.trim());
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    name: after && after.querySelector('.sm-name').textContent,
    tabsBefore,
    tabsAfter,
  };
});
check(menu.beforeExists && menu.beforeLocked && menu.tabsBefore.includes('ПОРТАЛ'), 'до 9 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked && /ПОРТАЛ/i.test(menu.name), 'після 9 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт Порталу: 3 портали, хвилі зомбі, перемога після закриття всіх');
await page.evaluate(() => window.__game.test.startPortal());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.portal, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.portal;
  p.spawnT = 0;
  p.update(0.1);
  return {
    portals: p.portals.map((x) => ({ hp: x.hp, maxHp: x.maxHp, open: x.open })),
    alivePortalZombies: g.level.zombies.list.filter((z) => z.portal && z.state !== 'dead').length,
    noShop: g.level.noShop,
    noPickups: g.level.noPickups,
    noGadgets: g.level.noGadgets,
    hud: p.getHudList().map((x) => x.title),
    markers: p.getMarkers().length,
  };
});
check(started.portals.length === 3 && started.portals.every((p) => p.hp === 300 && p.maxHp === 300 && p.open),
  'стартує 3 відкриті портали по 300 HP', JSON.stringify(started));
check(started.alivePortalZombies === 6, 'хвиля спавнить по 2 зомбі з кожного відкритого порталу', JSON.stringify(started));
check(started.noShop && started.noPickups && !started.noGadgets, 'магазин і пікапи вимкнені, гаджети дозволені', JSON.stringify(started));
check(started.hud.some((x) => x.includes('Закрий портали')) && started.markers >= 3, 'HUD і маркери показують портали', JSON.stringify(started));

const closing = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.portal;
  p.damagePortal(p.portals[0], 299);
  const almost = { hp: p.portals[0].hp, open: p.portals[0].open, over: p.over };
  p.damagePortal(p.portals[0], 1);
  const closedOne = { hp: p.portals[0].hp, open: p.portals[0].open, closed: p.closedCount(), over: p.over };
  for (const portal of p.portals.slice(1)) p.damagePortal(portal, 999);
  return {
    almost,
    closedOne,
    final: { closed: p.closedCount(), over: p.over, completed: p.completed, victoryShown: g.victoryShown },
  };
});
check(closing.almost.hp === 1 && closing.almost.open && !closing.almost.over, 'портал не закривається до 0 HP', JSON.stringify(closing.almost));
check(closing.closedOne.hp === 0 && !closing.closedOne.open && closing.closedOne.closed === 1 && !closing.closedOne.over,
  'один портал закривається на 0 HP', JSON.stringify(closing.closedOne));
check(closing.final.closed === 3 && closing.final.over && closing.final.completed && closing.final.victoryShown,
  'закриття трьох порталів завершує режим перемогою', JSON.stringify(closing.final));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ПОРТАЛ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
