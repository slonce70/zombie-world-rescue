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

console.log('▸ Гаджет «Міна»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'mine');
  const hyper = SHOP_ITEMS.find((i) => i.id === 'mine-hyper');
  return {
    gadget: GADGETS.mine && { cd: GADGETS.mine.cd, price: GADGETS.mine.price, icon: GADGETS.mine.icon },
    item: item && { price: item.price, max: item.max, gadget: item.gadget },
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget },
  };
});
check(meta.gadget && meta.gadget.cd === 35 && meta.gadget.price === 1000 && meta.gadget.icon === '💥',
  'мета: 35с cd, 1000 монет, 💥', JSON.stringify(meta));
check(meta.item && meta.item.price === 1000 && meta.item.max === 1 && meta.item.gadget,
  'міна продається як гаджет за 1000 монет', JSON.stringify(meta.item));
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.hyper === 'mine' && meta.hyper.needsGadget === 'mine',
  'гіперзаряд міни коштує 5000 і потребує базову міну', JSON.stringify(meta.hyper));

const buy = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 1000;
  g.test.shopBuy('mine');
  const bought = { coins: g.save.coins, owned: g.save.gadgetsOwned.includes('mine'), active: g.save.activeGadget };
  g.save.coins = 5000;
  g.test.shopBuy('mine-hyper');
  return { bought, hypers: g.save.gadgetHypers || [], coins: g.save.coins };
});
check(buy.bought.coins === 0 && buy.bought.owned && buy.bought.active === 'mine',
  '1000 монет купують міну назавжди і роблять активною', JSON.stringify(buy.bought));
check(buy.hypers.includes('mine') && buy.coins === 0,
  'гіперзаряд міни купується після базового гаджета', JSON.stringify(buy));

const effect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('mine');
  g.save.gadgetHypers = [];
  g.save.activeGadget = 'mine';
  g.test.gadgetCdReset();
  g.test.teleport(0, 145);
  const used = g.test.useGadget();
  const mine = g.level.gadgets.mines[0];
  const near = g.test.spawnZombie('tank', mine.x + 1.4, mine.z);
  const far = g.test.spawnZombie('tank', mine.x + 8, mine.z);
  near.hp = near.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  g.level.gadgets._updateMines(0.1);
  return {
    used,
    cd: g.level.gadgets.cd,
    mines: g.level.gadgets.mines.length,
    nearDmg: 1000 - near.hp,
    farDmg: 1000 - far.hp,
    playerHp: p.health,
  };
});
check(effect.used && effect.cd === 35 && effect.mines === 0,
  'міна ставиться, спрацьовує на близького зомбі і йде на 35с cd', JSON.stringify(effect));
check(effect.nearDmg > 100 && effect.farDmg === 0,
  'вибух міни бʼє близького зомбі і не дістає далекого', JSON.stringify(effect));

const hyper = await page.evaluate(() => {
  const g = window.__game;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.test.unlockGadget('mine');
  g.save.gadgetHypers = ['mine'];
  g.save.activeGadget = 'mine';
  g.test.gadgetCdReset();
  g.test.teleport(12, 145);
  const used = g.test.useGadget();
  const mine = g.level.gadgets.mines[0];
  const z = g.test.spawnZombie('tank', mine.x + 1.4, mine.z);
  z.hp = z.maxHp = 1000;
  g.level.gadgets._updateMines(0.1);
  return { used, dmg: 1000 - z.hp, fires: g.level.gadgets._meteorFires.length };
});
check(hyper.used && hyper.dmg > effect.nearDmg && hyper.fires === 1,
  'гіпер-міна має сильніший вибух і лишає вогонь', JSON.stringify(hyper));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 МІНА ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
