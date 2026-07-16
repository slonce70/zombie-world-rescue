import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Гаджет «Крижана граната»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'frostgrenade');
  const hyper = SHOP_ITEMS.find((i) => i.id === 'frostgrenade-hyper');
  const G = GADGETS.frostgrenade;
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon, desc: G.desc },
    item: item && { price: item.price, max: item.max, gadget: item.gadget },
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget, desc: hyper.desc },
  };
});
check(meta.gadget && meta.gadget.cd === 40 && meta.gadget.price === 1000 && meta.gadget.icon === '🧊',
  'мета: 40с cd, 1000 монет, 🧊', JSON.stringify(meta.gadget));
check(meta.item && meta.item.price === 1000 && meta.item.max === 1 && meta.item.gadget,
  'продається як гаджет за 1000 монет', JSON.stringify(meta.item));
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1
  && meta.hyper.hyper === 'frostgrenade' && meta.hyper.needsGadget === 'frostgrenade',
  'гіперзаряд крижаної гранати коштує 5000 і потребує базову гранату', JSON.stringify(meta.hyper));

const visible = await page.evaluate(() => {
  const g = window.__game;
  g.shop.open();
  [...document.querySelectorAll('#shop-tabs .shop-tab')]
    .find((el) => el.textContent.trim() === 'Гаджети й друзі')?.click();
  const cards = [...document.querySelectorAll('#shop-grid .shop-item')];
  const el = cards.find((card) => card.dataset.id === 'frostgrenade');
  const rect = el && el.getBoundingClientRect();
  return {
    index: el ? cards.indexOf(el) : -1,
    name: el?.querySelector('.shop-name')?.textContent.trim() || null,
    price: el?.querySelector('.shop-price')?.textContent.trim() || null,
    inViewport: !!rect && rect.top >= 0 && rect.bottom <= window.innerHeight,
    firstIds: cards.slice(0, 8).map((card) => card.dataset.id),
  };
});
check(visible.index === 2 && visible.inViewport && visible.name === 'Крижана граната' && visible.price === '1000 ₴',
  'видима в першому ряду магазину після Відновлення', JSON.stringify(visible));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 999;
  g.save.gadgetsOwned = g.save.gadgetsOwned.filter((id) => id !== 'frostgrenade');
  g.save.activeGadget = null;
  g.test.shopBuy('frostgrenade');
  const denied = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('frostgrenade'), active: g.save.activeGadget };
  g.save.coins = 1000;
  g.test.shopBuy('frostgrenade');
  const bought = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('frostgrenade'), active: g.save.activeGadget };
  return { denied, bought };
});
check(buy.denied.coins === 999 && !buy.denied.owned
  && buy.bought.coins === 0 && buy.bought.owned && buy.bought.active === 'frostgrenade',
  'купівля списує 1000 монет, відкриває гаджет і робить його активним', JSON.stringify(buy));

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 12000;
  g.save.gadgetsOwned = g.save.gadgetsOwned.filter((id) => id !== 'frostgrenade');
  g.save.gadgetHypers = [];
  const beforeLocked = g.save.coins;
  g.test.shopBuy('frostgrenade-hyper');
  const afterLocked = g.save.coins;
  g.test.unlockGadget('frostgrenade');
  g.test.shopBuy('frostgrenade-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('frostgrenade-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    lockedCost: beforeLocked - afterLocked,
    firstCost: afterLocked - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(hyperBuy.hypers.includes('frostgrenade') && hyperBuy.lockedCost === 0
  && hyperBuy.firstCost === 5000 && hyperBuy.secondCost === 0,
  'гіперзаряд купується після базової гранати один раз', JSON.stringify(hyperBuy));

const effect = await page.evaluate(() => {
  const g = window.__game;
  if (!g.level.gadgets || !g.save.gadgetsOwned.includes('frostgrenade')) {
    return { used: false, cd: null, nearDmg: 0, farDmg: 0, nearStun: 0, farStun: 0 };
  }
  const p = g.level.player;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('frostgrenade');
  g.save.activeGadget = 'frostgrenade';
  g.save.gadgetHypers = [];
  g.test.gadgetCdReset();
  g.test.teleport(0, 145);
  p.yaw = 0;
  const near = g.test.spawnZombie('tank', p.pos.x, p.pos.z - 5);
  const far = g.test.spawnZombie('tank', p.pos.x + 8, p.pos.z - 5);
  near.hp = near.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  const used = g.test.useGadget();
  return {
    used,
    cd: g.level.gadgets.cd,
    nearDmg: 1000 - near.hp,
    farDmg: 1000 - far.hp,
    nearStun: Math.round((near.stunT || 0) * 10) / 10,
    farStun: Math.round((far.stunT || 0) * 10) / 10,
  };
});
check(effect.used && effect.cd === 40, 'гаджет спрацьовує і ставить cooldown 40с', JSON.stringify(effect));
check(effect.nearDmg === 20 && effect.nearStun === 3,
  'зомбі в зоні отримує 20 HP шкоди і 3с заморозки', JSON.stringify(effect));
check(effect.farDmg === 0 && effect.farStun === 0,
  'далекий зомбі не отримує шкоду і заморозку', JSON.stringify(effect));

const hyperEffect = await page.evaluate(() => {
  const g = window.__game;
  if (!g.level.gadgets || !g.save.gadgetsOwned.includes('frostgrenade')) {
    return { used: false, cd: null, nearDmg: 0, edgeDmg: 0, farDmg: 0, nearStun: 0, edgeStun: 0, farStun: 0 };
  }
  const p = g.level.player;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('frostgrenade');
  g.save.activeGadget = 'frostgrenade';
  g.save.gadgetHypers = ['frostgrenade'];
  g.test.gadgetCdReset();
  g.test.teleport(0, 145);
  p.yaw = 0;
  const centerX = p.pos.x;
  const centerZ = p.pos.z - 5;
  const near = g.test.spawnZombie('tank', centerX, centerZ);
  const edge = g.test.spawnZombie('tank', centerX + 7, centerZ);
  const far = g.test.spawnZombie('tank', centerX + 8, centerZ);
  near.hp = near.maxHp = 1000;
  edge.hp = edge.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  const used = g.test.useGadget();
  return {
    used,
    cd: g.level.gadgets.cd,
    nearDmg: 1000 - near.hp,
    edgeDmg: 1000 - edge.hp,
    farDmg: 1000 - far.hp,
    nearStun: Math.round((near.stunT || 0) * 10) / 10,
    edgeStun: Math.round((edge.stunT || 0) * 10) / 10,
    farStun: Math.round((far.stunT || 0) * 10) / 10,
  };
});
check(hyperEffect.used && hyperEffect.cd === 40,
  'гіпер-граната спрацьовує і лишає cooldown 40с', JSON.stringify(hyperEffect));
check(hyperEffect.nearDmg === 55 && hyperEffect.nearStun === 5,
  'гіпер-граната наносить 55 HP і 5с заморозки біля центру', JSON.stringify(hyperEffect));
check(hyperEffect.edgeDmg === 55 && hyperEffect.edgeStun === 5,
  'гіпер-зона дістає до краю 15×15м', JSON.stringify(hyperEffect));
check(hyperEffect.farDmg === 0 && hyperEffect.farStun === 0,
  'зомбі поза 15×15м не отримує шкоду і заморозку', JSON.stringify(hyperEffect));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 КРИЖАНА ГРАНАТА ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
