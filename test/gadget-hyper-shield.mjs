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

console.log('▸ Гіперзаряд щита');
const meta = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'shield-hyper');
  return item && { price: item.price, max: item.max, hyper: item.hyper, needsGadget: item.needsGadget };
});
check(meta && meta.price === 5000 && meta.max === 1 && meta.hyper === 'shield' && meta.needsGadget === 'shield',
  'товар: гіперзаряд щита за 5000₴, max 1', JSON.stringify(meta));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.test.unlockGadget('shield');
  g.test.giveCoins(12000);
  const before = g.save.coins;
  g.test.shopBuy('shield-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('shield-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(buy.hypers.includes('shield') && buy.firstCost === 5000 && buy.secondCost === 0,
  'купується один раз і записує shield у gadgetHypers', JSON.stringify(buy));

await page.goto(`${BASE}/?test&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const persisted = await page.evaluate(() => (window.__game.save.gadgetHypers || []).includes('shield'));
check(persisted, 'гіперзаряд щита лишається після перезавантаження сторінки');

const base = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.save.gadgetHypers = [];
  g.save.activeGadget = 'shield';
  g.test.gadgetCdReset();
  g.test.useGadget();
  return p.gadgetShield;
});
check(base === 50, `звичайний щит лишається 50 HP (${base})`);

const hyper = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.save.gadgetHypers = ['shield'];
  g.save.activeGadget = 'shield';
  g.test.gadgetCdReset();
  g.test.useGadget();
  const charge = p.gadgetShield;
  p.respawnProtect = 0;
  p.armor = 0;
  const hp0 = p.health;
  p.takeDamage(30, p.pos.x + 1, p.pos.z);
  const afterSmall = { shield: p.gadgetShield, hp: p.health };
  p.takeDamage(80, p.pos.x + 1, p.pos.z);
  return { charge, hp0, afterSmall, final: { shield: p.gadgetShield, hp: Math.round(p.health) } };
});
check(hyper.charge === 100, `гіпер-щит заряджається на 100 HP (${hyper.charge})`);
check(hyper.afterSmall.shield === 70 && hyper.afterSmall.hp === hyper.hp0,
  'малий удар зʼїдає частину гіпер-щита', JSON.stringify(hyper));
check(hyper.final.shield === 0 && hyper.final.hp < hyper.hp0,
  'великий удар пробиває залишок гіпер-щита в здоровʼя', JSON.stringify(hyper));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ГІПЕРЗАРЯД ЩИТА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
