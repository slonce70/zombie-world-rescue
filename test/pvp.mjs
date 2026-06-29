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

await page.goto(`${BASE}/?test&fresh&seed=10`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ ПВП відкривається після 10 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const ten = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true };
  g.save.liberated = {};
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="pvp"]');
  g.save.liberated = ten;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="pvp"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
  };
});
check(menu.beforeExists && menu.beforeLocked, 'до 10 країн режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked, 'після 10 країн режим доступний', JSON.stringify(menu));

console.log('▸ Старт ПВП: кімната, один зомбі, посох, 50 HP, заборони');
await page.evaluate(() => window.__game.test.startPvp());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.pvp, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  g.test.unlockGadget('shield');
  const beforeGadget = g.level.player.gadgetShield;
  const gadgetUsed = g.test.useGadget();
  g.test.giveCoins(9999);
  g.shop.open();
  const p = g.level.player;
  p.health = 25;
  for (const type of ['speed', 'rage', 'bubble', 'magnet', 'medkit', 'ammo']) g.level.effects.onPickup(type);
  const z = g.level.zombies.list.find((x) => x.pvp);
  return {
    roomSize: g.level.pvp.roomSize,
    alive: g.level.zombies.list.filter((x) => x.state !== 'dead' && x.pvp).length,
    zombieHp: z && z.hp,
    zombieMaxHp: z && z.maxHp,
    zombieDmg: z && z.stats.dmg,
    playerMaxHp: p.maxHealth,
    playerHp: p.health,
    damageMult: p.damageMult,
    pet: !!g.level.pet,
    weapons: [...p.weapons],
    cur: p.cur,
    grenades: p.grenades,
    shopOpen: g.shop.isOpen,
    gadgetUsed,
    beforeGadget,
    afterGadget: p.gadgetShield,
    buffs: { ...p.buffs },
    staffMag: p.ammo.staff && p.ammo.staff.mag,
  };
});
check(started.roomSize === 30, 'кімната має розмір 30x30 метрів', JSON.stringify(started));
check(started.alive === 1 && started.zombieHp === 250 && started.zombieMaxHp === 250 && started.zombieDmg === 10,
  'у кімнаті 1 зомбі з 250 HP і 10 шкоди', JSON.stringify(started));
check(started.playerMaxHp === 50 && started.playerHp === 25, 'HP гравця обмежено 50, аптечка не лікує', JSON.stringify(started));
check(started.damageMult === 1 && started.pet === false, 'ПВП без pet і без бонусу шкоди з прокачок', JSON.stringify(started));
check(started.weapons.length === 1 && started.weapons[0] === 'staff' && started.cur === 'staff' && started.staffMag === 1 && started.grenades === 0,
  'гравець стартує тільки з посохом', JSON.stringify(started));
check(!started.shopOpen, 'магазин у ПВП не відкривається', JSON.stringify(started));
check(started.gadgetUsed === false && started.afterGadget === started.beforeGadget,
  'гаджети у ПВП не використовуються', JSON.stringify(started));
check(Object.values(started.buffs).every((n) => n === 0), 'бафи у ПВП не застосовуються', JSON.stringify(started.buffs));

console.log('▸ Перемога дає 100 монет або 3 кристали');
const rewardCoins = await page.evaluate(() => {
  const g = window.__game;
  g.test.pvpForce(0.2);
  const coins0 = g.save.coins;
  const crystals0 = g.save.crystals || 0;
  g.test.finishPvp();
  return {
    coins0,
    coins: g.save.coins,
    crystals0,
    crystals: g.save.crystals || 0,
    title: document.querySelector('#overlay-arena-end h1').textContent,
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
    coinEffects: g.level.effects.coins.length,
  };
});
check(rewardCoins.shown && rewardCoins.title.includes('ПВП') && rewardCoins.coins === rewardCoins.coins0 + 100 && rewardCoins.crystals === rewardCoins.crystals0,
  'перемога може дати 100 монет', JSON.stringify(rewardCoins));
check(rewardCoins.coinEffects === 0, 'зомбі в ПВП не сипле додаткові монети/пікапи', JSON.stringify(rewardCoins));

await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  await g.test.startPvp();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.pvp, null, { timeout: 30000 });
const rewardCrystals = await page.evaluate(() => {
  const g = window.__game;
  g.test.pvpForce(0.8);
  const coins0 = g.save.coins;
  const crystals0 = g.save.crystals || 0;
  g.test.finishPvp();
  return { coins0, coins: g.save.coins, crystals0, crystals: g.save.crystals || 0 };
});
check(rewardCrystals.coins === rewardCrystals.coins0 && rewardCrystals.crystals === rewardCrystals.crystals0 + 3,
  'перемога може дати 3 кристали', JSON.stringify(rewardCrystals));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 PVP OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
