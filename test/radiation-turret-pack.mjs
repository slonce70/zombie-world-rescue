import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Радіаційний набір турелі');
const meta = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'radiationturretpack');
  return item && {
    id: item.id,
    cat: item.cat,
    crystalPrice: item.crystalPrice,
    radiationPrice: item.radiationPrice,
    max: item.max,
  };
});
check(meta && meta.cat === 'Радіація' && meta.crystalPrice === 50 && meta.radiationPrice === 50 && meta.max === 1,
  'у Радіації є набір турелі за 50 кристалів і 50 монет радіації', JSON.stringify(meta));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.crystals = 50;
  g.save.radiationCoins = 49;
  g.save.upgrades.radiationturretpack = 0;
  g.test.shopBuy('radiationturretpack');
  const denied = {
    crystals: g.save.crystals,
    radiationCoins: g.save.radiationCoins,
    bought: !!g.save.upgrades.radiationturretpack,
  };
  g.save.radiationCoins = 50;
  g.test.shopBuy('radiationturretpack');
  const bought = {
    crystals: g.save.crystals,
    radiationCoins: g.save.radiationCoins,
    bought: !!g.save.upgrades.radiationturretpack,
  };
  return { denied, bought };
});
check(buy.denied.crystals === 50 && buy.denied.radiationCoins === 49 && !buy.denied.bought
  && buy.bought.crystals === 0 && buy.bought.radiationCoins === 0 && buy.bought.bought,
  'набір списує обидві валюти тільки коли вистачає обох', JSON.stringify(buy));

const turret = await page.evaluate(() => {
  const g = window.__game;
  for (const zb of g.level.zombies.list) zb.state = 'dead';
  g.save.gadgetHypers = [];
  g.save.upgrades.radiationturretpack = 0;
  g.save.activeGadget = 'turret';
  g.test.unlockGadget('turret');
  g.test.gadgetCdReset();
  g.test.useGadget();
  const baseT = g.level.gadgets.turrets[0];
  const baseZ = g.test.spawnZombie('tank', baseT.x + 6, baseT.z);
  baseZ.hp = baseZ.maxHp = 1000;
  baseT.fireT = 0;
  g.level.gadgets.update(0.05, g.input, true);
  const base = { dmg: 1000 - baseZ.hp, radiation: !!baseT.radiation };

  while (g.level.gadgets.turrets.length) g.level.gadgets._removeTurret(0, false);
  for (const zb of g.level.zombies.list) zb.state = 'dead';
  g.save.upgrades.radiationturretpack = 1;
  g.test.gadgetCdReset();
  g.test.useGadget();
  const radT = g.level.gadgets.turrets[0];
  const radZ = g.test.spawnZombie('tank', radT.x + 6, radT.z);
  radZ.hp = radZ.maxHp = 1000;
  radT.fireT = 0;
  g.level.gadgets.update(0.05, g.input, true);
  return { base, radiation: { dmg: 1000 - radZ.hp, flag: !!radT.radiation } };
});
check(turret.base.dmg === 14 && !turret.base.radiation && turret.radiation.dmg === 19 && turret.radiation.flag,
  'радіаційна турель має скін і наносить +5 HP за постріл', JSON.stringify(turret));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РАДІАЦІЙНИЙ НАБІР ТУРЕЛІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
