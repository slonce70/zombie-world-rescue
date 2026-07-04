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

console.log('▸ Гаджет «Отруйна калюжа»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'poisonpuddle');
  const hyper = SHOP_ITEMS.find((i) => i.id === 'poisonpuddle-hyper');
  const G = GADGETS.poisonpuddle;
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon, desc: G.desc },
    item: item && { cat: item.cat, price: item.price, radiationPrice: item.radiationPrice, max: item.max, gadget: item.gadget },
    hyper: hyper && { cat: hyper.cat, price: hyper.price, crystalPrice: hyper.crystalPrice, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget },
  };
});
check(meta.gadget && meta.gadget.cd === 30 && meta.gadget.price === 0 && meta.gadget.icon === '☣️',
  'мета: 30с cd, без звичайних монет, ☣️', JSON.stringify(meta.gadget));
check(meta.item && meta.item.cat === 'Радіація' && meta.item.price === 0 && meta.item.radiationPrice === 300 && meta.item.max === 1 && meta.item.gadget,
  'продається у Радіації за 300 монет радіації', JSON.stringify(meta.item));
check(meta.hyper && meta.hyper.cat === 'Радіація' && meta.hyper.price === 5000 && meta.hyper.crystalPrice === 5
  && meta.hyper.max === 1 && meta.hyper.hyper === 'poisonpuddle' && meta.hyper.needsGadget === 'poisonpuddle',
  'гіперзаряд калюжі продається в Радіації за 5000 монет і 5 кристалів', JSON.stringify(meta.hyper));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.radiationCoins = 299;
  g.save.gadgetsOwned = g.save.gadgetsOwned.filter((id) => id !== 'poisonpuddle');
  g.save.activeGadget = null;
  g.test.shopBuy('poisonpuddle');
  const denied = {
    radiationCoins: g.save.radiationCoins,
    owned: g.save.gadgetsOwned.includes('poisonpuddle'),
    active: g.save.activeGadget,
  };
  g.save.radiationCoins = 300;
  g.test.shopBuy('poisonpuddle');
  const bought = {
    radiationCoins: g.save.radiationCoins,
    owned: g.save.gadgetsOwned.includes('poisonpuddle'),
    active: g.save.activeGadget,
  };
  return { denied, bought };
});
check(buy.denied.radiationCoins === 299 && !buy.denied.owned
  && buy.bought.radiationCoins === 0 && buy.bought.owned && buy.bought.active === 'poisonpuddle',
  'купівля списує 300 ☢️, відкриває гаджет і робить його активним', JSON.stringify(buy));

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 5000;
  g.save.crystals = 5;
  g.save.gadgetsOwned = g.save.gadgetsOwned.filter((id) => id !== 'poisonpuddle');
  g.save.gadgetHypers = (g.save.gadgetHypers || []).filter((id) => id !== 'poisonpuddle');
  g.test.shopBuy('poisonpuddle-hyper');
  const locked = {
    coins: g.save.coins,
    crystals: g.save.crystals,
    hasHyper: (g.save.gadgetHypers || []).includes('poisonpuddle'),
  };
  g.test.unlockGadget('poisonpuddle');
  g.save.coins = 4999;
  g.save.crystals = 5;
  g.test.shopBuy('poisonpuddle-hyper');
  const noCoins = {
    coins: g.save.coins,
    crystals: g.save.crystals,
    hasHyper: (g.save.gadgetHypers || []).includes('poisonpuddle'),
  };
  g.save.coins = 5000;
  g.save.crystals = 4;
  g.test.shopBuy('poisonpuddle-hyper');
  const noCrystals = {
    coins: g.save.coins,
    crystals: g.save.crystals,
    hasHyper: (g.save.gadgetHypers || []).includes('poisonpuddle'),
  };
  g.save.coins = 5000;
  g.save.crystals = 5;
  g.test.shopBuy('poisonpuddle-hyper');
  const bought = {
    coins: g.save.coins,
    crystals: g.save.crystals,
    hasHyper: (g.save.gadgetHypers || []).includes('poisonpuddle'),
  };
  g.save.coins = 5000;
  g.save.crystals = 5;
  g.test.shopBuy('poisonpuddle-hyper');
  const second = {
    coins: g.save.coins,
    crystals: g.save.crystals,
    count: (g.save.gadgetHypers || []).filter((id) => id === 'poisonpuddle').length,
  };
  return { locked, noCoins, noCrystals, bought, second };
});
check(!hyperBuy.locked.hasHyper && hyperBuy.locked.coins === 5000 && hyperBuy.locked.crystals === 5,
  'гіпер не купується без базової отруйної калюжі', JSON.stringify(hyperBuy.locked));
check(!hyperBuy.noCoins.hasHyper && hyperBuy.noCoins.coins === 4999 && hyperBuy.noCoins.crystals === 5,
  '4999 монет недостатньо для гіперу', JSON.stringify(hyperBuy.noCoins));
check(!hyperBuy.noCrystals.hasHyper && hyperBuy.noCrystals.coins === 5000 && hyperBuy.noCrystals.crystals === 4,
  '4 кристалів недостатньо для гіперу', JSON.stringify(hyperBuy.noCrystals));
