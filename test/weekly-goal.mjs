// 🗓️ Ціль тижня «300 зомбі → 💎 25»: лічильник, поріг, forward-only reset, freeze, UI
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });

let failed = 0;
const check = (ok, msg, detail = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, detail);
  if (!ok) failed++;
};

async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(200);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

console.log('▸ Старт UKR — рівень із живими зомбі');
await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000 * SLOW, 'рівень UKR');
await waitFor(page, async () => (await page.evaluate(() => {
  const g = window.__game;
  return g.level && g.level.zombies && g.level.zombies.list.some((z) => z.state !== 'dead');
})), 15000 * SLOW, 'живі зомбі');

// нейтралізуємо челенджі, щоб винагороди паса не заважали
await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
  g.save.xp = 999999;
});

console.log('▸ 1. Реальний кіл зомбі → n===1, week === _weekIndex(), claimed false');
let r = await page.evaluate(() => {
  const g = window.__game;
  g.save.weeklyGoal = { week: -1, n: 0, claimed: false };
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead' && zz.type !== 'boss');
  z.damage(999999, null, false); // фіктивна шкода → zombieKilled → _bumpWeeklyGoal
  return { n: g.save.weeklyGoal.n, week: g.save.weeklyGoal.week, wi: g._weekIndex(), claimed: g.save.weeklyGoal.claimed };
});
check(r.n === 1, '1: n === 1 після кіла', JSON.stringify(r));
check(r.week === r.wi, '1: week === _weekIndex()', JSON.stringify(r));
check(r.claimed === false, '1: claimed === false', JSON.stringify(r));

console.log('▸ 2. n=299 → кіл → claimed, +25💎 рівно');
r = await page.evaluate(() => {
  const g = window.__game;
  g.save.weeklyGoal = { week: g._weekIndex(), n: 299, claimed: false };
  const x0 = g.save.crystals;
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead' && zz.type !== 'boss');
  z.damage(999999, null, false);
  return { claimed: g.save.weeklyGoal.claimed, dCry: g.save.crystals - x0, n: g.save.weeklyGoal.n };
});
check(r.claimed === true, '2: claimed === true на 300-му', JSON.stringify(r));
check(r.dCry === 25, '2: рівно +25💎', JSON.stringify(r));

console.log('▸ 3. Ще кіл → claimed лишається, кристали без змін');
r = await page.evaluate(() => {
  const g = window.__game;
  const x0 = g.save.crystals;
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead' && zz.type !== 'boss');
  z.damage(999999, null, false);
  return { claimed: g.save.weeklyGoal.claimed, dCry: g.save.crystals - x0 };
});
check(r.claimed === true, '3: claimed лишається true', JSON.stringify(r));
check(r.dCry === 0, '3: жодних додаткових кристалів', JSON.stringify(r));

console.log('▸ 4. Rollover: минулий тиждень claimed → кіл → {week:current, n:1, claimed:false}');
r = await page.evaluate(() => {
  const g = window.__game;
  g.save.weeklyGoal = { week: g._weekIndex() - 1, n: 250, claimed: true };
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead' && zz.type !== 'boss');
  z.damage(999999, null, false);
  return { ...g.save.weeklyGoal, wi: g._weekIndex() };
});
check(r.week === r.wi && r.n === 1 && r.claimed === false, '4: forward-only reset нового тижня', JSON.stringify(r));

console.log('▸ 5. Clock-back freeze: week на +1 (межа толерантності) → кіл не змінює обʼєкт');
r = await page.evaluate(() => {
  const g = window.__game;
  const future = { week: g._weekIndex() + 1, n: 42, claimed: false };
  g.save.weeklyGoal = { ...future };
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead' && zz.type !== 'boss');
  z.damage(999999, null, false);
  return { after: g.save.weeklyGoal, expect: future };
});
check(r.after.week === r.expect.week && r.after.n === r.expect.n && r.after.claimed === r.expect.claimed,
  '5: +1 тиждень (у межах толерантності) → freeze (обʼєкт не змінився)', JSON.stringify(r));

console.log('▸ 5b. Самолікування битого годинника: week +5 (поза толерантністю) → реініт {current, 1, false}');
r = await page.evaluate(() => {
  const g = window.__game;
  g.save.weeklyGoal = { week: g._weekIndex() + 5, n: 42, claimed: false };
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead' && zz.type !== 'boss');
  z.damage(999999, null, false);
  return { ...g.save.weeklyGoal, wi: g._weekIndex() };
});
check(r.week === r.wi && r.n === 1 && r.claimed === false,
  '5b: week +5 → реініт на поточний тиждень, цей кіл n===1', JSON.stringify(r));

console.log('▸ 5c. Junk n → sanitize-on-read коерсить у число перед інкрементом');
r = await page.evaluate(() => {
  const g = window.__game;
  g.save.weeklyGoal = { week: g._weekIndex(), n: 'junk', claimed: false };
  const z = g.level.zombies.list.find((zz) => zz.state !== 'dead' && zz.type !== 'boss');
  z.damage(999999, null, false);
  return { n: g.save.weeklyGoal.n, typeN: typeof g.save.weeklyGoal.n };
});
check(r.typeN === 'number' && r.n >= 1, '5c: лічильник живий і числовий після junk', JSON.stringify(r));

console.log('▸ 6. UI: на глобусі #weekly-goal видно, текст відповідає n/300');
await page.evaluate(() => {
  const g = window.__game;
  if (g.level) g.endLevel();
  g.save.weeklyGoal = { week: g._weekIndex(), n: 137, claimed: false };
  g._showGlobeUI(true);
});
await waitFor(page, async () => (await page.evaluate(() => window.__game.state)) === 'globe', 15000 * SLOW, 'глобус');
r = await page.evaluate(() => {
  const el = document.getElementById('weekly-goal');
  return {
    display: el ? getComputedStyle(el).display : 'none',
    label: el ? el.querySelector('.wg-label').textContent : '',
    fill: el ? el.querySelector('.wg-fill').style.width : '',
  };
});
check(r.display !== 'none', '6: #weekly-goal видно на глобусі', JSON.stringify(r));
check(r.label.includes('137/300'), '6: текст містить 137/300', JSON.stringify(r));

console.log('▸ JS-помилки');
check(errors.length === 0, `без JS-помилок (${errors.slice(0, 3).join(' | ')})`);

await ctx.close();
console.log(failed === 0 ? '✅ weekly-goal pass' : `❌ weekly-goal failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
