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

console.log('▸ Великий бокс у магазині');
const res = await page.evaluate(async () => {
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  g.shop.open();
  const tabs = [...document.querySelectorAll('.shop-tab')].map((t) => t.textContent);
  const boxTab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Бокси');
  if (boxTab) boxTab.click();
  const boxItems = [...document.querySelectorAll('.shop-item')].map((i) => i.dataset.id);
  g.shop.close();

  const buyWithRoll = (id, roll) => {
    const old = Math.random;
    Math.random = () => roll;
    const before = {
      coins: g.save.coins, crystals: g.save.crystals || 0,
      skins: [...g.save.skins], active: g.save.activeSkin,
      hypers: [...(g.save.gadgetHypers || [])],
      gadgets: [...(g.save.gadgetsOwned || [])],
    };
    try { g.test.shopBuy(id); } finally { Math.random = old; }
    return {
      before,
      after: {
        coins: g.save.coins, crystals: g.save.crystals || 0,
        skins: [...g.save.skins], active: g.save.activeSkin,
        hypers: [...(g.save.gadgetHypers || [])],
        gadgets: [...(g.save.gadgetsOwned || [])],
      },
    };
  };

  g.save.coins = 50;
  g.save.crystals = 9;
  const denied = buyWithRoll('bigbox', 0.1);
  g.save.coins = 50;
  g.save.crystals = 10;
  const coins = buyWithRoll('bigbox', 0.64);
  g.save.coins = 50;
  g.save.crystals = 10;
  const crystals = buyWithRoll('bigbox', 0.91);
  g.save.coins = 50;
  g.save.crystals = 10;
  const skin = buyWithRoll('bigbox', 0.99);

  g.save.coins = 50;
  g.save.crystals = 4;
  const smallDenied = buyWithRoll('smallbox', 0.1);
  g.save.coins = 50;
  g.save.crystals = 5;
  const smallCoins = buyWithRoll('smallbox', 0.79);
  g.save.coins = 50;
  g.save.crystals = 5;
  const smallCrystals = buyWithRoll('smallbox', 0.94);
  g.save.coins = 50;
  g.save.crystals = 5;
  const smallSkin = buyWithRoll('smallbox', 0.99);

  g.save.coins = 499;
  g.save.crystals = 5;
  g.save.gadgetHypers = [];
  const mediumDeniedCoins = buyWithRoll('mediumbox', 0.1);
  g.save.coins = 500;
  g.save.crystals = 4;
  const mediumDeniedCrystals = buyWithRoll('mediumbox', 0.1);
  g.save.coins = 500;
  g.save.crystals = 5;
  const mediumCoins = buyWithRoll('mediumbox', 0.59);
  g.save.coins = 500;
  g.save.crystals = 5;
  const mediumCrystals = buyWithRoll('mediumbox', 0.98);
  g.save.coins = 500;
  g.save.crystals = 5;
  g.save.gadgetHypers = [];
  const mediumHyper = buyWithRoll('mediumbox', 0.995);

  g.save.coins = 50;
  g.save.crystals = 24;
  const megaDenied = buyWithRoll('megabox', 0.1);
  g.save.coins = 50;
  g.save.crystals = 25;
  const megaCoins = buyWithRoll('megabox', 0.59);
  const megaRevealEl = document.querySelector('#megabox-reveal');
  const megaReveal = megaRevealEl && {
    shown: megaRevealEl.classList.contains('show'),
    text: megaRevealEl.textContent,
  };
  g.save.coins = 50;
  g.save.crystals = 25;
  const megaCrystals = buyWithRoll('megabox', 0.79);
  g.save.coins = 50;
  g.save.crystals = 25;
  g.save.gadgetsOwned = [];
  const megaGadget = buyWithRoll('megabox', 0.89);
  g.save.coins = 50;
  g.save.crystals = 25;
  const megaGhost = buyWithRoll('megabox', 0.94);
  g.save.coins = 50;
  g.save.crystals = 25;
  g.save.gadgetHypers = [];
  const megaHyper = buyWithRoll('megabox', 0.97);
  g.save.coins = 50;
  g.save.crystals = 25;
  const megaSamurai = buyWithRoll('megabox', 0.99);

  let built = false, looksSilver = false, medicBuilt = false, looksMedic = false;
  let ghostBuilt = false, looksGhost = false, samuraiBuilt = false, looksSamurai = false;
  try {
    const rig = makeHero('silver', g.save.hero);
    built = !!rig.group;
    looksSilver = rig.heroSkin === 'silver';
  } catch (e) { built = false; }
  try {
    const rig = makeHero('medic', g.save.hero);
    medicBuilt = !!rig.group;
    looksMedic = rig.heroSkin === 'medic';
  } catch (e) { medicBuilt = false; }
  try {
    const rig = makeHero('ghost', g.save.hero);
    ghostBuilt = !!rig.group;
    looksGhost = rig.heroSkin === 'ghost';
  } catch (e) { ghostBuilt = false; }
  try {
    const rig = makeHero('samurai', g.save.hero);
    samuraiBuilt = !!rig.group;
    looksSamurai = rig.heroSkin === 'samurai';
  } catch (e) { samuraiBuilt = false; }

  const item = SHOP_ITEMS.find((i) => i.id === 'bigbox');
  const smallItem = SHOP_ITEMS.find((i) => i.id === 'smallbox');
  const mediumItem = SHOP_ITEMS.find((i) => i.id === 'mediumbox');
  const megaItem = SHOP_ITEMS.find((i) => i.id === 'megabox');
  return {
    tabs,
    boxItems,
    item: item && { crystalPrice: item.crystalPrice, max: item.max, cat: item.cat },
    smallItem: smallItem && { crystalPrice: smallItem.crystalPrice, max: smallItem.max, cat: smallItem.cat },
    mediumItem: mediumItem && { price: mediumItem.price, crystalPrice: mediumItem.crystalPrice, max: mediumItem.max, cat: mediumItem.cat },
    megaItem: megaItem && { price: megaItem.price, crystalPrice: megaItem.crystalPrice, max: megaItem.max, cat: megaItem.cat },
    silverMeta: HERO_SKINS.silver,
    medicMeta: HERO_SKINS.medic,
    ghostMeta: HERO_SKINS.ghost,
    samuraiMeta: HERO_SKINS.samurai,
    denied,
    coins,
    crystals,
    skin,
    smallDenied,
    smallCoins,
    smallCrystals,
    smallSkin,
    mediumDeniedCoins,
    mediumDeniedCrystals,
    mediumCoins,
    mediumCrystals,
    mediumHyper,
    megaDenied,
    megaCoins,
    megaReveal,
    megaCrystals,
    megaGadget,
    megaGhost,
    megaHyper,
    megaSamurai,
    built,
    looksSilver,
    medicBuilt,
    looksMedic,
    ghostBuilt,
    looksGhost,
    samuraiBuilt,
    looksSamurai,
  };
});

