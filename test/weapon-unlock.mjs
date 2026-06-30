// v53 «Зброя за зірковий рівень + Шкет» — headless-перевірки:
//  (а) вогнемет/лазер БІЛЬШЕ НЕ в магазині (каталог SHOP_ITEMS їх не містить);
//  (б) форс зіркового рівня 25 → catch-up видає ВОГНЕМЕТ; рівень 28 → ЛАЗЕР;
//  (в) звільнення ESP дає МОНЕТИ (coinReward), не зброю;
//  (г) новий зомбі 'imp' (Шкет) спавниться: hp=50, дуже високий chaseSpeed, дрібний.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '  ✅' : '  ❌') + ' ' + m, x); if (!c) fail++; };
async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs * SLOW) {
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

// ===== (а) магазин більше НЕ продає вогнемет/лазер =====
console.log('▸ Каталог магазину');
const shop = await page.evaluate(async () => {
  const mod = await import('/src/shop.js');
  const ids = mod.SHOP_ITEMS.map((i) => i.id);
  return {
    ids,
    hasFlame: ids.includes('flamethrower'),
    hasLaser: ids.includes('laser'),
    keepsSmg: ids.includes('smg') && ids.includes('magnum') && ids.includes('sniper'),
    weaponPrices: Object.fromEntries(mod.SHOP_ITEMS.filter((i) => i.weapon).map((i) => [i.id, i.price])),
  };
});
check(!shop.hasFlame, 'вогнемета НЕМАЄ в магазині', shop.hasFlame);
check(!shop.hasLaser, 'лазера НЕМАЄ в магазині', shop.hasLaser);
check(shop.keepsSmg, 'smg/magnum/sniper лишилися в магазині');
check(Object.values(shop.weaponPrices).every((price) => price === 2500),
  'усі зброї в магазині коштують 2500 монет', JSON.stringify(shop.weaponPrices));

// ===== (б) catch-up за зірковий рівень =====
console.log('▸ Catch-up зброї за зірковий рівень');
// XP, потрібний щоб ДОСЯГТИ рівня L (сума xpForLevel(1..L-1))
const xpForLvl25 = await page.evaluate(async () => {
  const mod = await import('/src/progress.js');
  let need = 0; for (let l = 1; l < 25; l++) need += mod.xpForLevel(l);
  return need;
});
const after25 = await page.evaluate((xp) => {
  const g = window.__game;
  g.save.weapons = [];
  g.save.xp = xp;
  const lvl = g.progress.level;
  g.progress._checkWeaponUnlocks();
  return { lvl, weapons: g.save.weapons.slice() };
}, xpForLvl25);
check(after25.lvl === 25, `зірковий рівень = 25 (${after25.lvl})`);
check(after25.weapons.includes('flamethrower'), 'на рівні 25 видано ВОГНЕМЕТ');
check(!after25.weapons.includes('laser'), 'на рівні 25 ЛАЗЕРА ще немає (він на 28)');

const xpForLvl28 = await page.evaluate(async () => {
  const mod = await import('/src/progress.js');
  let need = 0; for (let l = 1; l < 28; l++) need += mod.xpForLevel(l);
  return need;
});
const after28 = await page.evaluate((xp) => {
  const g = window.__game;
  g.save.weapons = [];
  g.save.xp = xp;
  const lvl = g.progress.level;
  g.progress._checkWeaponUnlocks();
  return { lvl, weapons: g.save.weapons.slice() };
}, xpForLvl28);
check(after28.lvl === 28, `зірковий рівень = 28 (${after28.lvl})`);
check(after28.weapons.includes('flamethrower') && after28.weapons.includes('laser'),
  'на рівні 28 видано і ВОГНЕМЕТ, і ЛАЗЕР');

// нижче 25 — нічого не видається
const below = await page.evaluate(() => {
  const g = window.__game;
  g.save.weapons = [];
  g.save.xp = 0;
  g.progress._checkWeaponUnlocks();
  return { lvl: g.progress.level, weapons: g.save.weapons.slice() };
});
check(below.lvl < 25 && below.weapons.length === 0, `нижче 25 (${below.lvl}) зброя не видається`);

// ===== (в) звільнення ESP дає МОНЕТИ, не зброю =====
console.log('▸ Звільнення ESP → монети');
const espCfg = await page.evaluate(async () => {
  const mod = await import('/src/countries.js');
  const C = mod.COUNTRIES.ESP;
  return { reward: C.weaponReward || null, coin: C.coinReward || 0 };
});
check(!espCfg.reward && espCfg.coin === 600, `ESP: без зброї, coinReward=600 (${espCfg.coin})`);

await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; window.__game.save.xp = 0; window.__game.save.weapons = []; });
await page.evaluate(() => window.__game.startLevel('ESP'));
await waitFor(page, () => window.__game.state === 'level' && window.__game.level
  && !document.getElementById('overlay-level-loading').classList.contains('show'), 30000, 'рівень ESP');
