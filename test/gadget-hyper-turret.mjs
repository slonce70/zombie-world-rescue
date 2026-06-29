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

console.log('▸ Гіперзаряд турелі');
const meta = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'turret-hyper');
  return item && {
    price: item.price,
    max: item.max,
    hyper: item.hyper,
  };
});
check(meta && meta.price === 5000 && meta.max === 1 && meta.hyper === 'turret',
  'товар: гіперзаряд турелі за 5000₴, max 1', JSON.stringify(meta));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.test.unlockGadget('turret');
  g.test.giveCoins(12000);
  const before = g.save.coins;
  g.test.shopBuy('turret-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('turret-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(buy.hypers.includes('turret') && buy.firstCost === 5000 && buy.secondCost === 0,
  'купується один раз і записує turret у gadgetHypers', JSON.stringify(buy));

await page.goto(`${BASE}/?test&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const persisted = await page.evaluate(() => (window.__game.save.gadgetHypers || []).includes('turret'));
check(persisted, 'гіперзаряд лишається після перезавантаження сторінки');

const base = await page.evaluate(() => {
  const g = window.__game;
  for (const zb of g.level.zombies.list) zb.state = 'dead';
  g.save.gadgetHypers = [];
  g.save.activeGadget = 'turret';
  g.test.gadgetCdReset();
  g.test.useGadget();
  const t = g.level.gadgets.turrets[0];
  const z = g.test.spawnZombie('tank', t.x + 6, t.z);
  z.hp = z.maxHp = 1000;
  t.fireT = 0;
  g.level.gadgets.update(0.05, g.input, true);
  return { hp: t.hp, dmg: 1000 - z.hp };
});
check(base.hp === 120 && base.dmg === 14, 'звичайна турель лишається 120 HP / 14 шкоди', JSON.stringify(base));

const hyper = await page.evaluate(() => {
  const g = window.__game;
  while (g.level.gadgets.turrets.length) g.level.gadgets._removeTurret(0, false);
  for (const zb of g.level.zombies.list) zb.state = 'dead';
  g.save.gadgetHypers = ['turret'];
  g.save.activeGadget = 'turret';
  g.test.gadgetCdReset();
  g.test.useGadget();
  const t = g.level.gadgets.turrets[0];
  if (!t) return { hp: 0, dmg: 0 };
  const z = g.test.spawnZombie('tank', t.x + 6, t.z);
  z.hp = z.maxHp = 1000;
  t.fireT = 0;
  g.level.gadgets.update(0.05, g.input, true);
  return { hp: t.hp, dmg: 1000 - z.hp };
});
check(hyper.hp === 100 && hyper.dmg === 25, 'гіпер-турель має 100 HP / 25 шкоди', JSON.stringify(hyper));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ГІПЕРЗАРЯД ТУРЕЛІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