check(res.tabs.includes('Бокси') && res.boxItems.includes('bigbox'), `є розділ «Бокси» з великим боксом: ${res.tabs.join(', ')}`);
check(res.item && res.item.crystalPrice === 10 && res.item.max === Infinity && res.item.cat === 'Бокси',
  'великий бокс коштує 10 кристалів і купується повторно', JSON.stringify(res.item));
check(res.denied.after.crystals === 9 && res.denied.after.coins === 50,
  '9 кристалів недостатньо для великого бокса', JSON.stringify(res.denied));
check(res.coins.after.crystals === 0 && res.coins.after.coins === 250,
  'roll 0.64 дає 200 монет', JSON.stringify(res.coins));
check(res.crystals.after.crystals === 15 && res.crystals.after.coins === 50,
  'roll 0.91 дає 15 кристалів після ціни бокса', JSON.stringify(res.crystals));
check(res.skin.after.crystals === 0 && res.skin.after.skins.includes('silver') && res.skin.after.active === 'silver',
  'roll 0.99 дає срібний скін і одягає його', JSON.stringify(res.skin));
check(res.silverMeta && res.built && res.looksSilver, 'срібний скін має метадані і будується без fallback', JSON.stringify({ meta: res.silverMeta, built: res.built, looksSilver: res.looksSilver }));
check(res.boxItems.includes('smallbox'), 'є маленький бокс у розділі «Бокси»', JSON.stringify(res.boxItems));
check(res.smallItem && res.smallItem.crystalPrice === 5 && res.smallItem.max === Infinity && res.smallItem.cat === 'Бокси',
  'маленький бокс коштує 5 кристалів і купується повторно', JSON.stringify(res.smallItem));
check(res.smallDenied.after.crystals === 4 && res.smallDenied.after.coins === 50,
  '4 кристалів недостатньо для маленького бокса', JSON.stringify(res.smallDenied));
check(res.smallCoins.after.crystals === 0 && res.smallCoins.after.coins === 100,
  'маленький бокс roll 0.79 дає 50 монет', JSON.stringify(res.smallCoins));
check(res.smallCrystals.after.crystals === 5 && res.smallCrystals.after.coins === 50,
  'маленький бокс roll 0.94 дає 5 кристалів після ціни бокса', JSON.stringify(res.smallCrystals));
