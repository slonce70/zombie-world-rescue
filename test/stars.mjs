// ⭐ R3 (v289) «Зірки та милосердя»: 3 зірки за країну кампанії.
//  ⭐1 перемога · ⭐2 вторинна ціль забігу (data-driven, трекається на HUD) · ⭐3 без смертей.
//  Реплей тримає MAX. Ретро-міграція дає 1⭐ вже звільненим країнам. Пороги 12/24/36 — раз.
import { makeCheck } from './_browser.mjs';
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = makeCheck(() => fail++);
const errors = [];

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function startRun(country, secondary = null) {
  await page.evaluate(({ c, sec }) => {
    const g = window.__game;
    if (g.level) g.endLevel();
    g._forceSecondary = sec;
    g.victoryShown = false;
    g.startLevel(c);
  }, { c: country, sec: secondary });
  await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && !!window.__game.level.missions, null, { timeout: 30000 });
  await page.waitForTimeout(150);
}

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// ---------- вторинна ціль існує лише у соло-кампанії ----------
console.log('▸ Вторинна ціль (⭐2) виставляється у соло-кампанії');
await startRun('UKR', 'headshots');
const so = await page.evaluate(() => window.__game.test.secondaryState());
check(so && so.id === 'headshots' && so.target === 10 && so.done === false, 'forceSecondary=headshots → ціль 0/10', JSON.stringify(so));

// ---------- ⭐2 трекається живими подіями і зараховується ----------
console.log('▸ ⭐2 трекається (10 хедшотів) і тікає до done');
const tracked = await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 9; i++) g.level.bus.emit('hitmarker', true);
  const at9 = g.test.secondaryState();
  g.level.bus.emit('hitmarker', true); // 10-й
  const at10 = g.test.secondaryState();
  return { at9, at10 };
});
check(tracked.at9.progress === 9 && !tracked.at9.done, 'після 9 хедшотів — 9/10, ще не done', JSON.stringify(tracked.at9));
check(tracked.at10.progress === 10 && tracked.at10.done, 'після 10 — done', JSON.stringify(tracked.at10));

console.log('▸ HUD показує чип вторинної цілі (і жодного «easy mode» тексту)');
const hud = await page.evaluate(() => {
  const g = window.__game;
  g.hud.update(0.016);
  const el = document.getElementById('mission-list');
  const chip = el ? el.querySelector('.mission.secondary') : null;
  return { has: !!chip, text: chip ? chip.textContent.trim() : '', done: chip ? chip.classList.contains('done') : false };
});
check(hud.has && /10\/10/.test(hud.text), 'чип ⭐2 у mission-list з прогресом', JSON.stringify(hud));
check(hud.done, 'чип позначено виконаним (✅)', JSON.stringify(hud));

// ---------- ⭐1 + ⭐2 + ⭐3 на перемозі (flawless, ціль виконана) ----------
console.log('▸ Перемога: ⭐1 + ⭐2 (ціль done) + ⭐3 (без смертей) = 3');
const win3 = await page.evaluate(() => {
  const g = window.__game;
  g.level.secondaryObjective.done = true;
  g.level.stats.deaths = 0;
  g.victoryShown = false;
  g._showVictory();
  const box = document.getElementById('victory-stars');
  return {
    stars: g.test.starState().stars,
    total: g.test.starState().total,
    earnedInPopup: box ? box.querySelectorAll('.vstar.earned').length : -1,
    popupShown: box ? box.innerHTML.length > 0 : false,
  };
});
check(win3.stars.UKR === 3, '⭐ UKR = 3', JSON.stringify(win3.stars));
check(win3.earnedInPopup === 3, 'попап показує 3 зароблені зірки', String(win3.earnedInPopup));

