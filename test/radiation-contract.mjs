import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Радіаційний контракт (щотижневий стік ☢️)');
const meta = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'radiationcontract');
  return item && { cat: item.cat, radiationPrice: item.radiationPrice, max: item.max, contract: !!item.contract };
});
check(meta && meta.cat === 'Радіація' && meta.radiationPrice === 150 && meta.max === 1 && meta.contract,
  'у Радіації є контракт за 150 монет радіації, раз на тиждень', JSON.stringify(meta));

const flow = await page.evaluate(() => {
  const g = window.__game;
  g._weekIndex = () => 100; // фіксуємо тиждень — тест не протухає опівночі
  g.save.crystals = 0;
  g.save.radiationCoins = 150;
  g.test.shopBuy('radiationcontract');
  const bought = { crystals: g.save.crystals, radiationCoins: g.save.radiationCoins, wk: !!g.save.weekly['W100:radshop'] };
  g.save.radiationCoins = 150;
  g.test.shopBuy('radiationcontract');
  const denied = { crystals: g.save.crystals, radiationCoins: g.save.radiationCoins };
  g._weekIndex = () => 101; // новий тиждень — контракт знову доступний
  g.test.shopBuy('radiationcontract');
  const nextWeek = { crystals: g.save.crystals, radiationCoins: g.save.radiationCoins, wk: !!g.save.weekly['W101:radshop'] };
  return { bought, denied, nextWeek };
});
check(flow.bought.crystals === 25 && flow.bought.radiationCoins === 0 && flow.bought.wk,
  'контракт списує 150 ☢️ і дає 25 💎 з тижневою позначкою', JSON.stringify(flow.bought));
check(flow.denied.crystals === 25 && flow.denied.radiationCoins === 150,
  'повторна купівля того ж тижня заблокована', JSON.stringify(flow.denied));
check(flow.nextWeek.crystals === 50 && flow.nextWeek.radiationCoins === 0 && flow.nextWeek.wk,
  'наступного тижня контракт доступний знову', JSON.stringify(flow.nextWeek));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РАДІАЦІЙНИЙ КОНТРАКТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
