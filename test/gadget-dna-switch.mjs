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
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon, name: G.name },
    shop: item && { price: item.price, max: item.max, gadget: item.gadget, cat: item.cat },
  };
});
check(meta.gadget && meta.gadget.cd === 50 && meta.gadget.price === 1000 && meta.gadget.icon === '🧬',
  'мета: 50с cd, 1000 монет, 🧬', JSON.stringify(meta));
check(meta.shop && meta.shop.gadget && meta.shop.price === 1000 && meta.shop.max === 1,
  'товар є в магазині як гаджет за 1000 монет', JSON.stringify(meta));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 999;
  g.test.shopBuy('dnaswitch');
  const denied = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('dnaswitch') };
  g.save.coins = 1000;
  g.test.shopBuy('dnaswitch');
  const bought = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('dnaswitch'), active: g.save.activeGadget };
  return { denied, bought };
});
check(buy.denied.coins === 999 && !buy.denied.owned, '999 монет недостатньо', JSON.stringify(buy.denied));
check(buy.bought.coins === 0 && buy.bought.owned && buy.bought.active === 'dnaswitch',
  'куплений ДНК-перемикач стає owned/active', JSON.stringify(buy.bought));

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
