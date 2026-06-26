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

await page.goto(`${BASE}/?test&fresh&seed=7`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Нокаут відкривається на 20 рівні Зоряного шляху');
const menuLock = await page.evaluate(async () => {
  const g = window.__game;
  const { xpForLevel } = await import('/src/progress.js');
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="knockout"]');
  let xp = 0;
  for (let lvl = 1; lvl < 20; lvl++) xp += xpForLevel(lvl);
  g.test.addXp(xp);
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="knockout"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    passLevel: g.progress.level,
  };
});
check(menuLock.beforeExists && menuLock.beforeLocked, 'до 20 рівня режим у меню заблокований', JSON.stringify(menuLock));
check(menuLock.afterExists && !menuLock.afterLocked && menuLock.passLevel >= 20,
  'на 20 рівні режим у меню доступний', JSON.stringify(menuLock));

console.log('▸ Старт Нокауту: кімната, 10 зомбі, тільки пістолет');
await page.evaluate(() => window.__game.test.startKnockout());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.knockout, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  g.test.unlockGadget('shield');
  const beforeGadget = g.level.player.gadgetShield;
  const gadgetUsed = g.test.useGadget();
  g.test.giveCoins(9999);
  g.shop.open();
  return {
    roomSize: g.level.knockout.roomSize,
    alive: g.level.zombies.list.filter((z) => z.state !== 'dead' && z.knockout).length,
    types: [...new Set(g.level.zombies.list.filter((z) => z.knockout).map((z) => z.type))],
    weapons: [...g.level.player.weapons],
    cur: g.level.player.cur,
    grenades: g.level.player.grenades,
    shopOpen: g.shop.isOpen,
    gadgetUsed,
    beforeGadget,
    afterGadget: g.level.player.gadgetShield,
  };
});
check(started.roomSize === 33, 'кімната має розмір 33x33 метри', JSON.stringify(started));
check(started.alive === 10, 'у кімнаті стартують 10 зомбі', JSON.stringify(started));
check(started.types.length >= 4, 'у Нокауті є різні типи зомбі', JSON.stringify(started.types));
check(started.weapons.length === 1 && started.weapons[0] === 'pistol' && started.cur === 'pistol' && started.grenades === 0,
  'гравець стартує тільки з пістолетом без гранат', JSON.stringify(started));
check(!started.shopOpen, 'магазин у Нокауті не відкривається', JSON.stringify(started));
check(started.gadgetUsed === false && started.afterGadget === started.beforeGadget,
  'гаджети у Нокауті не використовуються', JSON.stringify(started));

const buffs = await page.evaluate(() => {
  const g = window.__game;
  for (const type of ['speed', 'rage', 'bubble', 'magnet']) g.level.effects.onPickup(type);
  return { ...g.level.player.buffs };
});
check(Object.values(buffs).every((n) => n === 0), 'бафи в Нокауті не застосовуються', JSON.stringify(buffs));

console.log('▸ Перемога дає 12% шанс на посох');
const rewardStaff = await page.evaluate(() => {
  const g = window.__game;
  g.test.knockoutForce(0.11);
  g.test.finishKnockout();
  return {
    victoryShown: g.victoryShown,
    hasStaff: g.save.weapons.includes('staff'),
    playerHasStaff: g.level.player.weapons.includes('staff'),
    title: document.querySelector('#overlay-arena-end h1').textContent,
  };
});
check(rewardStaff.victoryShown && rewardStaff.hasStaff && rewardStaff.playerHasStaff,
  'roll 0.11 видає посох у сейв і гравцю', JSON.stringify(rewardStaff));
check(rewardStaff.title.includes('НОКАУТ'), 'екран перемоги підписаний як Нокаут', JSON.stringify(rewardStaff));

console.log('▸ Якщо посох не випав, ящик найчастіше дає кристали');
await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  await g.startKnockout();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.knockout, null, { timeout: 30000 });
const rewardCrystals = await page.evaluate(() => {
  const g = window.__game;
  const crystals0 = g.save.crystals || 0;
  g.test.knockoutForce(0.13);
  g.test.finishKnockout();
  return { crystals0, crystals: g.save.crystals || 0, hasStaff: g.save.weapons.includes('staff') };
});
check(rewardCrystals.crystals - rewardCrystals.crystals0 === 5 && rewardCrystals.hasStaff,
  'roll 0.13 дає +5 кристалів і не забирає вже відкритий посох', JSON.stringify(rewardCrystals));

console.log('▸ Рідкісний залишок ящика дає монети');
await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  await g.startKnockout();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.knockout, null, { timeout: 30000 });
const rewardCoins = await page.evaluate(() => {
  const g = window.__game;
  const coins0 = g.save.coins;
  g.test.knockoutForce(0.99);
  g.test.finishKnockout();
  return { coins0, coins: g.save.coins, hasStaff: g.save.weapons.includes('staff') };
});
check(rewardCoins.coins - rewardCoins.coins0 === 100 && rewardCoins.hasStaff,
  'roll 0.99 дає +100 монет', JSON.stringify(rewardCoins));

const staffMeta = await page.evaluate(async () => {
  const { WEAPONS } = await import('/src/player.js');
  const { WEAPON_IDX } = await import('/src/net/protocol.js');
  return {
    exists: !!WEAPONS.staff,
    mag: WEAPONS.staff && WEAPONS.staff.mag,
    reloadT: WEAPONS.staff && WEAPONS.staff.reloadT,
    inProtocol: WEAPON_IDX.includes('staff'),
  };
});
check(staffMeta.exists && staffMeta.mag === 1 && staffMeta.reloadT === 3 && staffMeta.inProtocol,
  'посох має 1 патрон, 3с перезарядки і є в протоколі коопу', JSON.stringify(staffMeta));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 KNOCKOUT OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