await page.evaluate(() => window.__game.test.god());
await page.waitForTimeout(300);

const espWin = await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
  return g.save.coins;
});
// відбиваємо орди → арена → бос → перемога
let unlocked = false;
const tH = Date.now();
while (Date.now() - tH < 60000 * SLOW) {
  const stH = await page.evaluate(() => ({
    active: window.__game.level.zombies.hordeActive,
    unlocked: window.__game.level.missions.bossUnlocked,
  }));
  if (stH.unlocked) { unlocked = true; break; }
  await page.evaluate(() => window.__game.test.finishHorde());
  await page.waitForTimeout(400);
}
check(unlocked, 'арена боса відкрилась');
await page.evaluate(() => { const a = window.__game.level.world.layout.arena; window.__game.test.teleport(a.x, a.z); });
await waitFor(page, () => window.__game.level.missions.bossStarted, 30000, 'бос вийшов');
const coinsBefore = await page.evaluate(() => window.__game.save.coins);
await page.evaluate(() => window.__game.test.damageBoss(999999));
const win = await waitFor(page, () => window.__game.victoryShown, 30000, 'перемога');
check(win, 'ESP звільнено!');
const st = await page.evaluate(() => ({ coins: window.__game.save.coins, weapons: window.__game.test.state().player.weapons }));
check(!st.weapons.includes('flamethrower'), 'звільнення ESP НЕ дало вогнемет');
check(st.coins >= coinsBefore + 600, `звільнення ESP дало +600 монет (${coinsBefore} → ${st.coins})`);

// ===== (г) зомбі 'imp' (Шкет) =====
console.log('▸ 🧟 Шкет (imp)');
const imp = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  p.respawnProtect = 1e9;
  const z = Z.spawn('imp', p.pos.x + 10, p.pos.z, {});
  z.aggroed = true; z.state = 'chase';
  return {
    baseHp: z.stats.hp, chaseSpeed: z.stats.chaseSpeed, runnerChase: 5.6,
    ztype: z.rig.ztype, small: !!z.stats.small,
  };
});
check(imp.baseHp === 50, `шкет: 50 HP (${imp.baseHp})`);
check(imp.chaseSpeed > imp.runnerChase, `шкет швидший за бігуна (chase ${imp.chaseSpeed} > ${imp.runnerChase})`);
check(imp.ztype === 'imp' && imp.small, 'шкет має власний дрібний риг (small)', imp.ztype);

// imp доступний з УСІХ країн — стартуємо UKR і перевіряємо, що тип дозволено в populate
await page.evaluate(() => { window.__game.save.liberated = {}; });
await page.evaluate(() => window.__game.startLevel('UKR'));
await waitFor(page, () => window.__game.state === 'level' && window.__game.level
  && window.__game.level.countryId === 'UKR'
  && !document.getElementById('overlay-level-loading').classList.contains('show'), 30000, 'рівень UKR');
const impUkr = await page.evaluate(() => {
  // imp дозволений усюди: безпосередньо спавнимо в UKR і переконуємось, що тип валідний
  const z = window.__game.level.zombies.spawn('imp', 0, 0, {});
  return { ok: z.type === 'imp', country: window.__game.level.countryId };
});
check(impUkr.ok && impUkr.country === 'UKR', 'шкет доступний навіть в Україні (UKR)');

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  fail += errors.length;
}
console.log(fail === 0 ? '🎉 ЗБРОЯ ЗА ЗІРКОВИЙ РІВЕНЬ + ШКЕТ — OK' : `💥 ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail === 0 ? 0 : 1);
