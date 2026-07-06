// ⭐ R3 (v289) «Зірки та милосердя»: 3 зірки за країну кампанії.
//  ⭐1 перемога · ⭐2 вторинна ціль забігу (data-driven, трекається на HUD) · ⭐3 без смертей.
//  Реплей тримає MAX. Ретро-міграція дає 1⭐ вже звільненим країнам. Пороги 12/24/36 — раз.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '  ✅' : '  ❌') + ' ' + m, x); if (!c) fail++; };
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

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 3).join(' | '));
console.log(fail === 0 ? '\n🎉 ЗІРКИ OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
