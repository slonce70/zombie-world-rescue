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

console.log('▸ Гаджет «ДНК-перемикач»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const G = GADGETS.dnaswitch;
  const item = SHOP_ITEMS.find((i) => i.id === 'dnaswitch');
  const hyper = SHOP_ITEMS.find((i) => i.id === 'dnaswitch-hyper');
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon, name: G.name },
    shop: item && { price: item.price, max: item.max, gadget: item.gadget, cat: item.cat },
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget, cat: hyper.cat },
  };
});
check(meta.gadget && meta.gadget.cd === 50 && meta.gadget.price === 1000 && meta.gadget.icon === '🧬',
  'мета: 50с cd, 1000 монет, 🧬', JSON.stringify(meta));
check(meta.shop && meta.shop.gadget && meta.shop.price === 1000 && meta.shop.max === 1,
  'товар є в магазині як гаджет за 1000 монет', JSON.stringify(meta));
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.hyper === 'dnaswitch' && meta.hyper.needsGadget === 'dnaswitch',
  'гіперзаряд ДНК-перемикача є в магазині за 5000 монет і потребує базовий гаджет', JSON.stringify(meta.hyper));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 999;
  g.test.shopBuy('dnaswitch');
  const denied = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('dnaswitch') };
  g.save.coins = 1000;
  g.test.shopBuy('dnaswitch');
  const bought = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('dnaswitch'), active: g.save.activeGadget };
  const g2 = window.__game;
  g2.save.gadgetHypers = [];
  g2.save.gadgetsOwned = g2.save.gadgetsOwned.filter((id) => id !== 'dnaswitch');
  g2.save.coins = 5000;
  g2.test.shopBuy('dnaswitch-hyper');
  const hyperLocked = { coins: g2.save.coins, hyper: g2.save.gadgetHypers.includes('dnaswitch') };
  g2.test.unlockGadget('dnaswitch');
  g2.save.coins = 5000;
  g2.test.shopBuy('dnaswitch-hyper');
  const hyperBought = { coins: g2.save.coins, hyper: g2.save.gadgetHypers.includes('dnaswitch') };
  return { denied, bought, hyperLocked, hyperBought };
});
check(buy.denied.coins === 999 && !buy.denied.owned, '999 монет недостатньо', JSON.stringify(buy.denied));
check(buy.bought.coins === 0 && buy.bought.owned && buy.bought.active === 'dnaswitch',
  'куплений ДНК-перемикач стає owned/active', JSON.stringify(buy.bought));
check(buy.hyperLocked.coins === 5000 && !buy.hyperLocked.hyper,
  'гіперзаряд не купується без базового ДНК-перемикача', JSON.stringify(buy.hyperLocked));
check(buy.hyperBought.coins === 0 && buy.hyperBought.hyper,
  'гіперзаряд купується після базового гаджета', JSON.stringify(buy.hyperBought));

console.log('▸ Ефект: один зомбі 6с бʼє інших зомбі');
const effect = await page.evaluate(() => {
  const g = window.__game;
  if (!window.__GADGET_DNA_TEST_READY && !g.save.gadgetsOwned.includes('dnaswitch')) {
    return { missing: true, afterUse: { used: false, cd: 0, confusedT: 0, playerHp: 100, targetHp: 100 }, afterFight: { playerHp: 100, targetHp: 100 }, afterExpire: { allyConfusedT: 0 } };
  }
  const Z = g.level.zombies;
  const p = g.level.player;
  for (const z of [...Z.list]) z.state = 'dead';
  g.test.teleport(0, 0);
  p.health = p.maxHealth = 100;
  p.respawnProtect = 0;
  p.gadgetShield = 0;
  p.armor = 0;
  g.test.unlockGadget('dnaswitch');
  g.save.gadgetHypers = [];
  g.test.gadgetCdReset();
  const ally = g.test.spawnZombie('walker', 0, -3);
  const target = g.test.spawnZombie('walker', 0, -4.1);
  ally.aggroed = true;
  target.aggroed = true;
  ally.stats.dmg = 10;
  ally.confusedT = 0;
  target.hp = target.maxHp = 100;
  const used = g.test.useGadget();
  const afterUse = { used, cd: g.level.gadgets.cd, confusedT: ally.confusedT, playerHp: p.health, targetHp: target.hp };
  for (let i = 0; i < 6; i++) Z.update(0.2);
  const afterFight = { playerHp: p.health, allyConfusedT: ally.confusedT, targetHp: target.hp, targetState: target.state };
  Z.update(6.2);
  return { afterUse, afterFight, afterExpire: { allyConfusedT: ally.confusedT } };
});
check(effect.afterUse.used && effect.afterUse.cd === 50 && effect.afterUse.confusedT > 5.8,
  'гаджет спрацьовує, дає 6с контролю і ставить 50с cooldown', JSON.stringify(effect.afterUse));
