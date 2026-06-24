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

console.log('▸ Гаджет «Невидимка»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'invisibility');
  return {
    gadget: GADGETS.invisibility && { cd: GADGETS.invisibility.cd, icon: GADGETS.invisibility.icon },
    item: item && { crystalPrice: item.crystalPrice, max: item.max, gadget: item.gadget },
  };
});
check(meta.gadget && meta.gadget.cd === 45 && meta.gadget.icon === '👻', 'мета: 45с cd, 👻', JSON.stringify(meta));
check(meta.item && meta.item.crystalPrice === 5 && meta.item.max === 1 && meta.item.gadget,
  'невидимка продається як гаджет за 5 кристалів', JSON.stringify(meta.item));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 50;
  g.save.crystals = 4;
  g.test.shopBuy('invisibility');
  const denied = { coins: g.save.coins, crystals: g.save.crystals, owned: g.save.gadgetsOwned.includes('invisibility') };
  g.save.crystals = 5;
  g.test.shopBuy('invisibility');
  const bought = { coins: g.save.coins, crystals: g.save.crystals, owned: g.save.gadgetsOwned.includes('invisibility'), active: g.save.activeGadget };
  g.save.crystals = 5;
  g.test.shopBuy('invisibility');
  return { denied, bought, afterSecond: { coins: g.save.coins, crystals: g.save.crystals } };
});
check(buy.denied.crystals === 4 && !buy.denied.owned, '4 кристалів недостатньо', JSON.stringify(buy.denied));
check(buy.bought.crystals === 0 && buy.bought.coins === 50 && buy.bought.owned && buy.bought.active === 'invisibility',
  '5 кристалів купують невидимку назавжди і не списують монети', JSON.stringify(buy.bought));
check(buy.afterSecond.crystals === 5 && buy.afterSecond.coins === 50, 'повторна покупка не списує кристали', JSON.stringify(buy.afterSecond));

const effect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('invisibility');
  g.save.activeGadget = 'invisibility';
  g.test.gadgetCdReset();
  g.test.teleport(0, 130);
  p.firstPerson = false;
  p._applyView();
  p.health = 100;
  p.respawnProtect = 0;
  p.buffs.bubble = 0;
  p.gadgetShield = 0;
  p.armor = 0;
  for (const z of g.level.zombies.list) z.state = 'dead';
  const used = g.test.useGadget();
  const start = { used, invisibleT: Math.round((p.invisibleT || 0) * 10) / 10, cd: g.level.gadgets.cd, visible: p.rig.group.visible };
  const z = g.test.spawnZombie('walker', p.pos.x + 1.0, p.pos.z);
  z.state = 'wander';
  z.aggroed = false;
  z.sleeping = false;
  for (let i = 0; i < 6; i++) g.level.zombies.update(0.2);
  const hidden = { aggroed: z.aggroed, state: z.state, hp: p.health, invisibleT: Math.round((p.invisibleT || 0) * 10) / 10, visible: p.rig.group.visible };
  p._updateBuffTimers(5.1);
  g.level.zombies.update(0.2);
  const expired = { aggroed: z.aggroed, state: z.state, hp: p.health, invisibleT: Math.round((p.invisibleT || 0) * 10) / 10, visible: p.rig.group.visible };
  return { start, hidden, expired };
});
check(effect.start.used && effect.start.invisibleT === 5 && effect.start.cd === 45, 'невидимка вмикається на 5с і ставить 45с перезарядку', JSON.stringify(effect.start));
check(effect.start.visible === false, 'модель гравця ховається одразу', JSON.stringify(effect.start));
check(!effect.hidden.aggroed && effect.hidden.hp === 100 && effect.hidden.visible === false,
  'зомбі не бачать і не бʼють невидимого гравця', JSON.stringify(effect.hidden));
check(effect.expired.invisibleT === 0 && effect.expired.visible === true,
  'через 5с гравець знову видимий', JSON.stringify(effect.expired));
check(effect.expired.aggroed || effect.expired.state === 'chase' || effect.expired.state === 'attack',
  'після завершення невидимості зомбі знову бачить гравця', JSON.stringify(effect.expired));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 НЕВИДИМКА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
