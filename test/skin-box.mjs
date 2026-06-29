import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
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

console.log('▸ Скін-бокс у магазині');
const res = await page.evaluate(async () => {
  Date.now = () => Date.UTC(2026, 5, 30);
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS, SKINBOX_AVAILABLE_UNTIL } = await import('/src/shop.js');
  const g = window.__game;
  g.shop.open();
  const boxTab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Бокси');
  if (boxTab) boxTab.click();
  const card = document.querySelector('.shop-item[data-id="skinbox"]');
  g.shop.close();

  const buyWithRoll = (roll) => {
    const old = Math.random;
    Math.random = () => roll;
    const before = {
      coins: g.save.coins,
      crystals: g.save.crystals || 0,
      skins: [...g.save.skins],
      active: g.save.activeSkin,
    };
    try { g.test.shopBuy('skinbox'); } finally { Math.random = old; }
    return {
      before,
      after: {
        coins: g.save.coins,
        crystals: g.save.crystals || 0,
        skins: [...g.save.skins],
        active: g.save.activeSkin,
      },
    };
  };

  g.save.coins = 50;
  g.save.crystals = 14;
  const denied = buyWithRoll(0.1);
  g.save.coins = 50;
  g.save.crystals = 15;
  const coins = buyWithRoll(0.39);
  g.save.coins = 50;
  g.save.crystals = 15;
  const crystals = buyWithRoll(0.79);
  g.save.coins = 50;
  g.save.crystals = 15;
  const cactus = buyWithRoll(0.89);
  g.save.coins = 50;
  g.save.crystals = 15;
  const traveler = buyWithRoll(0.93);
  g.save.coins = 50;
  g.save.crystals = 15;
  const rainbow = buyWithRoll(0.965);
  g.save.coins = 50;
  g.save.crystals = 15;
  const gardener = buyWithRoll(0.985);
  g.save.coins = 50;
  g.save.crystals = 15;
  const zombie = buyWithRoll(0.995);

  const built = {};
  for (const id of ['cactus', 'traveler', 'rainbow', 'gardener', 'zombie']) {
    try {
      const rig = makeHero(id, g.save.hero);
      built[id] = !!rig.group && rig.heroSkin === id;
    } catch (e) {
      built[id] = false;
    }
  }

  Date.now = () => Date.UTC(2026, 6, 25);
  g.save.coins = 50;
  g.save.crystals = 15;
  g.shop.open();
  const expiredTab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Бокси');
  if (expiredTab) expiredTab.click();
  const expiredCard = document.querySelector('.shop-item[data-id="skinbox"]');
  g.shop.close();
  const beforeExpired = { coins: g.save.coins, crystals: g.save.crystals, skins: [...g.save.skins] };
  g.test.shopBuy('skinbox');
  const afterExpired = { coins: g.save.coins, crystals: g.save.crystals, skins: [...g.save.skins] };

  return {
    item: SHOP_ITEMS.find((i) => i.id === 'skinbox'),
    until: SKINBOX_AVAILABLE_UNTIL,
    card: card && { price: card.querySelector('.shop-price')?.textContent.trim(), desc: card.querySelector('.shop-desc')?.textContent.trim() },
    denied,
    coins,
    crystals,
    cactus,
    traveler,
    rainbow,
    gardener,
    zombie,
    metas: Object.fromEntries(['cactus', 'traveler', 'rainbow', 'gardener', 'zombie'].map((id) => [id, HERO_SKINS[id] && HERO_SKINS[id].name])),
    built,
    expiredHidden: !expiredCard,
    expiredUnchanged: JSON.stringify(beforeExpired) === JSON.stringify(afterExpired),
  };
});

check(res.item && res.item.crystalPrice === 15 && res.item.max === Infinity && res.item.cat === 'Бокси',
  'скін-бокс коштує 15 кристалів і купується повторно', JSON.stringify(res.item));
check(res.until === Date.UTC(2026, 6, 24, 23, 59, 59),
  'скін-бокс доступний 25 днів до 2026-07-24 включно', String(res.until));
check(res.card && /15/.test(res.card.price) && res.card.desc.includes('25 днів'),
  'картка показує ціну і 25-денний сезон', JSON.stringify(res.card));
check(res.denied.after.crystals === 14 && res.denied.after.coins === 50,
  '14 кристалів недостатньо для скін-бокса', JSON.stringify(res.denied));
check(res.coins.after.coins === 100 && res.coins.after.crystals === 0,
  '40% гілка дає 50 монет після ціни бокса', JSON.stringify(res.coins));
check(res.crystals.after.coins === 50 && res.crystals.after.crystals === 3,
  '40% гілка дає 3 кристали після ціни бокса', JSON.stringify(res.crystals));
check(res.cactus.after.skins.includes('cactus') && res.cactus.after.active === 'cactus',
  '10% гілка дає скін Кактус', JSON.stringify(res.cactus));
check(res.traveler.after.skins.includes('traveler') && res.traveler.after.active === 'traveler',
  '4% гілка дає скін Мандрівник', JSON.stringify(res.traveler));
check(res.rainbow.after.skins.includes('rainbow') && res.rainbow.after.active === 'rainbow',
  '3% гілка дає різнокольоровий скін', JSON.stringify(res.rainbow));
check(res.gardener.after.skins.includes('gardener') && res.gardener.after.active === 'gardener',
  '1% гілка дає скін Садівник', JSON.stringify(res.gardener));
check(res.zombie.after.skins.includes('zombie') && res.zombie.after.active === 'zombie',
  '1% гілка дає скін Зомбі', JSON.stringify(res.zombie));
check(Object.values(res.metas).every(Boolean) && Object.values(res.built).every(Boolean),
  'усі 5 нових скінів мають метадані і будуються без fallback', JSON.stringify({ metas: res.metas, built: res.built }));
check(res.expiredHidden && res.expiredUnchanged,
  'після 2026-07-24 скін-бокс зникає і не купується', JSON.stringify({ hidden: res.expiredHidden, unchanged: res.expiredUnchanged }));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 СКІН-БОКС ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
