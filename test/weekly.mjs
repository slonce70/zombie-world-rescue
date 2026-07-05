// 🗓️ Випробування тижня: детермінізм id, множник ×3, одноразова недільна нагорода
// (+25💎), повторювана нагорода боса тижня, компас і бейджі на картках.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

// детермінізм: id тижня стабільні й з правильних пулів
const det = await page.evaluate(() => {
  const g = window.__game;
  return {
    mode: g.weeklyChallengeId(), mode2: g.weeklyChallengeId(),
    mod: g.weeklyModifierId(),
    boss: g.weeklyBossId(),
  };
});
check(det.mode === det.mode2 && typeof det.mode === 'string' && det.mode.length > 0, 'режим тижня стабільний', JSON.stringify(det));
check(['night', 'tough', 'swift', 'elite'].includes(det.mod), 'мутатор тижня з пулу', det.mod);
check(['radiation', 'ice', 'titan'].includes(det.boss), 'бос тижня валідний', det.boss);

// перемога в режимі тижня: монети ×3 і одноразові +25💎 (моки проти протухання опівночі)
await page.evaluate(() => {
  const g = window.__game;
  for (const id of ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY']) g.save.liberated[id] = true;
  g.save.xp = 999999; // за 40 рівнем пасса XP не дає монетних нагород
  g.saveGame();
  g._weekIndex = () => 1000;
  g.weeklyChallengeId = () => 'bank';
  g.weeklyModifierId = () => 'night';
  g.weeklyBossId = () => '__none';
  g.dailyChallengeId = () => '__none'; // день не має перекривати тиждень у цьому тесті
  g.test.startBank();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank, null, { timeout: 30000 });
const win1 = await page.evaluate(() => {
  const g = window.__game;
  const coins0 = g.save.coins;
  const cr0 = g.save.crystals || 0;
  g.level.stats.time = 90;
  g._endBankRun(true);
  return {
    dCoins: g.save.coins - coins0,
    dCr: (g.save.crystals || 0) - cr0,
    flag: !!g.save.weekly['W1000:mode'],
    weeklyModOnBank: g.level.weeklyMod, // кімнатний режим НЕ отримує мутатор кампанії
  };
});
check(win1.dCoins === 375, 'перемога тижня потроїла монети (125→375)', JSON.stringify(win1.dCoins));
check(win1.dCr === 25, 'перша перемога тижня дала +25 кристалів', JSON.stringify(win1.dCr));
check(win1.flag, 'флаг недільної нагороди W1000:mode встановлено');
check(win1.weeklyModOnBank === null, 'мутатор тижня не чіпає кімнатний режим', String(win1.weeklyModOnBank));

// друга перемога того ж тижня: ×3 лишається, кристали більше не даються
const win2 = await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startBank();
  return true;
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank && !window.__game.level.bank.over, null, { timeout: 30000 });
const win2res = await page.evaluate(() => {
  const g = window.__game;
  const coins0 = g.save.coins;
  const cr0 = g.save.crystals || 0;
  g.level.stats.time = 95;
  g._endBankRun(true);
  return { dCoins: g.save.coins - coins0, dCr: (g.save.crystals || 0) - cr0 };
});
check(win2res.dCoins === 375, 'повторна перемога тижня теж ×3', JSON.stringify(win2res.dCoins));
check(win2res.dCr === 0, 'кристали тижня — лише раз на тиждень', JSON.stringify(win2res.dCr));

// бос тижня: нагорода повторюється раз на тиждень (firstClear уже спожито)
const boss1 = await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.weeklyBossId = () => 'radiation';
  g.save.worldBosses = { radiation: true }; // одноразову нагороду вже взято раніше
  return g.test.startWorldBoss('radiation');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.worldBoss, null, { timeout: 30000 });
const bossRes = await page.evaluate(() => {
  const g = window.__game;
  const coins0 = g.save.coins;
  const cr0 = g.save.crystals || 0;
  g._endWorldBossRun(true);
  return {
    dCoins: g.save.coins - coins0,
    dCr: (g.save.crystals || 0) - cr0,
    flag: !!g.save.weekly['W1000:boss'],
  };
});
check(bossRes.dCoins === 800 && bossRes.dCr === 10 && bossRes.flag, 'бос тижня видав повторну нагороду (800🪙/10💎)', JSON.stringify(bossRes));

const boss2 = await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  return g.test.startWorldBoss('radiation');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.worldBoss && !window.__game.level.worldBoss.over, null, { timeout: 30000 });
const boss2res = await page.evaluate(() => {
  const g = window.__game;
  const coins0 = g.save.coins;
  const cr0 = g.save.crystals || 0;
  g._endWorldBossRun(true);
  return { dCoins: g.save.coins - coins0, dCr: (g.save.crystals || 0) - cr0 };
});
check(boss2res.dCoins === 0 && boss2res.dCr === 0, 'повторний бос того ж тижня — без нагороди', JSON.stringify(boss2res));

// компас: поки недільну нагороду не взято → 🗓️; після — 🎯 (день)
const compass = await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  const { CAMPAIGN_ORDER } = await import('/src/countries.js');
  for (const id of CAMPAIGN_ORDER) g.save.liberated[id] = true;
  g.save.liberated.LOST = true;
  g.save.liberated.LAB = true; // Глава 3 пройдена — інакше компас веде в неї, не у тиждень
  g.save.infected = { cleared: { A: 1, B: 1, C: 1 }, done: true };
  g.quests.list.forEach((q) => { q.done = true; }); // завдання дня виконані — інакше компас (v277) веде в них, а не у тиждень
  g.dailyChallengeId = () => 'knockout';
  const after = g._nextActionInfo(); // W1000:mode вже стоїть → мусить бути daily
  delete g.save.weekly['W1000:mode'];
  const before = g._nextActionInfo();
  return { beforeIcon: before.icon, afterIcon: after.icon };
});
check(compass.beforeIcon === '🗓️', 'компас кличе у випробування тижня, поки нагороду не взято', compass.beforeIcon);
check(compass.afterIcon === '🎯', 'після недільної нагороди компас повертається до дня', compass.afterIcon);

// бейджі: картка режиму тижня 🗓️ ×3, картка кампанії — чип мутатора
const badges = await page.evaluate(() => {
  const g = window.__game;
  g.renderSoloMenu();
  const bank = document.querySelector('.solo-mode[data-mode="bank"]');
  const camp = document.querySelector('.solo-mode[data-mode="campaign"]');
  return {
    weeklyClass: bank.classList.contains('weekly'),
    weeklyBadge: !!bank.querySelector('.sm-weekly'),
    campChip: (camp.querySelector('.sm-weekly') || {}).textContent || '',
  };
});
check(badges.weeklyClass && badges.weeklyBadge, 'картка режиму тижня підсвічена 🗓️');
check(badges.campChip.includes('🌙'), 'картка кампанії показує чип мутатора тижня', badges.campChip);

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 WEEKLY OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
