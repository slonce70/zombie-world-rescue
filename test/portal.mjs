import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

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
  const categoriesBefore = [...document.querySelectorAll('.solo-category > summary')].map((t) => t.textContent.trim());
  g.save.liberated = nine;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="portal"]');
  const categoriesAfter = [...document.querySelectorAll('.solo-category > summary')].map((t) => t.textContent.trim());
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    name: after && after.querySelector('.sm-name').textContent,
    categoriesBefore,
    categoriesAfter,
  };
});
check(menu.beforeExists && !menu.beforeLocked && menu.categoriesBefore.some((x) => x.includes('5 ХВИЛИН')), 'режим доступний одразу у «5 хвилин»', JSON.stringify(menu));
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
    weapons: [...g.level.player.weapons],
    currentWeapon: g.level.player.cur,
    bazookaReserve: g.level.player.ammo.bazooka.reserve,
    hud: p.getHudList().map((x) => x.title),
    markers: p.getMarkers().length,
  };
});
check(started.portals.length === 3 && started.portals.every((p) => p.hp === 1222 && p.maxHp === 1222 && p.open),
  'стартує 3 відкриті портали по 1222 HP', JSON.stringify(started));
check(started.alivePortalZombies === 6, 'хвиля спавнить по 2 зомбі з кожного відкритого порталу', JSON.stringify(started));
check(started.noShop && started.noPickups && started.noGadgets, 'магазин, пікапи і гаджети вимкнені', JSON.stringify(started));
check(JSON.stringify(started.weapons) === JSON.stringify(['pistol', 'bazooka']) && started.currentWeapon === 'pistol' && started.bazookaReserve > 0,
  'у Порталі тільки пістолет і базука з ракетами', JSON.stringify(started));
check(started.hud.some((x) => x.includes('Закрий портали')) && started.markers >= 3, 'HUD і маркери показують портали', JSON.stringify(started));

const closing = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.portal;
  p.damagePortal(p.portals[0], p.portals[0].maxHp - 1);
  const almost = { hp: p.portals[0].hp, open: p.portals[0].open, over: p.over };
  p.damagePortal(p.portals[0], 1);
  const closedOne = { hp: p.portals[0].hp, open: p.portals[0].open, closed: p.closedCount(), over: p.over };
  for (const portal of p.portals.slice(1)) p.damagePortal(portal, portal.maxHp);
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
await closeTest();
process.exit(failed === 0 ? 0 : 1);
