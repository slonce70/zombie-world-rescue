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
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Гаджет «Магніт душ»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'soulmagnet');
  const hyper = SHOP_ITEMS.find((i) => i.id === 'soulmagnet-hyper');
  return {
    gadget: GADGETS.soulmagnet && { cd: GADGETS.soulmagnet.cd, icon: GADGETS.soulmagnet.icon, price: GADGETS.soulmagnet.price },
    item: item && { price: item.price, max: item.max, gadget: item.gadget },
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget },
  };
});
check(meta.gadget && meta.gadget.cd === 45 && meta.gadget.icon === '🧲' && meta.gadget.price === 1000,
  'мета: 45с cd, 🧲, 1000 монет', JSON.stringify(meta));
check(meta.item && meta.item.price === 1000 && meta.item.max === 1 && meta.item.gadget,
  'магніт продається як гаджет за 1000 монет', JSON.stringify(meta.item));
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.hyper === 'soulmagnet' && meta.hyper.needsGadget === 'soulmagnet',
  'гіперзаряд магніту коштує 5000 і потребує базовий магніт', JSON.stringify(meta.hyper));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 999;
  g.test.shopBuy('soulmagnet');
  const denied = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('soulmagnet') };
  g.save.coins = 1000;
  g.test.shopBuy('soulmagnet');
  const bought = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('soulmagnet'), active: g.save.activeGadget };
  g.save.coins = 1000;
  g.test.shopBuy('soulmagnet');
  return { denied, bought, afterSecond: { coins: g.save.coins } };
});
check(buy.denied.coins === 999 && !buy.denied.owned, '999 монет недостатньо', JSON.stringify(buy.denied));
check(buy.bought.coins === 0 && buy.bought.owned && buy.bought.active === 'soulmagnet',
  '1000 монет купують магніт назавжди і роблять активним', JSON.stringify(buy.bought));
check(buy.afterSecond.coins === 1000, 'повторна покупка не списує монети', JSON.stringify(buy.afterSecond));

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(12000);
  const before = g.save.coins;
  g.test.shopBuy('soulmagnet-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('soulmagnet-hyper');
  return {
    hypers: g.save.gadgetHypers || [],
    firstCost: before - afterFirst,
    secondCost: afterFirst - g.save.coins,
  };
});
check(hyperBuy.hypers.includes('soulmagnet') && hyperBuy.firstCost === 5000 && hyperBuy.secondCost === 0,
  'гіперзаряд магніту купується один раз і зберігається', JSON.stringify(hyperBuy));

const effect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('soulmagnet');
  g.save.activeGadget = 'soulmagnet';
  g.test.gadgetCdReset();
  g.test.teleport(0, 130);
  for (const z of g.level.zombies.list) z.state = 'dead';
  const near = g.test.spawnZombie('tank', p.pos.x + 12, p.pos.z);
  const edge = g.test.spawnZombie('tank', p.pos.x - 17, p.pos.z);
  const far = g.test.spawnZombie('tank', p.pos.x + 24, p.pos.z);
  for (const z of [near, edge, far]) { z.aggroed = false; z.hp = z.maxHp = 1000; }
  const d0 = [near, edge, far].map((z) => Math.hypot(z.x - p.pos.x, z.z - p.pos.z));
  const used = g.test.useGadget();
  const center = (g.level.gadgets.soulMagnets || [])[0];
  for (let i = 0; i < 10; i++) g.level.gadgets._updateSoulMagnets(0.1);
  const d1 = [near, edge, far].map((z) => Math.hypot(z.x - center.x, z.z - center.z));
  return {
    used,
    count: (g.level.gadgets.soulMagnets || []).length,
    cd: g.level.gadgets.cd,
    life: center && Math.round(center.life * 10) / 10,
    d0: d0.map((n) => Math.round(n * 10) / 10),
    d1: d1.map((n) => Math.round(n * 10) / 10),
    aggroed: [near.aggroed, edge.aggroed, far.aggroed],
  };
});
check(effect.used && effect.count === 1 && effect.cd === 45 && effect.life === 3,
  'магніт активується на 4с і ставить 45с перезарядки', JSON.stringify(effect));
check(effect.d1[0] < effect.d0[0] && effect.d1[1] < effect.d0[1],
  'зомбі в радіусі 18м притягуються до центру', JSON.stringify({ d0: effect.d0, d1: effect.d1 }));
check(effect.d1[2] === effect.d0[2] && !effect.aggroed[2],
  'зомбі поза 18м не чіпається', JSON.stringify({ d0: effect.d0, d1: effect.d1, aggroed: effect.aggroed }));

const hyperEffect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.gadgets.soulMagnets = [];
  g.test.unlockGadget('soulmagnet');
  g.save.gadgetHypers = ['soulmagnet'];
  g.save.activeGadget = 'soulmagnet';
  g.test.gadgetCdReset();
  g.test.teleport(20, 130);
  for (const z of g.level.zombies.list) z.state = 'dead';
  p.maxHealth = 100;
  p.health = 50;
  const near = g.test.spawnZombie('tank', p.pos.x + 12, p.pos.z);
  near.hp = near.maxHp = 1000;
  near.aggroed = false;
  const used = g.test.useGadget();
  for (let i = 0; i < 42; i++) g.level.gadgets._updateSoulMagnets(0.1);
  return { used, hp: p.health, magnets: g.level.gadgets.soulMagnets.length, nearD: Math.round(Math.hypot(near.x - p.pos.x, near.z - p.pos.z) * 10) / 10 };
});
check(hyperEffect.used && hyperEffect.magnets === 0 && hyperEffect.hp === 90,
  'гіпер-магніт після завершення притягування лікує гравця на 40 HP', JSON.stringify(hyperEffect));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 МАГНІТ ДУШ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