check(effect.afterFight.playerHp === 100 && effect.afterFight.targetHp < 100,
  'контрольований зомбі не бʼє гравця і шкодить іншому зомбі', JSON.stringify(effect.afterFight));
check(effect.afterExpire.allyConfusedT === 0, 'контроль минає після 6 секунд', JSON.stringify(effect.afterExpire));

console.log('▸ Гіперзаряд: 3 зомбі, 9с, +5 шкоди');
const hyperEffect = await page.evaluate(() => {
  const g = window.__game;
  const Z = g.level.zombies;
  const p = g.level.player;
  for (const z of [...Z.list]) z.state = 'dead';
  g.test.teleport(0, 0);
  p.health = p.maxHealth = 100;
  p.respawnProtect = 0;
  p.gadgetShield = 0;
  p.armor = 0;
  g.test.unlockGadget('dnaswitch');
  g.save.gadgetHypers = ['dnaswitch'];
  g.test.gadgetCdReset();
  const allies = [
    g.test.spawnZombie('walker', -6, -3),
    g.test.spawnZombie('walker', 0, -3),
    g.test.spawnZombie('walker', 6, -3),
  ];
  for (const ally of allies) {
    ally.aggroed = true;
    ally.stats.dmg = 10;
    ally.confusedT = 0;
    ally.confusedDmgBonus = 0;
  }
  const used = g.test.useGadget();
  const afterUse = {
    used,
    cd: g.level.gadgets.cd,
    confused: allies.filter((z) => z.confusedT > 8.8).length,
    bonuses: allies.map((z) => z.confusedDmgBonus || 0),
  };
  const targets = [
    g.test.spawnZombie('walker', -6, -4.1),
    g.test.spawnZombie('walker', 0, -4.1),
    g.test.spawnZombie('walker', 6, -4.1),
  ];
  for (const target of targets) {
    target.hp = target.maxHp = 100;
    target.stats.dmg = 0;
    target.aggroed = false;
  }
  for (let i = 0; i < 6; i++) Z.update(0.2);
  const targetHp = targets.map((z) => z.hp);
  return { afterUse, afterFight: { playerHp: p.health, targetHp, minTargetHp: Math.min(...targetHp), allyTimers: allies.map((z) => z.confusedT) } };
});
check(hyperEffect.afterUse.used && hyperEffect.afterUse.cd === 50 && hyperEffect.afterUse.confused === 3,
  'гіпер-ДНК перемикає 3 зомбі і ставить 50с cooldown', JSON.stringify(hyperEffect.afterUse));
check(hyperEffect.afterUse.bonuses.every((n) => n === 5),
  'усі 3 плутані зомбі отримують +5 шкоди', JSON.stringify(hyperEffect.afterUse));
check(hyperEffect.afterFight.playerHp === 100 && hyperEffect.afterFight.minTargetHp <= 85,
  'гіпер-плутані зомбі бʼють інших зомбі на 15 HP, не гравця', JSON.stringify(hyperEffect.afterFight));

console.log('▸ Боси не стають ціллю контролю');
const boss = await page.evaluate(() => {
  const g = window.__game;
  if (!window.__GADGET_DNA_TEST_READY && !g.save.gadgetsOwned.includes('dnaswitch')) {
    return { missing: true, bossOnly: { used: false, bossConfusedT: 0, cd: 0 }, withWalker: { used: false, bossConfusedT: 0, walkerConfusedT: 0 } };
  }
  const Z = g.level.zombies;
  for (const z of [...Z.list]) z.state = 'dead';
  g.test.teleport(30, 30);
  g.test.unlockGadget('dnaswitch');
  g.save.gadgetHypers = [];
  g.test.gadgetCdReset();
  const b = g.test.spawnZombie('boss', 30, 24);
  const usedBossOnly = g.test.useGadget();
  const bossOnly = { used: usedBossOnly, bossConfusedT: b.confusedT || 0, cd: g.level.gadgets.cd };
  const w = g.test.spawnZombie('walker', 30, 25);
  g.test.gadgetCdReset();
  const usedWithWalker = g.test.useGadget();
  return { bossOnly, withWalker: { used: usedWithWalker, bossConfusedT: b.confusedT || 0, walkerConfusedT: w.confusedT || 0 } };
});
check(!boss.bossOnly.used && boss.bossOnly.bossConfusedT === 0 && boss.bossOnly.cd === 0,
  'якщо поруч тільки бос, гаджет не витрачається', JSON.stringify(boss.bossOnly));
check(boss.withWalker.used && boss.withWalker.bossConfusedT === 0 && boss.withWalker.walkerConfusedT > 5.8,
  'з босом поруч гаджет вибирає звичайного зомбі, не боса', JSON.stringify(boss.withWalker));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ДНК-ПЕРЕМИКАЧ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
