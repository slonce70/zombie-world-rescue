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

await page.goto(`${BASE}/?test&fresh&seed=14`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Банк відкривається після 7 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const six = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true };
  const seven = { ...six, ITA: true };
  g.save.liberated = six;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="bank"]');
  g.save.liberated = seven;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="bank"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    afterName: after && after.querySelector('.sm-name').textContent,
  };
});
check(menu.beforeExists && menu.beforeLocked, 'до 7 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked && /БАНК/i.test(menu.afterName), 'після 7 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт Банку: кімната 200x50, банк гравця + банк зомбі, посох+пістолет, заборони');
await page.evaluate(() => window.__game.test.startBank());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  g.test.unlockGadget('shield');
  const beforeGadget = g.level.player.gadgetShield;
  const gadgetUsed = g.test.useGadget();
  g.test.giveCoins(9999);
  g.shop.open();
  const p = g.level.player;
  p.health = 50;
  for (const type of ['speed', 'rage', 'bubble', 'magnet', 'medkit', 'ammo', 'grenade']) g.level.effects.onPickup(type);
  return {
    roomW: g.level.bank.roomW,
    roomD: g.level.bank.roomD,
    safes: g.level.bank.safes.map((s) => ({ role: s.role, hp: s.hp, maxHp: s.maxHp })),
    weapons: [...p.weapons],
    cur: p.cur,
    grenades: p.grenades,
    shopOpen: g.shop.isOpen,
    gadgetUsed,
    beforeGadget,
    afterGadget: p.gadgetShield,
    buffs: { ...p.buffs },
    playerHp: p.health,
    noGadgets: g.level.noGadgets,
    noShop: g.level.noShop,
    noBuffs: g.level.noBuffs,
    noPickups: g.level.noPickups,
    noZombiePickups: g.level.noZombiePickups,
    noCoinDrops: g.level.noCoinDrops,
  };
});
check(started.roomW === 200 && started.roomD === 50, 'кімната має розмір 200x50 метрів', JSON.stringify(started));
check(started.safes.length === 2 && started.safes.some((s) => s.role === 'player') && started.safes.some((s) => s.role === 'zombie')
  && started.safes.every((s) => s.hp === 500 && s.maxHp === 500), 'є банк гравця і банк зомбі по 500 HP', JSON.stringify(started));
check(started.weapons.length === 2 && started.weapons.includes('staff') && started.weapons.includes('pistol') && started.cur === 'staff' && started.grenades === 0,
  'гравець стартує з посохом і пістолетом без гранат', JSON.stringify(started));
check(!started.shopOpen && !started.gadgetUsed && started.afterGadget === started.beforeGadget,
  'магазин і гаджети вимкнені', JSON.stringify(started));
check(started.noGadgets && started.noShop && started.noBuffs && started.noPickups && started.noZombiePickups && started.noCoinDrops
  && Object.values(started.buffs).every((n) => n === 0) && started.playerHp === 50,
  'бафи, пікапи і дроп вимкнені', JSON.stringify(started));

console.log('▸ Хвиля Банку, атака банку гравця і перемога від знищення банку зомбі');
const waveAndWin = await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.bank;
  b.spawnT = 0;
  b.update(0.01);
  const alive = g.level.zombies.list.filter((z) => z.bank && z.state !== 'dead').length;
  const target = b.zombieBank;
  const protectedBank = b.playerBank;
  b.damageSafe(protectedBank, 25, false);
  b.damageSafe(target, 500);
  return {
    alive,
    playerBankHp: protectedBank.hp,
    zombieBankHp: target.hp,
    completed: b.completed,
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
    title: document.querySelector('#overlay-arena-end h1').textContent,
  };
});
check(waveAndWin.alive === 5, 'кожна хвиля спавнить 5 зомбі біля банку зомбі', JSON.stringify(waveAndWin));
check(waveAndWin.playerBankHp === 475, 'зомбі можуть пошкодити банк гравця', JSON.stringify(waveAndWin));
check(waveAndWin.completed && waveAndWin.shown && /БАНК/i.test(waveAndWin.title), 'знищення банку зомбі завершує режим перемогою', JSON.stringify(waveAndWin));

await page.evaluate(() => window.__game.startBank());
await page.waitForFunction(() => window.__game.level && window.__game.level.bank
  && !window.__game.level.bank.over && window.__game.level.bank.playerBank.hp === 500, null, { timeout: 30000 });
const loss = await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.bank;
  b.damageSafe(b.playerBank, 500, false);
  return {
    completed: b.completed,
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
    title: document.querySelector('#overlay-arena-end h1').textContent,
  };
});
check(!loss.completed && loss.shown && /ВТРАЧЕНО/i.test(loss.title), 'знищення банку гравця завершує режим поразкою', JSON.stringify(loss));

check(errors.length === 0, 'без JS-помилок консолі', errors.join('\n'));
await browser.close();
closeServer();
console.log('');
console.log(failed === 0 ? '🎉 БАНК ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