// ---------- лише ⭐1 (ціль не виконана, була смерть) ----------
console.log('▸ Перемога зі смертю і без цілі → лише ⭐1 (але MAX не втрачається)');
const win1 = await page.evaluate(() => {
  const g = window.__game;
  g.save.stars = {};                 // чистимо для чистоти асерту цього забігу
  return (async () => {
    if (g.level) g.endLevel();
    g._forceSecondary = 'megabox';
    g.victoryShown = false;
    g.startLevel('UKR');
  })();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
const only1 = await page.evaluate(() => {
  const g = window.__game;
  g.level.secondaryObjective.done = false;
  g.level.stats.deaths = 2;
  g.victoryShown = false;
  g._showVictory();
  return g.test.starState().stars.UKR;
});
check(only1 === 1, 'ціль не виконана + смерть → ⭐1', String(only1));

console.log('▸ Реплей ТРИМАЄ MAX (гірший забіг не забирає зірки)');
await startRun('UKR', 'megabox');
const maxKept = await page.evaluate(() => {
  const g = window.__game;
  g.save.stars.UKR = 3;               // ветеран уже має 3
  g.level.secondaryObjective.done = false;
  g.level.stats.deaths = 5;           // жахливий забіг
  g.victoryShown = false;
  g._showVictory();
  return g.test.starState().stars.UKR;
});
check(maxKept === 3, 'слабший реплей не зменшив зірки (MAX=3)', String(maxKept));

// ---------- ⭐2 інші типи цілей досяжні ----------
console.log('▸ ⭐2: тип «coins» тікається через addCoins');
await startRun('UKR', 'coins');
const coinsObj = await page.evaluate(() => {
  const g = window.__game;
  const s0 = g.test.secondaryState();
  g.level.addCoins(s0.target);
  return { s0, s1: g.test.secondaryState() };
});
check(coinsObj.s0.id === 'coins' && coinsObj.s1.done, 'ціль «монети» виконується від addCoins', JSON.stringify(coinsObj.s1));

console.log('▸ ⭐2: тип «elites» тікається від убитих елітних зомбі');
await startRun('UKR', 'elites');
const elitesObj = await page.evaluate(() => {
  const g = window.__game;
  const list = g.level.zombies.spawnEliteWave(4);
  for (const z of list) { z.shieldHp = 0; z.damage(999999, { x: 1, z: 0 }, false); }
  g.level.zombies.update(0.05);
  return g.test.secondaryState();
});
check(elitesObj.id === 'elites' && elitesObj.done, 'ціль «еліти» виконується від убивств елітних', JSON.stringify(elitesObj));

// ---------- пороги 12/24/36 — раз ----------
console.log('▸ Поріг 12⭐ → +500 монет, видається РІВНО раз');
await startRun('UKR', 'megabox');
const thr = await page.evaluate(() => {
  const g = window.__game;
  g.save.stars = { POL: 3, DEU: 3, FRA: 3, ESP: 2 }; // 11 зірок
  g.save.starClaims = [];
  const coinsBefore = g.save.coins;
  // перша перемога UKR → total ≥ 12 → поріг
  g.level.secondaryObjective.done = false;
  g.level.stats.deaths = 1;
  g.victoryShown = false;
  g._showVictory();
  const afterFirst = { coins: g.save.coins, claims: [...g.save.starClaims], total: g.test.starState().total };
  return { coinsBefore, afterFirst };
});
check(thr.afterFirst.total >= 12, 'сумарно ≥ 12 зірок після перемоги', String(thr.afterFirst.total));
check(thr.afterFirst.claims.includes(12), 'поріг 12 позначено виданим', JSON.stringify(thr.afterFirst.claims));
check(thr.afterFirst.coins - thr.coinsBefore >= 500, 'нараховано ≥ 500 монет за поріг', String(thr.afterFirst.coins - thr.coinsBefore));

const thr2 = await page.evaluate(() => {
  const g = window.__game;
  if (g.level) g.endLevel();
  g._forceSecondary = 'megabox';
  g.victoryShown = false;
  g.startLevel('UKR');
  return true;
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
const thrOnce = await page.evaluate(() => {
  const g = window.__game;
  const coinsBefore = g.save.coins;
  g.level.secondaryObjective.done = false;
  g.level.stats.deaths = 1;
  g.victoryShown = false;
  g._showVictory();
  return { claims: [...g.save.starClaims], delta: g.save.coins - coinsBefore };
});
check(thrOnce.claims.filter((n) => n === 12).length === 1, 'поріг 12 у claims рівно раз (не дублюється)', JSON.stringify(thrOnce.claims));
check(thrOnce.delta < 500, 'повторна перемога НЕ дає +500 знову', String(thrOnce.delta));

// ---------- ретро-міграція: старий сейв без stars → 1⭐ звільненим ----------
console.log('▸ Ретро-міграція: 1⭐ кожній вже звільненій країні кампанії');
const rp = await ctx.newPage();
rp.on('pageerror', (e) => errors.push('PAGEERROR(migrate): ' + e.message));
await rp.addInitScript((raw) => { try { localStorage.setItem('zr-save-v1', raw); } catch (e) {} },
  JSON.stringify({ liberated: { UKR: true, POL: true, DEU: true }, weapons: ['pistol'] }));
await rp.goto(`${BASE}/?test`);
await rp.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
const migrated = await rp.evaluate(() => ({ stars: { ...(window.__game.save.stars || {}) } }));
check(migrated.stars.UKR === 1 && migrated.stars.POL === 1 && migrated.stars.DEU === 1,
  'звільнені країни дістали 1⭐', JSON.stringify(migrated.stars));

const globeStar = await rp.evaluate(() => document.getElementById('star-total') ? document.getElementById('star-total').textContent : null);
check(globeStar === '3/36', 'лічильник глобуса «⭐ 3/36»', String(globeStar));
await rp.close();

// ---------- 🧟 Заражений забіг (глава 2) НЕ дає зірок/порогів і НЕ чіпає милосердя (v294) ----------
console.log('▸ Заражений win на UKR → без зірок, без порогів 12/24/36, mercyDeaths недоторканий');
await page.evaluate(async () => {
  const g = window.__game;
  if (g.level) g.endLevel();
  g.save.stars = { POL: 3, DEU: 3, FRA: 3, ESP: 3 }; // 12 сумарно — але UKR-win НЕ має додати поріг
  g.save.starClaims = [];
  g.save.mercyDeaths = { cid: 'UKR', n: 2 };         // активне милосердя на UKR
  g.save.infected = { cleared: {}, done: false };
  g.victoryShown = false;
  await g.startLevel('UKR', { infected: true }); // прямий заражений забіг (без гейта розблокування Глави 2)
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.infected, null, { timeout: 30000 });
const infRes = await page.evaluate(() => {
  const g = window.__game;
  g.level.stats.deaths = 0;      // ідеальний забіг — усе одно без зірок
  g.victoryShown = false;
  g._showVictory();
  return {
    hasSecondary: !!g.level.secondaryObjective,
    net: g.level.net,
    starUKR: (g.save.stars || {}).UKR,
    claims: [...(g.save.starClaims || [])],
    mercy: g.save.mercyDeaths ? { ...g.save.mercyDeaths } : null,
  };
});
check(!infRes.hasSecondary && infRes.net === null, 'заражений забіг — solo, без secondaryObjective (гейт зірок)', JSON.stringify(infRes));
check(infRes.starUKR === undefined, 'UKR НЕ отримала зірок за зараження', JSON.stringify(infRes.starUKR));
check(infRes.claims.length === 0, 'жоден поріг 12/24/36 не нараховано (claims порожній)', JSON.stringify(infRes.claims));
check(infRes.mercy && infRes.mercy.cid === 'UKR' && infRes.mercy.n === 2, 'mercyDeaths недоторканий (зараження не скидає)', JSON.stringify(infRes.mercy));

// ---------- v750: пул виріс до 14, важкі цілі гейтяться зіркою складності ----------
console.log('▸ v750: пул цілей у живій сторінці — 14, ★1 лишився дитячим');
const pools = await page.evaluate(async () => {
  const m = await import('/src/stars.js');
  return {
    all: m.secondaryPool(5).map((o) => o.id),
    easy: m.secondaryPool(1).map((o) => o.id),
    coop: [...m.COOP_SECONDARY_IDS],
  };
});
check(pools.all.length === 14, 'пул на ★5 — 14 цілей', String(pools.all.length));
check(pools.easy.length === 7 && !pools.easy.includes('flawless') && !pools.easy.includes('nogadget'),
  '★1 — 7 дитячих цілей, важких нема', JSON.stringify(pools.easy));
check(pools.easy.every((id) => pools.all.includes(id)), 'пул кумулятивний (★1 ⊂ ★5)');
check(pools.coop.every((id) => pools.all.includes(id)) && !pools.coop.includes('coins') && !pools.coop.includes('headshots'),
  'кооп-пул — лише хост-авторитетні цілі', JSON.stringify(pools.coop));

console.log('▸ v750: на ★1 забіг отримує ціль саме з дитячого пулу');
await page.evaluate(() => { window.__game.save.diffStar = 1; });
await startRun('UKR', null);
const easyPick = await page.evaluate(() => ({
  id: window.__game.test.secondaryState().id,
  star: window.__game.level.diffStar,
}));
check(easyPick.star === 1 && pools.easy.includes(easyPick.id),
  'ціль ★1-забігу з дитячого пулу', JSON.stringify(easyPick));

console.log('▸ v750: «Прокатись на самокаті» зараховується подією поїздки');
await startRun('UKR', 'scooter');
const scooter = await page.evaluate(() => {
  const g = window.__game;
  const before = g.test.secondaryState();
  g.level.bus.emit('scooterRide');
  return { before, after: g.test.secondaryState() };
});
check(scooter.before.id === 'scooter' && !scooter.before.done && scooter.after.done,
  'ціль «самокат» 0/1 → done після поїздки', JSON.stringify(scooter));

console.log('▸ v750: «Підбери N припасів» тікає з пікапів (не з монет)');
await startRun('UKR', 'pickups');
const pickups = await page.evaluate(() => {
  const g = window.__game;
  g.level.effects.onPickup('coin', 10);          // монети — окрема ціль, не рахуються
  const afterCoin = g.test.secondaryState().progress;
  for (let i = 0; i < g.test.secondaryState().target; i++) g.level.effects.onPickup('ammo', 0);
  return { afterCoin, final: g.test.secondaryState() };
});
check(pickups.afterCoin === 0 && pickups.final.done, 'монета не рахується, припаси — так', JSON.stringify(pickups));

console.log('▸ v750: «Переможи N зомбі» тікає з убивств, але салют після боса не дарує ціль');
await startRun('UKR', 'kills');
const kills = await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 3; i++) g.level.bus.emit('zombieKilled', { type: 'walker' });
  const at3 = g.test.secondaryState();
  g.level.bossDefeated = true;                    // переможна зачистка карти
  for (let i = 0; i < 20; i++) g.level.bus.emit('zombieKilled', { type: 'walker' });
  return { at3, afterSweep: g.test.secondaryState() };
});
check(kills.at3.progress === 3, 'три вбивства — 3/N', JSON.stringify(kills.at3));
check(kills.afterSweep.progress === 3 && !kills.afterSweep.done,
  'зачистка після боса НЕ тікає ціль', JSON.stringify(kills.afterSweep));
// ⭐ нова ціль так само видима на HUD, як і стара (критерій тікета 09)
const killsChip = await page.evaluate(() => {
  const g = window.__game;
  g.hud.update(0.016);
  const el = document.getElementById('mission-list');
  const chip = el ? el.querySelector('.mission.secondary') : null;
  return chip ? chip.textContent.replace(/\s+/g, ' ').trim() : null;
});
check(!!killsChip && /3\/25/.test(killsChip) && /зомб/i.test(killsChip),
  'чип нової цілі з написом і прогресом на HUD', String(killsChip));

console.log('▸ v750: «Набери комбо ×N» вимірює найкраще комбо');
await startRun('UKR', 'combo');
const combo = await page.evaluate(() => {
  const g = window.__game;
  const target = g.test.secondaryState().target;
  for (let i = 0; i < target - 2; i++) g.level.bus.emit('zombieKilled', { type: 'walker' });
  const mid = g.test.secondaryState();
  g.level.combo.n = 0;                            // серія обірвалась
  const afterBreak = g.test.secondaryState();
  for (let i = 0; i < target; i++) g.level.bus.emit('zombieKilled', { type: 'walker' });
  return { target, mid, afterBreak, final: g.test.secondaryState() };
});
check(combo.mid.progress === combo.target - 2 && combo.afterBreak.progress === combo.mid.progress,
  'обрив серії не відкочує чип назад', JSON.stringify(combo));
check(combo.final.done, 'комбо дотягнуто до цілі', JSON.stringify(combo.final));

console.log('▸ v750: ціль-заперечення «Не купуй нічого в магазині» рахується на смерті боса');
await startRun('UKR', 'noshop');
const noshop = await page.evaluate(() => {
  const g = window.__game;
  g.victoryShown = true;                          // глушимо каскад перемоги — перевіряємо саму ціль
  g.level.coinsSpent = 250;                       // щось куплено за забіг
  g.level.bus.emit('bossDied', null);
  const spent = g.test.secondaryState();
  g.level.coinsSpent = 0;                         // «чистий» забіг
  g.level.bus.emit('bossDied', null);
  return { spent, clean: g.test.secondaryState() };
});
check(!noshop.spent.done, 'покупка за забіг ламає ціль', JSON.stringify(noshop.spent));
check(noshop.clean.done, 'без покупок ціль зараховується на смерті боса', JSON.stringify(noshop.clean));
// _onBossDied планує _showVictory через 2.4с — даємо таймеру згоріти під victoryShown=true,
// щоб він не сплив уже в наступному забігу
await page.waitForTimeout(2600);

console.log('▸ v750: «Не дай босу зачепити тебе» відкривається на старті боса й ламається ударом');
await startRun('UKR', 'flawless');
const flawless = await page.evaluate(() => {
  const g = window.__game;
  g.victoryShown = true;
  const beforeBoss = g.level.bossHitFree;
  g.level.bus.emit('bossStart');
  const opened = g.level.bossHitFree;
  g.level.bus.emit('playerHurt', { angle: 0 });
  g.level.bus.emit('bossDied', null);
  const hurt = g.test.secondaryState();
  g.level.bus.emit('bossStart');                  // нове вікно — герой цілий
  g.level.bus.emit('bossDied', null);
  return { beforeBoss, opened, hurt, clean: g.test.secondaryState() };
});
check(flawless.beforeBoss === undefined && flawless.opened === true,
  'вікно «без удару» відкривається саме на bossStart', JSON.stringify(flawless));
check(!flawless.hurt.done, 'удар по герою ламає ціль', JSON.stringify(flawless.hurt));
check(flawless.clean.done, 'цілий герой — ціль зарахована', JSON.stringify(flawless.clean));
await page.waitForTimeout(2600); // той самий гард на відкладений _showVictory

console.log('▸ v750: пороги 12/24/36 дають нову вагу нагороди');
const thresholds = await page.evaluate(async () => {
  const m = await import('/src/stars.js');
  return m.STAR_THRESHOLDS.map((th) => ({ at: th.at, coins: th.coins || 0, crystals: th.crystals || 0, title: th.title || null }));
});
check(JSON.stringify(thresholds) === JSON.stringify([
  { at: 12, coins: 2500, crystals: 0, title: null },
  { at: 24, coins: 0, crystals: 40, title: null },
  { at: 36, coins: 0, crystals: 100, title: 'star_savior' },
]), 'нагороди порогів: 2500 монет / 40💎 / титул + 100💎', JSON.stringify(thresholds));

const claimNew = await page.evaluate(() => {
  const g = window.__game;
  g.save.stars = { UKR: 3, POL: 3, DEU: 3, FRA: 3, ESP: 3, PRT: 3, ITA: 3, TUR: 3, SWE: 3, EGY: 3, JPN: 3, CHN: 3 };
  g.save.starClaims = [];
  g.save.titles = [];
  const coins = g.save.coins, crystals = g.save.crystals || 0;
  const claimed = g._claimStarThresholds();
  return {
    claimed: claimed.map((th) => th.at),
    coins: g.save.coins - coins,
    crystals: (g.save.crystals || 0) - crystals,
    titles: [...g.save.titles],
  };
});
check(JSON.stringify(claimNew.claimed) === JSON.stringify([12, 24, 36]), 'усі три пороги видано', JSON.stringify(claimNew.claimed));
check(claimNew.coins === 2500 && claimNew.crystals === 140, '36⭐ повна кампанія: +2500 монет і +140💎', JSON.stringify(claimNew));
check(claimNew.titles.includes('star_savior'), 'титул «Зоряний рятівник» нараховано', JSON.stringify(claimNew.titles));

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 3).join(' | '));
console.log(fail === 0 ? '\n🎉 ЗІРКИ OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
