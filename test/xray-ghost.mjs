// v54 «Привиди та Ікс-рей» — headless-перевірки:
//  (1) усі гаджети коштують 1000 монет; гаджет xray існує (cd 25);
//  (2) 👻 ghost — невидимий: rig.group.visible === false при спавні;
//  (3) гаджет Ікс-рей вмикає xrayT=4 і робить усіх привидів видимими;
//  (4) коли Ікс-рей згасає — привиди знову невидимі;
//  (5) у магазині є товар xray за 1000.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '  ✅' : '  ❌') + ' ' + m, x); if (!c) fail++; };
async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh`);
await waitFor(page, () => window.__game && window.__game.state === 'globe', 25000, 'глобус');

// ===== 1) ціни гаджетів + наявність xray =====
console.log('▸ Гаджети: ціни і Ікс-рей');
const gad = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const prices = Object.fromEntries(Object.entries(GADGETS).map(([k, v]) => [k, v.price]));
  return { prices, xray: GADGETS.xray ? { cd: GADGETS.xray.cd, icon: GADGETS.xray.icon, price: GADGETS.xray.price } : null };
});
check(Object.entries(gad.prices).every(([id, p]) => ['healtotem', 'damagetotem', 'invisibility'].includes(id) ? p === 0 : p === 1000),
  'монетні гаджети коштують 1000, кристальні гаджети мають 0 монет', JSON.stringify(gad.prices));
check(gad.xray && gad.xray.price === 1000 && gad.xray.cd === 25, 'гаджет xray: 1000 монет, перезарядка 25с', JSON.stringify(gad.xray));

// у магазині є товар xray за 1000
const shopXray = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const it = SHOP_ITEMS.find((i) => i.id === 'xray');
  return it ? { gadget: !!it.gadget, price: it.price } : null;
});
check(shopXray && shopXray.gadget && shopXray.price === 1000, 'у магазині є гаджет xray за 1000', JSON.stringify(shopXray));

// ===== Заходимо у рівень (TUR — складна країна → привиди дозволені) =====
console.log('▸ Рівень + 👻 невидимість');
await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; });
await page.evaluate(() => window.__game.startLevel('TUR'));
await waitFor(page, () => window.__game.state === 'level' && window.__game.level
  && !document.getElementById('overlay-level-loading').classList.contains('show'), 30000, 'рівень TUR');

const shopBuyXray = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(3000);
  const before = g.save.coins;
  g.test.shopBuy('xray');
  const afterFirst = g.save.coins;
  g.test.shopBuy('xray');
  const afterSecond = g.save.coins;
  return {
    owned: g.save.gadgetsOwned.includes('xray'),
    active: g.save.activeGadget,
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(shopBuyXray.owned && shopBuyXray.active === 'xray', 'куплений xray стає owned/active', JSON.stringify(shopBuyXray));
check(shopBuyXray.firstCost === 1000 && shopBuyXray.secondCost === 0, 'xray не можна купити вдруге', JSON.stringify(shopBuyXray));

// привид спавниться невидимим
const spawned = await page.evaluate(() => {
  const Z = window.__game.level.zombies;
  const g = Z.spawn('ghost', 30, 30, {});
  return { invisible: g.invisible, visible: g.rig.group.visible, hp: g.stats.hp };
});
check(spawned.invisible === true, 'ghost має прапорець invisible', String(spawned.invisible));
check(spawned.visible === false, 'ghost невидимий при спавні (rig.group.visible=false)', String(spawned.visible));
check(spawned.hp === 60, 'ghost: 60 HP', spawned.hp);

// ===== 2) Ікс-рей вмикає видимість =====
const revealed = await page.evaluate(() => {
  const g = window.__game;
  g.save.gadgetsOwned = ['xray'];
  g.save.activeGadget = 'xray';
  g.level.gadgets.cd = 0;
  const ok = g.level.gadgets.use();
  const xrayT = g.level.zombies.xrayT;
  g.level.zombies.update(0.016); // один кадр — застосувати reveal
  const z = g.level.zombies.list.find((q) => q.type === 'ghost');
  return { ok, xrayT, visible: z && z.rig.group.visible, cd: g.level.gadgets.cd };
});
check(revealed.ok === true, 'гаджет Ікс-рей застосовано', String(revealed.ok));
check(revealed.xrayT === 4, 'xrayT = 4с після застосування', revealed.xrayT);
check(revealed.visible === true, 'привид СТАЄ видимим під Ікс-реєм', String(revealed.visible));
check(revealed.cd === 25, 'перезарядка Ікс-рею стала 25с', revealed.cd);

// ===== 3) Ікс-рей згасає → знову невидимий =====
const faded = await page.evaluate(() => {
  const Z = window.__game.level.zombies;
  Z.xrayT = 0.01;
  Z.update(0.5); // згасає
  const z = Z.list.find((q) => q.type === 'ghost');
  return { xrayT: Z.xrayT, visible: z && z.rig.group.visible };
});
check(faded.xrayT === 0, 'xrayT впав до 0', faded.xrayT);
check(faded.visible === false, 'привид знову невидимий після згасання', String(faded.visible));

// ===== 4) бестіарій: ghost і toro у списку =====
const bestiary = await page.evaluate(async () => {
  const mod = await import('/src/ui/hq.js');
  // BESTIARY не експортується — перевіримо через DOM назв немає, тож читаємо приховано через kill-облік
  // Натомість перевіримо, що вбивство ghost пишеться в save.bestiary['ghost'].
  const g = window.__game;
  const z = g.level.zombies.list.find((q) => q.type === 'ghost');
  z.lastHitBy = 1;
  g.level.bus.emit('zombieKilled', z);
  return { ghost: g.save.bestiary.ghost || 0 };
});
check(bestiary.ghost >= 1, 'вбитий привид пишеться в бестіарій (ghost)', bestiary.ghost);

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  fail += errors.length;
}
console.log(fail === 0 ? '🎉 ПРИВИДИ + ІКС-РЕЙ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
