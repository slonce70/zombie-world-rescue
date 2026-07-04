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

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Гаджет «Ланцюгова блискавка»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'chainlightning');
  const hyper = SHOP_ITEMS.find((i) => i.id === 'chainlightning-hyper');
  const G = GADGETS.chainlightning;
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon, desc: G.desc },
    item: item && { price: item.price, max: item.max, cat: item.cat, gadget: item.gadget },
    hyper: hyper && { price: hyper.price, max: hyper.max, cat: hyper.cat, hyper: hyper.hyper, needsGadget: hyper.needsGadget, desc: hyper.desc },
  };
});
check(meta.gadget && meta.gadget.cd === 35 && meta.gadget.price === 1000 && meta.gadget.icon === '⚡',
  'мета: 35с cd, 1000 монет, ⚡', JSON.stringify(meta.gadget));
check(meta.item && meta.item.price === 1000 && meta.item.max === 1 && meta.item.cat === 'Гаджети й друзі' && meta.item.gadget,
  'продається як гаджет у «Гаджети й друзі» за 1000 монет', JSON.stringify(meta.item));
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.cat === 'Гіперзаряди'
  && meta.hyper.hyper === 'chainlightning' && meta.hyper.needsGadget === 'chainlightning',
  'гіперзаряд блискавки коштує 5000 і потребує базову блискавку', JSON.stringify(meta.hyper));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 999;
  g.save.gadgetsOwned = g.save.gadgetsOwned.filter((id) => id !== 'chainlightning');
  g.save.activeGadget = null;
  g.test.shopBuy('chainlightning');
  const denied = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('chainlightning'), active: g.save.activeGadget };
  g.save.coins = 1000;
  g.test.shopBuy('chainlightning');
  const bought = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('chainlightning'), active: g.save.activeGadget };
  g.save.coins = 1000;
  g.test.shopBuy('chainlightning');
  const second = { coins: g.save.coins, count: g.save.gadgetsOwned.filter((id) => id === 'chainlightning').length };
  return { denied, bought, second };
});
check(buy.denied.coins === 999 && !buy.denied.owned,
  '999 монет недостатньо', JSON.stringify(buy.denied));
check(buy.bought.coins === 0 && buy.bought.owned && buy.bought.active === 'chainlightning',
  '1000 монет купують гаджет і роблять його активним', JSON.stringify(buy.bought));
check(buy.second.coins === 1000 && buy.second.count === 1,
  'повторна покупка не списує монети', JSON.stringify(buy.second));

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 12000;
  g.save.gadgetsOwned = g.save.gadgetsOwned.filter((id) => id !== 'chainlightning');
  g.save.gadgetHypers = (g.save.gadgetHypers || []).filter((id) => id !== 'chainlightning');
  const beforeLocked = g.save.coins;
  g.test.shopBuy('chainlightning-hyper');
  const afterLocked = g.save.coins;
  g.test.unlockGadget('chainlightning');
  g.test.shopBuy('chainlightning-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('chainlightning-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    lockedCost: beforeLocked - afterLocked,
    firstCost: afterLocked - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(hyperBuy.hypers.includes('chainlightning') && hyperBuy.lockedCost === 0
  && hyperBuy.firstCost === 5000 && hyperBuy.secondCost === 0,
  'гіперзаряд купується після базової блискавки один раз', JSON.stringify(hyperBuy));

const effect = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  if (!GADGETS.chainlightning) {
    return { used: false, cd: null, data: Array.from({ length: 6 }, () => ({ hp: 1000, dmg: 0, stun: 0 })) };
  }
  const g = window.__game;
  const p = g.level.player;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('chainlightning');
  g.save.activeGadget = 'chainlightning';
  g.save.gadgetHypers = (g.save.gadgetHypers || []).filter((id) => id !== 'chainlightning');
  g.test.gadgetCdReset();
  g.test.teleport(0, 145);
  const spots = [
    [p.pos.x + 3, p.pos.z],
    [p.pos.x + 6, p.pos.z],
    [p.pos.x + 9, p.pos.z],
    [p.pos.x + 12, p.pos.z],
    [p.pos.x + 15, p.pos.z],
    [p.pos.x + 28, p.pos.z],
  ];
  const zs = spots.map(([x, z]) => g.test.spawnZombie('tank', x, z));
  for (const z of zs) {
    z.hp = z.maxHp = 1000;
    z.stunT = 0;
  }
  const used = g.test.useGadget();
  const data = zs.map((z) => ({
    hp: Math.round(z.hp * 10) / 10,
    dmg: Math.round((1000 - z.hp) * 10) / 10,
    stun: Math.round((z.stunT || 0) * 10) / 10,
  }));
  return { used, cd: g.level.gadgets.cd, data };
});
check(effect.used && effect.cd === 35,
  'гаджет спрацьовує і запускає cooldown 35с', JSON.stringify(effect));
check(effect.data.slice(0, 5).every((z) => z.dmg === 35 && z.stun === 0.3),
  'блискавка бʼє 5 зомбі по ланцюгу: 35 HP і 0.3с збиття', JSON.stringify(effect.data));
check(effect.data[5].dmg === 0 && effect.data[5].stun === 0,
  'шостий зомбі далеко від ланцюга не отримує шкоду', JSON.stringify(effect.data[5]));

const hyperEffect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('chainlightning');
  g.save.activeGadget = 'chainlightning';
  g.save.gadgetHypers = ['chainlightning'];
  g.test.gadgetCdReset();
  g.test.teleport(0, 145);
  const spots = [
    [p.pos.x + 3, p.pos.z],
    [p.pos.x + 6, p.pos.z],
    [p.pos.x + 9, p.pos.z],
    [p.pos.x + 12, p.pos.z],
    [p.pos.x + 15, p.pos.z],
    [p.pos.x + 18, p.pos.z],
    [p.pos.x + 32, p.pos.z],
  ];
  const zs = spots.map(([x, z]) => g.test.spawnZombie('tank', x, z));
  for (const z of zs) {
    z.hp = z.maxHp = 1000;
    z.stunT = 0;
    z.attackLockT = 0;
    z.state = 'chase';
  }
  zs[0].state = 'attack';
  zs[0].attackT = 0.7;
  zs[0].didHit = false;
  const used = g.test.useGadget();
  const data = zs.map((z) => ({
    hp: Math.round(z.hp * 10) / 10,
    dmg: Math.round((1000 - z.hp) * 10) / 10,
    stun: Math.round((z.stunT || 0) * 10) / 10,
    attackLock: Math.round((z.attackLockT || 0) * 10) / 10,
    state: z.state,
  }));
  return { used, cd: g.level.gadgets.cd, data };
});
check(hyperEffect.used && hyperEffect.cd === 35,
  'гіпер-блискавка спрацьовує з тим самим cooldown 35с', JSON.stringify(hyperEffect));
check(hyperEffect.data.slice(0, 6).every((z) => z.dmg === 40 && z.stun === 1 && z.attackLock === 0.9),
  'гіпер-блискавка бʼє 6 зомбі: 40 HP, 1с оглушення і 0.9с збиття атаки', JSON.stringify(hyperEffect.data));
check(hyperEffect.data[0].state === 'chase',
  'гіпер-блискавка скидає зомбі з поточної атаки', JSON.stringify(hyperEffect.data[0]));
check(hyperEffect.data[6].dmg === 0 && hyperEffect.data[6].stun === 0 && hyperEffect.data[6].attackLock === 0,
  'сьомий далекий зомбі не отримує ефект гіперу', JSON.stringify(hyperEffect.data[6]));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЛАНЦЮГОВА БЛИСКАВКА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
