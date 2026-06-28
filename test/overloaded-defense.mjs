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

await page.goto(`${BASE}/?test&fresh&seed=12`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Перегружена оборона відкривається після 8 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const seven = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true };
  const eight = { ...seven, TUR: true };
  g.save.liberated = seven;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="overloaded-defense"]');
  g.save.liberated = eight;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="overloaded-defense"]');
  const normal = document.querySelector('.solo-mode[data-mode="defense"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    afterName: after && after.querySelector('.sm-name').textContent,
    normalExists: !!normal,
    normalLockedAt8: normal && normal.classList.contains('locked'),
  };
});
check(menu.beforeExists && menu.beforeLocked, 'до 8 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked && /Перегружена оборона/.test(menu.afterName),
  'після 8 країн є окрема картка Перегружена оборона', JSON.stringify(menu));
check(menu.normalExists && !menu.normalLockedAt8, 'звичайна Оборона лишається окремою', JSON.stringify(menu));

console.log('▸ Старт Перегруженої оборони: 500 HP вежі, 250 HP гравця, 3 хвилі');
await page.evaluate(() => window.__game.test.startOverloadedDefense());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.defense, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('shield');
  const beforeGadget = p.gadgetShield;
  const gadgetUsed = g.test.useGadget();
  g.test.giveCoins(9999);
  g.shop.open();
  const initialHp = p.health;
  p.health = 100;
  for (const type of ['speed', 'rage', 'bubble', 'magnet', 'medkit', 'ammo']) g.level.effects.onPickup(type);
  const live = g.level.zombies.list.filter((z) => z.defense && z.state !== 'dead');
  return {
    variant: g.level.defense.variant,
    roomSize: g.level.defense.roomSize,
    wave: g.level.defense.wave,
    waveTotal: g.level.defense.waveTotal,
    target: g.level.defense.target,
    towerHp: g.level.defense.towerHp,
    towerMaxHp: g.level.defense.towerMaxHp,
    playerMaxHp: p.maxHealth,
    initialHp,
    playerHpAfterPickups: p.health,
    weapons: [...p.weapons],
    cur: p.cur,
    alive: live.length,
    zombieHpOk: live.every((z) => z.hp === 234 && z.maxHp === 234),
    zombieDmgOk: live.every((z) => z.stats.dmg === 25 && (!z.ranged || z.ranged.dmg === 25)),
    shopOpen: g.shop.isOpen,
    gadgetUsed,
    beforeGadget,
    afterGadget: p.gadgetShield,
    buffs: { ...p.buffs },
    noGadgets: g.level.noGadgets,
    noShop: g.level.noShop,
    noBuffs: g.level.noBuffs,
    noPickups: g.level.noPickups,
    noZombiePickups: g.level.noZombiePickups,
    noCoinDrops: g.level.noCoinDrops,
  };
});
check(started.variant === 'overloaded' && started.roomSize === 120, 'режим стартує як перегружена оборона 120x120', JSON.stringify(started));
check(started.towerHp === 500 && started.towerMaxHp === 500, 'вежа має 500 HP', JSON.stringify(started));
check(started.playerMaxHp === 250 && started.initialHp === 250 && started.playerHpAfterPickups === 100,
  'гравець має 250 HP, пікапи не лікують і не дають набої', JSON.stringify(started));
check(started.wave === 1 && started.waveTotal === 3 && started.target === 20 && started.alive === 7,
  'перша з трьох хвиль стартує 7 зомбі з 20 загалом', JSON.stringify(started));
check(started.zombieHpOk && started.zombieDmgOk, 'усі зомбі хвилі мають 234 HP і 25 шкоди', JSON.stringify(started));
check(started.weapons.length === 2 && started.weapons.includes('pistol') && started.weapons.includes('rifle') && started.cur === 'rifle',
  'гравець стартує з пістолетом і автоматом', JSON.stringify(started));
check(!started.shopOpen && !started.gadgetUsed && started.afterGadget === started.beforeGadget,
  'магазин і гаджети вимкнені', JSON.stringify(started));
check(started.noGadgets && started.noShop && started.noBuffs && started.noPickups && started.noZombiePickups
  && started.noCoinDrops
  && Object.values(started.buffs).every((n) => n === 0),
  'бафи, пікапи і дроп із зомбі вимкнені', JSON.stringify(started));

console.log('▸ Хвилі і шкода по вежі');
const towerDamage = await page.evaluate(() => {
  const g = window.__game;
  const live = g.level.zombies.list.filter((z) => z.defense && z.state !== 'dead');
  for (const z of live.slice(1)) z.damage(99999, null, false);
  const z = live[0];
  z.x = g.level.defense.cx + 1;
  z.z = g.level.defense.cz + 1;
  const before = g.level.defense.towerHp;
  g.level.defense.update(1);
  return { before, after: g.level.defense.towerHp, damage: +(before - g.level.defense.towerHp).toFixed(1) };
});
check(towerDamage.damage >= 24.5 && towerDamage.damage <= 25.5,
  'один зомбі біля вежі знімає 25 HP за секунду', JSON.stringify(towerDamage));

const waves = await page.evaluate(() => {
  const g = window.__game;
  const clearWave = () => {
    for (const z of [...g.level.zombies.list]) if (z.defense && z.state !== 'dead') z.damage(99999, null, false);
    g.level.defense.update(0.1);
    return {
      wave: g.level.defense.wave,
      alive: g.level.zombies.list.filter((z) => z.defense && z.state !== 'dead').length,
      over: g.level.defense.over,
    };
  };
  const after1 = clearWave();
  const after2 = clearWave();
  const after3 = clearWave();
  return {
    after1,
    after2,
    after3,
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
    title: document.querySelector('#overlay-arena-end h1').textContent,
  };
});
check(waves.after1.wave === 2 && waves.after1.alive === 7 && !waves.after1.over,
  'після першої зачистки стартує друга хвиля', JSON.stringify(waves));
check(waves.after2.wave === 3 && waves.after2.alive === 6 && !waves.after2.over,
  'після другої зачистки стартує третя хвиля', JSON.stringify(waves));
check(waves.after3.over && waves.shown && waves.title.includes('ОБОРОНА'),
  'після третьої хвилі показується перемога Оборони', JSON.stringify(waves));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 OVERLOADED DEFENSE OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
