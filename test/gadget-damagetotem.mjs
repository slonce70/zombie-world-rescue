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

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Гаджет «Тотем шкоди»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'damagetotem');
  return {
    gadget: GADGETS.damagetotem && { cd: GADGETS.damagetotem.cd, icon: GADGETS.damagetotem.icon },
    item: item && { crystalPrice: item.crystalPrice, max: item.max, gadget: item.gadget },
  };
});
check(meta.gadget && meta.gadget.cd === 45 && meta.gadget.icon === '🔥', 'мета: 45с cd, 🔥', JSON.stringify(meta));
check(meta.item && meta.item.crystalPrice === 25 && meta.item.max === 1 && meta.item.gadget,
  'тотем шкоди продається як гаджет за 25 кристалів', JSON.stringify(meta.item));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 50;
  g.save.crystals = 24;
  g.test.shopBuy('damagetotem');
  const denied = { coins: g.save.coins, crystals: g.save.crystals, owned: g.save.gadgetsOwned.includes('damagetotem') };
  g.save.crystals = 25;
  g.test.shopBuy('damagetotem');
  const bought = { coins: g.save.coins, crystals: g.save.crystals, owned: g.save.gadgetsOwned.includes('damagetotem'), active: g.save.activeGadget };
  g.save.crystals = 25;
  g.test.shopBuy('damagetotem');
  return { denied, bought, afterSecond: { coins: g.save.coins, crystals: g.save.crystals } };
});
check(buy.denied.crystals === 24 && !buy.denied.owned, '24 кристалів недостатньо', JSON.stringify(buy.denied));
check(buy.bought.crystals === 0 && buy.bought.coins === 50 && buy.bought.owned && buy.bought.active === 'damagetotem',
  '25 кристалів купують тотем шкоди назавжди і не списують монети', JSON.stringify(buy.bought));
check(buy.afterSecond.crystals === 25 && buy.afterSecond.coins === 50, 'повторна покупка не списує кристали', JSON.stringify(buy.afterSecond));

const effect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('damagetotem');
  g.save.activeGadget = 'damagetotem';
  g.test.gadgetCdReset();
  g.test.teleport(0, 130);
  p.yaw = 0;
  const used = g.test.useGadget();
  const totem = (g.level.gadgets.damageTotems || [])[0];
  if (!totem || typeof g.level.gadgets._updateDamageTotems !== 'function') {
    return { start: { used, count: (g.level.gadgets.damageTotems || []).length, hp: null, cd: g.level.gadgets.cd }, inside: { mult: p.damageTotemMult || 1, dmg: 0 }, outside: { mult: p.damageTotemMult || 1, dmg: 0 }, afterHit: { count: (g.level.gadgets.damageTotems || []).length } };
  }
  const start = { used, count: g.level.gadgets.damageTotems.length, hp: totem.hp, cd: g.level.gadgets.cd };
  const shootTank = (x, z) => {
    for (const zb of g.level.zombies.list) zb.state = 'dead';
    p.pos.x = x;
    p.pos.z = z;
    p.yaw = 0;
    p.cur = 'pistol';
    p.ammo.pistol.mag = 12;
    p.shootCd = 0;
    g.level.gadgets._updateDamageTotems(0.1);
    const target = g.test.spawnZombie('tank', x, z - 10);
    target.hp = target.maxHp = 1000;
    target.aggroed = false;
    g.input.justClicked = true;
    p._updateWeaponFiring(0.1, g.input, true);
    g.input.justClicked = false;
    return { mult: p.damageTotemMult || 1, dmg: 1000 - target.hp };
  };
  const inside = shootTank(totem.x + 2.4, totem.z + 2.4);
  const outside = shootTank(totem.x + 2.6, totem.z);
  const z = g.test.spawnZombie('walker', totem.x + 0.5, totem.z);
  z.aggroed = true;
  z.stats.dmg = 80;
  g.level.gadgets._updateDamageTotems(1);
  return { start, inside, outside, afterHit: { count: g.level.gadgets.damageTotems.length } };
});
check(effect.start.used && effect.start.count === 1 && effect.start.hp === 50, 'тотем шкоди ставиться з 50 HP', JSON.stringify(effect.start));
check(effect.start.cd === 45, 'перезарядка тотема шкоди 45с', JSON.stringify(effect.start));
check(effect.inside.mult === 2 && effect.outside.dmg > 0 && effect.inside.dmg === effect.outside.dmg * 2,
  'в площі 5×5 урон подвоюється', JSON.stringify({ inside: effect.inside, outside: effect.outside }));
check(effect.outside.mult === 1 && effect.outside.dmg > 0, 'поза площою 5×5 урон звичайний', JSON.stringify(effect.outside));
check(effect.afterHit.count === 0, 'зомбі можуть зламати тотем шкоди', JSON.stringify(effect.afterHit));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ТОТЕМ ШКОДИ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