check(hyperBuy.bought.hasHyper && hyperBuy.bought.coins === 0 && hyperBuy.bought.crystals === 0,
  'гіпер купується за 5000 монет і 5 кристалів', JSON.stringify(hyperBuy.bought));
check(hyperBuy.second.coins === 5000 && hyperBuy.second.crystals === 5 && hyperBuy.second.count === 1,
  'повторна покупка гіперу не списує валюту', JSON.stringify(hyperBuy.second));

const effect = await page.evaluate(() => {
  const g = window.__game;
  if (!g.level.gadgets || !g.save.gadgetsOwned.includes('poisonpuddle')) {
    return { used: false, cd: null, placed: false, after1: null, after10: null, expired: null };
  }
  const p = g.level.player;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('poisonpuddle');
  g.save.activeGadget = 'poisonpuddle';
  g.save.gadgetHypers = (g.save.gadgetHypers || []).filter((id) => id !== 'poisonpuddle');
  g.test.gadgetCdReset();
  g.test.teleport(0, 145);
  const used = g.test.useGadget();
  const puddle = g.level.effects.radiationPuddles[0];
  const near = g.test.spawnZombie('tank', p.pos.x + 1.4, p.pos.z);
  const far = g.test.spawnZombie('tank', p.pos.x + 5, p.pos.z);
  near.hp = near.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  g.level.effects.update(1);
  const after1 = {
    nearDmg: Math.round((1000 - near.hp) * 10) / 10,
    farDmg: Math.round((1000 - far.hp) * 10) / 10,
    puddles: g.level.effects.radiationPuddles.length,
    life: Math.round((g.level.effects.radiationPuddles[0]?.life || 0) * 10) / 10,
  };
  for (let i = 0; i < 9; i++) g.level.effects.update(1);
  const after10 = {
    nearDmg: Math.round((1000 - near.hp) * 10) / 10,
    farDmg: Math.round((1000 - far.hp) * 10) / 10,
    puddles: g.level.effects.radiationPuddles.length,
  };
  return {
    used,
    cd: g.level.gadgets.cd,
    placed: !!puddle,
    after1,
    after10,
  };
});
check(effect.used && effect.cd === 30 && effect.placed,
  'гаджет ставить калюжу і запускає cooldown 30с', JSON.stringify(effect));
check(effect.after1 && effect.after1.nearDmg === 5 && effect.after1.farDmg === 0 && effect.after1.puddles === 1 && effect.after1.life === 9,
  'за 1 секунду близький зомбі отримує 5 HP, далекий не отримує шкоду', JSON.stringify(effect.after1));
check(effect.after10 && effect.after10.nearDmg === 50 && effect.after10.farDmg === 0 && effect.after10.puddles === 0,
  'калюжа працює 10 секунд, наносить разом 50 HP і потім зникає', JSON.stringify(effect.after10));

const hyperEffect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('poisonpuddle');
  g.save.activeGadget = 'poisonpuddle';
  g.save.gadgetHypers = ['poisonpuddle'];
  g.test.gadgetCdReset();
  g.test.teleport(0, 145);
  const used = g.test.useGadget();
  const puddle = g.level.effects.radiationPuddles[0];
  const near = g.test.spawnZombie('tank', p.pos.x + 1.4, p.pos.z);
  const far = g.test.spawnZombie('tank', p.pos.x + 5, p.pos.z);
  near.hp = near.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  g.level.effects.update(1);
  const after1 = {
    nearDmg: Math.round((1000 - near.hp) * 10) / 10,
    farDmg: Math.round((1000 - far.hp) * 10) / 10,
    nearSlowT: Math.round((near.slowT || 0) * 10) / 10,
    nearSlowMul: near.slowMul || 1,
    farSlowT: far.slowT || 0,
    puddleDmg: puddle && puddle.dmg,
    puddleSlow: puddle && puddle.slow,
  };
  for (let i = 0; i < 9; i++) g.level.effects.update(1);
  const after10 = {
    nearDmg: Math.round((1000 - near.hp) * 10) / 10,
    farDmg: Math.round((1000 - far.hp) * 10) / 10,
    puddles: g.level.effects.radiationPuddles.length,
  };
  return { used, cd: g.level.gadgets.cd, after1, after10 };
});
check(hyperEffect.used && hyperEffect.cd === 30,
  'гіпер-калюжа використовує той самий cooldown 30с', JSON.stringify(hyperEffect));
check(hyperEffect.after1 && hyperEffect.after1.nearDmg === 10 && hyperEffect.after1.farDmg === 0
  && hyperEffect.after1.nearSlowT > 0 && hyperEffect.after1.nearSlowMul === 0.5 && hyperEffect.after1.farSlowT === 0
  && hyperEffect.after1.puddleDmg === 10 && hyperEffect.after1.puddleSlow === 0.5,
  'гіпер-калюжа за 1с наносить 10 HP і сповільнює тільки зомбі в зоні', JSON.stringify(hyperEffect.after1));
check(hyperEffect.after10 && hyperEffect.after10.nearDmg === 100 && hyperEffect.after10.farDmg === 0 && hyperEffect.after10.puddles === 0,
  'гіпер-калюжа працює 10 секунд, наносить разом 100 HP і потім зникає', JSON.stringify(hyperEffect.after10));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ОТРУЙНА КАЛЮЖА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
