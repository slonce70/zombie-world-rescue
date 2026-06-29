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

await page.goto(`${BASE}/?test&fresh&seed=8`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Оборона відкривається після 8 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = {};
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="defense"]');
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="defense"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
  };
});
check(menu.beforeExists && menu.beforeLocked, 'до 8 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked, 'після 8 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт Оборони: кімната, вежа, зброя, заборони');
await page.evaluate(() => window.__game.test.startDefense());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.defense, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  g.test.unlockGadget('shield');
  const beforeGadget = g.level.player.gadgetShield;
  const gadgetUsed = g.test.useGadget();
  g.test.giveCoins(9999);
  g.shop.open();
  for (const type of ['speed', 'rage', 'bubble', 'magnet']) g.level.effects.onPickup(type);
  return {
    roomSize: g.level.defense.roomSize,
    towerHp: g.level.defense.towerHp,
    towerMaxHp: g.level.defense.towerMaxHp,
    alive: g.level.zombies.list.filter((z) => z.state !== 'dead' && z.defense).length,
    weapons: [...g.level.player.weapons],
    cur: g.level.player.cur,
    grenades: g.level.player.grenades,
    shopOpen: g.shop.isOpen,
    gadgetUsed,
    beforeGadget,
    afterGadget: g.level.player.gadgetShield,
    buffs: { ...g.level.player.buffs },
  };
});
check(started.roomSize === 120, 'кімната має розмір 120x120 метрів', JSON.stringify(started));
check(started.towerHp === 250 && started.towerMaxHp === 250, 'вежа має 250 HP', JSON.stringify(started));
check(started.alive === 20, 'стартує 20 зомбі для оборони', JSON.stringify(started));
check(started.weapons.length === 2 && started.weapons.includes('pistol') && started.weapons.includes('rifle') && started.cur === 'rifle' && started.grenades === 0,
  'гравець стартує з пістолетом і автоматом без гранат', JSON.stringify(started));
check(!started.shopOpen, 'магазин в Обороні не відкривається', JSON.stringify(started));
check(started.gadgetUsed === false && started.afterGadget === started.beforeGadget,
  'гаджети в Обороні не використовуються', JSON.stringify(started));
check(Object.values(started.buffs).every((n) => n === 0), 'бафи в Обороні не застосовуються', JSON.stringify(started.buffs));

console.log('▸ Зомбі бʼють вежу, перемога після зачистки');
const towerDamage = await page.evaluate(() => {
  const g = window.__game;
  const z = g.level.zombies.list.find((x) => x.defense && x.state !== 'dead');
  z.x = g.level.defense.cx + 1;
  z.z = g.level.defense.cz + 1;
  const before = g.level.defense.towerHp;
  for (let i = 0; i < 20; i++) g.level.defense.update(0.2);
  return { before, after: g.level.defense.towerHp };
});
check(towerDamage.after < towerDamage.before, 'зомбі біля центру пошкоджує вежу', JSON.stringify(towerDamage));

const win = await page.evaluate(() => {
  const g = window.__game;
  document.getElementById('arena-league-place').textContent = 'STALE LEAGUE';
  for (let i = 0; i < 3; i++) {
    for (const z of [...g.level.zombies.list]) if (z.defense && z.state !== 'dead') z.damage(99999, null, false);
  }
  g.level.defense.update(0.1);
  return {
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
    title: document.querySelector('#overlay-arena-end h1').textContent,
    remaining: g.level.defense.remaining(),
    league: document.getElementById('arena-league-place').textContent,
  };
});
check(win.shown && win.title.includes('ОБОРОНА'), 'перемога показує екран Оборони', JSON.stringify(win));
check(win.league === '', 'екран Оборони не показує старий рейтинг Арени', JSON.stringify(win));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 DEFENSE OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
