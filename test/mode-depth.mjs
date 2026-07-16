// 🏁 Глибина режимів: рекорди часу, лічильник перемог, віхи (кристали/титул),
// «випробування дня» ×2 і бейджі на картках соло-меню.
import { openBrowserTest } from './_browser.mjs';

let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, captureConsole: false, pageErrorPrefix: '' });

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

// dailyChallengeId детермінований і з пулу
const daily = await page.evaluate(() => {
  const g = window.__game;
  return { a: g.dailyChallengeId(), b: g.dailyChallengeId() };
});
check(daily.a === daily.b && typeof daily.a === 'string' && daily.a.length > 0, 'випробування дня стабільне протягом дня', JSON.stringify(daily));

// старт банку і перемога з форс-днем: монети ×2, перемога і рекорд записані
await page.evaluate(() => {
  const g = window.__game;
  for (const id of ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY']) g.save.liberated[id] = true;
  g.save.xp = 999999; // за 40 рівнем пасса XP не дає монетних нагород — тест лічить лише монети режиму
  // квести дня генеруються від ДАТИ: у «вдалий» день серед них є «збери N монет»,
  // і сама нагорода режиму закриває його (+120 через onEvent('coins') в addCoins) —
  // закриваємо всі квести заздалегідь, щоб точна лічба монет не залежала від календаря
  g.quests.list.forEach((q) => { q.done = true; });
  g.saveGame();
  g.dailyChallengeId = () => 'bank';
  g.weeklyChallengeId = () => '__none'; // щоб ×3 тижня не перекрив ×2 дня, коли пул збіжиться
  g.test.startBank();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank, null, { timeout: 30000 });
const winA = await page.evaluate(() => {
  const g = window.__game;
  const coins0 = g.save.coins;
  const modeShape = {
    modeId: g.level.modeId,
    noShop: g.level.noShop,
    noPickups: g.level.noPickups,
    noGadgets: g.level.noGadgets,
    loadout: [...g.level.player.weapons],
  };
  g.level.stats.time = 90; // 1:30
  g._endBankRun(true);
  return {
    modeShape,
    dCoins: g.save.coins - coins0,
    wins: g.save.modeWins.bank,
    best: g.save.modeBest.bank,
    statsHtml: document.getElementById('arena-stats').innerHTML.includes('🏆'),
  };
});
check(winA.modeShape.modeId === 'bank' && winA.modeShape.noShop && winA.modeShape.noPickups && winA.modeShape.noGadgets
  && JSON.stringify(winA.modeShape.loadout) === JSON.stringify(['staff', 'pistol']),
  'level.modeId і MODE_RULES задають правила Банку', JSON.stringify(winA.modeShape));
check(winA.dCoins === 250, 'випробування дня подвоїло монети (125→250)', JSON.stringify(winA.dCoins));
check(winA.wins === 1, 'перемога зарахована у modeWins', winA.wins);
check(winA.best === 90000, 'рекорд часу записано (90с)', winA.best);
check(winA.statsHtml, 'екран фіналу показує рядок рекорду');

// швидший забіг → новий рекорд; повільніший — не перетирає
const winB = await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startBank();
  return true;
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank && !window.__game.level.bank.over, null, { timeout: 30000 });
const rec = await page.evaluate(() => {
  const g = window.__game;
  g.level.stats.time = 60;
  g._endBankRun(true);
  return { best: g.save.modeBest.bank, badge: document.getElementById('arena-stats').innerHTML.includes('НОВИЙ РЕКОРД') };
});
check(rec.best === 60000 && rec.badge, 'швидший забіг оновив рекорд і показав бейдж', JSON.stringify(rec));

// віха 3 перемог → +10 кристалів; 10 перемог → титул «Охоронець банку»
const milestones = await page.evaluate(() => {
  const g = window.__game;
  const cr0 = g.save.crystals || 0;
  g.save.modeWins.bank = 2;
  g.endLevel();
  g.test.startBank();
  return cr0;
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank && !window.__game.level.bank.over, null, { timeout: 30000 });
const ms3 = await page.evaluate((cr0) => {
  const g = window.__game;
  g.level.stats.time = 120; // повільніше за рекорд 1:00 — не перетирає
  g._endBankRun(true);
  return { wins: g.save.modeWins.bank, dCr: (g.save.crystals || 0) - cr0, flag: !!g.save.modeRewards['bank:3'] };
}, milestones);
check(ms3.wins === 3 && ms3.dCr === 10 && ms3.flag, 'віха 3 перемог дала +10 кристалів (одноразово)', JSON.stringify(ms3));

const title10 = await page.evaluate(() => {
  const g = window.__game;
  g.save.modeWins.bank = 9;
  g.endLevel();
  g.test.startBank();
  return true;
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank && !window.__game.level.bank.over, null, { timeout: 30000 });
const t10 = await page.evaluate(() => {
  const g = window.__game;
  g.level.stats.time = 120;
  g._endBankRun(true);
  return { wins: g.save.modeWins.bank, hasTitle: g.save.titles.includes('bank_guard') };
});
check(t10.wins === 10 && t10.hasTitle, '10 перемог відкрили титул «Охоронець банку»', JSON.stringify(t10));

// картки соло-меню: бейдж дня і рядок рекорду
const cards = await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.renderSoloMenu();
  const bank = document.querySelector('.solo-mode[data-mode="bank"]');
  return {
    daily: bank.classList.contains('daily') && !!bank.querySelector('.sm-daily'),
    best: (bank.querySelector('.sm-best') || {}).textContent || '',
  };
});
check(cards.daily, 'картка дня підсвічена бейджем 🎯');
check(cards.best.includes('1:00'), 'картка показує рекорд 1:00', cards.best);

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 MODE-DEPTH OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail ? 1 : 0);
