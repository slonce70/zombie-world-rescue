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

await page.goto(`${BASE}/?test&fresh&seed=21`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Оборона в зоні відкривається після 6 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true };
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="zone-defense"]');
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true };
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="zone-defense"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
  };
});
check(menu.beforeExists && menu.beforeLocked, 'до 6 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked, 'після 6 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт режиму: зона, зброя, заборони');
await page.evaluate(() => window.__game.test.startZoneDefense());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.defense?.variant === 'zone', null, { timeout: 30000 });
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
    variant: g.level.defense.variant,
    roomSize: g.level.defense.roomSize,
    radius: g.level.defense.radius,
    timer: g.level.defense.timer,
    alive: g.level.zombies.list.filter((z) => z.state !== 'dead' && z.defense).length,
    weapons: [...g.level.player.weapons],
    cur: g.level.player.cur,
    grenades: g.level.player.grenades,
    noPickups: g.level.noPickups,
    noZombiePickups: g.level.noZombiePickups,
    playerDist: Math.hypot(g.level.player.pos.x - g.level.defense.cx, g.level.player.pos.z - g.level.defense.cz),
    playerY: g.level.player.pos.y,
    floorY: g.level.defense.floorY,
    shopOpen: g.shop.isOpen,
    gadgetUsed,
    beforeGadget,
    afterGadget: g.level.player.gadgetShield,
    buffs: { ...g.level.player.buffs },
  };
});
check(started.roomSize === 30 && started.radius === 15, 'зона має діаметр 30 метрів', JSON.stringify(started));
check(started.playerDist < 0.01 && Math.abs(started.playerY - started.floorY) < 0.01, 'гравця телепортує в центр зони', JSON.stringify(started));
check(started.timer === 125, 'таймер виживання 125 секунд', JSON.stringify(started));
check(started.weapons.length === 2 && started.weapons.includes('staff') && started.weapons.includes('pistol') && started.cur === 'staff' && started.grenades === 0,
  'гравець стартує з посохом і пістолетом без гранат', JSON.stringify(started));
check(started.noPickups && started.noZombiePickups, 'пікапи і дроп із зомбі вимкнені', JSON.stringify(started));
check(!started.shopOpen, 'магазин в Обороні в зоні не відкривається', JSON.stringify(started));
check(started.gadgetUsed === false && started.afterGadget === started.beforeGadget,
  'гаджети в Обороні в зоні не використовуються', JSON.stringify(started));
check(Object.values(started.buffs).every((n) => n === 0), 'бафи в Обороні в зоні не застосовуються', JSON.stringify(started.buffs));

console.log('▸ Спавн з усіх сторін, обмеження зони і перемога по таймеру');
const wave = await page.evaluate(() => {
  const g = window.__game;
  for (const z of g.level.zombies.list) if (z.defense && z.state !== 'dead') z.damage(99999, null, false);
  g.level.defense.spawnT = 0;
  g.level.defense.update(0.1);
  const zombies = g.level.zombies.list.filter((z) => z.defense && z.state !== 'dead');
  const sides = new Set(zombies.map((z) => {
    const dx = z.x - g.level.defense.cx;
    const dz = z.z - g.level.defense.cz;
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N');
  }));
  g.level.player.pos.x = g.level.defense.cx + 99;
  g.level.player.pos.z = g.level.defense.cz + 99;
  g.level.defense.update(0.016);
  const dist = Math.hypot(g.level.player.pos.x - g.level.defense.cx, g.level.player.pos.z - g.level.defense.cz);
  return { alive: zombies.length, sides: [...sides], dist };
});
check(wave.alive >= 4 && wave.sides.length >= 4, 'зомбі приходять мінімум з 4 сторін', JSON.stringify(wave));
check(wave.dist <= 14.25, 'гравця тримає всередині круглої зони', JSON.stringify(wave));

const win = await page.evaluate(() => {
  const g = window.__game;
  document.getElementById('arena-league-place').textContent = 'STALE LEAGUE';
  g.level.defense.timer = 0.05;
  g.level.defense.update(0.1);
  return {
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
    title: document.querySelector('#overlay-arena-end h1').textContent,
    retry: g._lastEndMode,
    league: document.getElementById('arena-league-place').textContent,
  };
});
check(win.shown && win.title.includes('ЗОНУ'), 'перемога показує екран Оборони в зоні', JSON.stringify(win));
check(win.retry === 'zone-defense', 'повтор запускає саме Оборону в зоні', JSON.stringify(win));
check(win.league === '', 'екран режиму не показує старий рейтинг Арени', JSON.stringify(win));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ZONE DEFENSE OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