check(res.smallSkin.after.crystals === 0 && res.smallSkin.after.skins.includes('medic') && res.smallSkin.after.active === 'medic',
  'маленький бокс roll 0.99 дає скін Медик і одягає його', JSON.stringify(res.smallSkin));
check(res.medicMeta && res.medicBuilt && res.looksMedic, 'скін Медик має метадані і будується без fallback', JSON.stringify({ meta: res.medicMeta, built: res.medicBuilt, looksMedic: res.looksMedic }));
check(res.boxItems.includes('mediumbox'), 'є середній бокс у розділі «Бокси»', JSON.stringify(res.boxItems));
check(res.mediumItem && res.mediumItem.price === 500 && res.mediumItem.crystalPrice === 5 && res.mediumItem.max === Infinity && res.mediumItem.cat === 'Бокси',
  'середній бокс коштує 500 монет і 5 кристалів та купується повторно', JSON.stringify(res.mediumItem));
check(res.mediumDeniedCoins.after.coins === 499 && res.mediumDeniedCoins.after.crystals === 5,
  '499 монет недостатньо для середнього бокса', JSON.stringify(res.mediumDeniedCoins));
check(res.mediumDeniedCrystals.after.coins === 500 && res.mediumDeniedCrystals.after.crystals === 4,
  '4 кристалів недостатньо для середнього бокса', JSON.stringify(res.mediumDeniedCrystals));
check(res.mediumCoins.after.coins === 100 && res.mediumCoins.after.crystals === 0,
  'середній бокс roll 0.59 дає 100 монет після ціни бокса', JSON.stringify(res.mediumCoins));
check(res.mediumCrystals.after.coins === 0 && res.mediumCrystals.after.crystals === 10,
  'середній бокс roll 0.98 дає 10 кристалів після ціни бокса', JSON.stringify(res.mediumCrystals));
check(res.mediumHyper.after.coins === 0 && res.mediumHyper.after.crystals === 0 && res.mediumHyper.after.hypers.length === 1,
  'середній бокс roll 0.995 дає один гіперзаряд', JSON.stringify(res.mediumHyper));
check(res.boxItems.includes('megabox'), 'є мегабокс у розділі «Бокси»', JSON.stringify(res.boxItems));
check(res.megaItem && res.megaItem.price === 0 && res.megaItem.crystalPrice === 25 && res.megaItem.max === Infinity && res.megaItem.cat === 'Бокси',
  'мегабокс коштує 25 кристалів і купується повторно', JSON.stringify(res.megaItem));
check(res.megaDenied.after.crystals === 24 && res.megaDenied.after.coins === 50,
  '24 кристалів недостатньо для мегабокса', JSON.stringify(res.megaDenied));
check(res.megaCoins.after.crystals === 0 && res.megaCoins.after.coins === 400,
  'мегабокс roll 0.59 дає 350 монет', JSON.stringify(res.megaCoins));
check(res.megaReveal && res.megaReveal.shown && res.megaReveal.text.includes('+350 монет'),
  'мегабокс показує reward overlay після відкриття', JSON.stringify(res.megaReveal));
check(res.megaCrystals.after.crystals === 20 && res.megaCrystals.after.coins === 50,
  'мегабокс roll 0.79 дає 20 кристалів після ціни бокса', JSON.stringify(res.megaCrystals));
check(res.megaGadget.after.crystals === 0 && res.megaGadget.after.gadgets.length === 1,
  'мегабокс roll 0.89 дає один гаджет', JSON.stringify(res.megaGadget));
check(res.megaGhost.after.crystals === 0 && res.megaGhost.after.skins.includes('ghost') && res.megaGhost.after.active === 'ghost',
  'мегабокс roll 0.94 дає скін Привид і одягає його', JSON.stringify(res.megaGhost));
check(res.megaHyper.after.crystals === 0 && res.megaHyper.after.hypers.length === 1,
  'мегабокс roll 0.97 дає один гіперзаряд', JSON.stringify(res.megaHyper));
check(res.megaSamurai.after.crystals === 0 && res.megaSamurai.after.skins.includes('samurai') && res.megaSamurai.after.active === 'samurai',
  'мегабокс roll 0.99 дає скін Самурай і одягає його', JSON.stringify(res.megaSamurai));
check(res.ghostMeta && res.ghostBuilt && res.looksGhost, 'скін Привид має метадані і будується без fallback', JSON.stringify({ meta: res.ghostMeta, built: res.ghostBuilt, looksGhost: res.looksGhost }));
check(res.samuraiMeta && res.samuraiBuilt && res.looksSamurai, 'скін Самурай має метадані і будується без fallback', JSON.stringify({ meta: res.samuraiMeta, built: res.samuraiBuilt, looksSamurai: res.looksSamurai }));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 БОКСИ МАГАЗИНУ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
