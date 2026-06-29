import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=SWE`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Швеція');
const sweden = await page.evaluate(() => ({
  country: window.__game.level.countryId,
  name: window.__game.level.country.name,
  biome: window.__game.level.country.biome,
  zombies: window.__game.level.zombies.list.length,
}));
check(sweden.country === 'SWE', 'країна SWE завантажилась', JSON.stringify(sweden));
check(sweden.zombies > 20, 'на мапі є зомбі', String(sweden.zombies));

console.log('▸ Гаджет «Бескінечні патрони»');
const gadget = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  return {
    meta: GADGETS.infammo && { cd: GADGETS.infammo.cd, price: GADGETS.infammo.price },
    shop: SHOP_ITEMS.some((i) => i.id === 'infammo' && i.gadget && i.price === 1000),
  };
});
check(gadget.meta && gadget.meta.cd === 45 && gadget.meta.price === 1000, 'мета: 45с cd, 1000 монет', JSON.stringify(gadget));
check(gadget.shop, 'товар є в магазині');

const shopBuyInfAmmo = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(3000);
  const before = g.save.coins;
  g.test.shopBuy('infammo');
  const afterFirst = g.save.coins;
  g.test.shopBuy('infammo');
  const afterSecond = g.save.coins;
  return {
    owned: g.save.gadgetsOwned.includes('infammo'),
    active: g.save.activeGadget,
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(shopBuyInfAmmo.owned && shopBuyInfAmmo.active === 'infammo', 'куплений gadget стає owned/active', JSON.stringify(shopBuyInfAmmo));
check(shopBuyInfAmmo.firstCost === 1000 && shopBuyInfAmmo.secondCost === 0, 'infammo не можна купити вдруге', JSON.stringify(shopBuyInfAmmo));

const effect = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.giveWeapon('rifle');
  p.giveWeapon('smg');
  p.switchWeapon('rifle');
  p.ammo.rifle.mag = 0;
  p.ammo.rifle.reserve = 0;
  p.shootCd = 0;
  g.test.unlockGadget('infammo');
  const ok = g.test.useGadget();
  const cd = g.level.gadgets.cd;
  const t0 = p.infiniteAmmoT;
  const before = p.ammo.rifle.mag;
  for (let i = 0; i < 8; i++) p._shoot();
  const after = p.ammo.rifle.mag;
  const fast = p.shootCd < 60 / 620;
  p.switchWeapon('smg');
  p.ammo.smg.mag = 0;
  p.ammo.smg.reserve = 0;
  p.shootCd = 0;
  const smgBefore = p.ammo.smg.mag;
  for (let i = 0; i < 8; i++) p._shoot();
  const smgAfter = p.ammo.smg.mag;
  const smgFast = p.shootCd < 60 / 920;
  p.update(3.2, g.input, false);
  return { ok, cd, t0, before, after, fast, smgBefore, smgAfter, smgFast, expired: p.infiniteAmmoT <= 0 };
});
check(effect.ok, 'гаджет застосовується');
check(effect.cd === 45, 'перезарядка 45с', String(effect.cd));
check(effect.t0 === 3, 'ефект триває 3с', String(effect.t0));
check(effect.before === effect.after, 'патрони автомата не витрачаються', JSON.stringify(effect));
check(effect.fast, 'автомат стріляє швидше під ефектом', JSON.stringify(effect));
check(effect.smgBefore === effect.smgAfter, 'патрони швидкостріла не витрачаються', JSON.stringify(effect));
check(effect.smgFast, 'швидкостріл стріляє швидше під ефектом', JSON.stringify(effect));
check(effect.expired, 'ефект згасає після 3с');

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ШВЕЦІЯ + БЕСКІНЕЧНІ ПАТРОНИ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
