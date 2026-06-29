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

console.log('▸ Гіперзаряд відновлення');
const meta = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'heal-hyper');
  return item && { price: item.price, max: item.max, hyper: item.hyper, needsGadget: item.needsGadget };
});
check(meta && meta.price === 5000 && meta.max === 1 && meta.hyper === 'heal' && meta.needsGadget === 'heal',
  'товар: гіперзаряд відновлення за 5000 монет, max 1', JSON.stringify(meta));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(12000);
  const beforeLocked = g.save.coins;
  g.test.shopBuy('heal-hyper');
  const afterLocked = g.save.coins;
  g.test.unlockGadget('heal');
  g.test.shopBuy('heal-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('heal-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    lockedCost: beforeLocked - afterLocked,
    firstCost: afterLocked - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(buy.hypers.includes('heal') && buy.lockedCost === 0 && buy.firstCost === 5000 && buy.secondCost === 0,
  'купується після гаджета heal, один раз і записує heal у gadgetHypers', JSON.stringify(buy));

const effects = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('heal');
  g.save.activeGadget = 'heal';

  g.save.gadgetHypers = [];
  p.maxHealth = 200;
  p.health = 40;
  g.test.gadgetCdReset();
  const baseUsed = g.test.useGadget();
  const baseHp = p.health;

  g.save.gadgetHypers = ['heal'];
  p.health = 40;
  g.test.gadgetCdReset();
  const hyperUsed = g.test.useGadget();
  const hyperHp = p.health;

  return { baseUsed, baseHp, hyperUsed, hyperHp, cd: g.level.gadgets.cd };
});
check(effects.baseUsed && effects.baseHp === 90, `звичайне відновлення лишається +50 HP (${effects.baseHp})`);
check(effects.hyperUsed && effects.hyperHp === 140, `гіпер-відновлення лікує +100 HP (${effects.hyperHp})`);
check(effects.cd >= 24, `перезарядка лишається 25с (${Math.round(effects.cd)})`);

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ГІПЕРЗАРЯД ВІДНОВЛЕННЯ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
