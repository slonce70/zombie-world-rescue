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

console.log('▸ Радіаційна ящірка');
const meta = await page.evaluate(async () => {
  const { PETS } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'radiationlizard');
  let built = false;
  try { built = !!PETS.radiationlizard.make().group; } catch (e) { built = false; }
  return {
    pet: PETS.radiationlizard && { icon: PETS.radiationlizard.icon, move: PETS.radiationlizard.move },
    item: item && { cat: item.cat, radiationPrice: item.radiationPrice, max: item.max, pet: item.pet },
    inGadgets: SHOP_ITEMS.some((i) => i.id === 'radiationlizard' && i.cat === 'Гаджети й друзі'),
    built,
  };
});
check(meta.pet && meta.pet.icon === '🦎' && meta.pet.move === 'quad' && meta.built,
  'ящірка є в PETS і будується як живий пет', JSON.stringify(meta.pet));
check(meta.item && meta.item.cat === 'Радіація' && meta.item.radiationPrice === 150 && meta.item.max === 1 && meta.item.pet,
  'ящірка продається у Радіації за 150 монет радіації', JSON.stringify(meta.item));
check(!meta.inGadgets, 'ящірка не дублюється у звичайній вкладці гаджетів');

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.radiationCoins = 149;
  g.save.pets = g.save.pets.filter((p) => p !== 'radiationlizard');
  g.save.activePet = null;
  g.test.shopBuy('radiationlizard');
  const denied = { coins: g.save.radiationCoins, owned: g.save.pets.includes('radiationlizard'), active: g.save.activePet };
  g.save.radiationCoins = 150;
  g.test.shopBuy('radiationlizard');
  const bought = {
    coins: g.save.radiationCoins,
    owned: g.save.pets.includes('radiationlizard'),
    active: g.save.activePet,
    live: g.test.petKind(),
  };
  return { denied, bought };
});
check(buy.denied.coins === 149 && !buy.denied.owned && buy.bought.coins === 0
  && buy.bought.owned && buy.bought.active === 'radiationlizard' && buy.bought.live === 'radiationlizard',
  'купівля за 150 ☢️ відкриває, одягає і спавнить ящірку', JSON.stringify(buy));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РАДІАЦІЙНА ЯЩІРКА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
