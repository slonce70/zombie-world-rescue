import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Скін-бокс у магазині');
const res = await page.evaluate(async () => {
  Date.now = () => Date.UTC(2026, 5, 30);
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
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

  // 🎟️ через рік товар мусить лишатись у магазині: це єдине джерело п'яти скінів
  Date.now = () => Date.UTC(2027, 6, 25);
  g.save.coins = 50;
  g.save.crystals = 15;
  g.shop.open();
  const laterTab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Бокси');
  if (laterTab) laterTab.click();
  const laterCard = document.querySelector('.shop-item[data-id="skinbox"]');
  g.shop.close();
  // 🎲 Ролл фіксуємо, як і в усіх кейсах вище. Без цього тут була ставка на випадковість:
  // у 40% роллів бокс повертає 3 кристали, тобто 15 → 3, а не 15 → 0, і кожен другий-третій
  // прогін падав, хоча покупка проходила справно. 0.39 — гілка «50 монет», перевірена вище.
  const later = buyWithRoll(0.39);

  return {
    item: SHOP_ITEMS.find((i) => i.id === 'skinbox'),
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
    laterVisible: !!laterCard,
    // ціна списалась І виграш зарахувався — на фіксованому роллі це рівно 15 💎 → 50 ₴
    laterBought: later.after.crystals === later.before.crystals - 15
      && later.after.coins === later.before.coins + 50,
    laterDebug: later,
  };
});

check(res.item && res.item.crystalPrice === 15 && res.item.max === Infinity && res.item.cat === 'Бокси',
  'скін-бокс коштує 15 кристалів і купується повторно', JSON.stringify(res.item));
check(!res.item.availableUntil,
  'скін-бокс не має вікна доступності й лишається в магазині назавжди', JSON.stringify(res.item.availableUntil));
check(res.card && /15/.test(res.card.price) && res.card.desc.includes('Кактус'),
  'картка показує ціну і шанси', JSON.stringify(res.card));
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
check(res.laterVisible && res.laterBought,
  'через рік скін-бокс так само видно й можна купити', JSON.stringify({ visible: res.laterVisible, bought: res.laterBought, debug: res.laterDebug }));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 СКІН-БОКС ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
