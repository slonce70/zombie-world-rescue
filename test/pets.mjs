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

console.log('▸ Реєстр улюбленців і магазин');
const meta = await page.evaluate(async () => {
  const { PETS } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const ids = Object.keys(PETS);
  const items = SHOP_ITEMS.filter((i) => i.pet);
  const dog = items.find((i) => i.id === 'dog');
  const cat = items.find((i) => i.id === 'cat');
  return {
    count: ids.length, ids,
    items: items.length,
    dogPrice: dog && dog.price, catPrice: cat && cat.price,
    allHaveMeta: ids.every((id) => PETS[id].name && PETS[id].icon && PETS[id].make && PETS[id].move),
  };
});
check(meta.count >= 12 && meta.allHaveMeta, `реєстр PETS: ${meta.count} тварин з повними метаданими`, meta.ids.join(','));
check(meta.items === meta.count, `усі ${meta.count} улюбленців є в магазині`, `items=${meta.items}`);
check(meta.dogPrice === 350 && meta.catPrice === 1500, 'ціни: собака 350 (стартова), решта 1500', JSON.stringify(meta));

console.log('▸ Купівля і вибір');
const buy = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(99999);
  const c0 = g.save.coins;
  g.shop.buy('cat');
  const afterBuy = { coins: g.save.coins, owned: g.save.pets.includes('cat'), active: g.save.activePet, live: g.test.petKind() };
  g.shop.buy('cat'); // вдруге — не списує (max 1)
  const second = g.save.coins;
  return { spent: c0 - afterBuy.coins, afterBuy, secondCost: afterBuy.coins - second };
});
check(buy.spent === 1500 && buy.afterBuy.owned && buy.afterBuy.active === 'cat' && buy.afterBuy.live === 'cat',
  'куплене кошеня: -1500, owned, активне і живе в рівні', JSON.stringify(buy));
check(buy.secondCost === 0, 'улюбленця не можна купити вдруге (max 1)', JSON.stringify(buy));

console.log('▸ Спавн КОЖНОЇ тварини (без помилок)');
const all = await page.evaluate(async () => {
  const { PETS } = await import('/src/characters.js');
  const g = window.__game;
  const res = {};
  for (const id of Object.keys(PETS)) {
    g.test.setActivePet(id);
    res[id] = (g.test.petKind() === id) && g.test.state().pet === true;
  }
  return res;
});
const okAll = Object.values(all).every(Boolean);
check(okAll, 'кожен улюбленець спавниться і стає активним', okAll ? '' : JSON.stringify(all));

console.log('▸ Зміна активного — живе перестворення (без накопичення)');
const swap = await page.evaluate(() => {
  const g = window.__game;
  g.test.setActivePet('dragon'); const a = g.test.petKind();
  g.test.setActivePet('penguin'); const b = g.test.petKind();
  return { a, b, oneLevelPet: !!g.level.pet };
});
check(swap.a === 'dragon' && swap.b === 'penguin' && swap.oneLevelPet, 'перемикання типів працює', JSON.stringify(swap));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 УЛЮБЛЕНЦІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
