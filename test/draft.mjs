// Оверлей «Прокачка» паузить симуляцію і застосовує обрану картку (соло-Шторм).
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
// Шторм стартуємо явно (URL ?storm НЕ обробляється; патерн із test/update4.mjs:317-324)
await page.evaluate(() => {
  // відкриваємо шторм: Україна звільнена (?fresh скидає save)
  const g = window.__game;
  g.save.liberated.UKR = true;
  g.saveGame();
});
await page.evaluate(() => window.__game.test.startStorm('UKR'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.storm, null, { timeout: 30000 });
await page.waitForTimeout(400);

// runBuild створено для соло-Шторму
const hasRb = await page.evaluate(() => !!window.__game.level.runBuild);
check(hasRb, 'runBuild створено в соло-Штормі');

// відкриваємо драфт напряму → оверлей показано, isOpen=true, 3 картки в DOM
const opened = await page.evaluate(() => {
  window.__game.draft.open();
  return {
    isOpen: window.__game.draft.isOpen,
    shown: document.getElementById('draft').classList.contains('show'),
    cards: document.querySelectorAll('#draft-grid .draft-card').length,
  };
});
check(opened.isOpen && opened.shown, 'драфт відкрито (isOpen + .show)', JSON.stringify(opened));
check(opened.cards === 3, 'у драфті рівно 3 картки', opened.cards);

// поки драфт відкрито — симуляція ЗАМЕРЗЛА (час рівня не тече за 2 кадри)
const frozen = await page.evaluate(async () => {
  const g = window.__game;
  const t0 = g.level.stats.time;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return g.level.stats.time === t0;
});
check(frozen, 'симуляція на паузі, поки драфт відкрито');

// тиснемо першу картку → стат гравця змінився, оверлей сховано, isOpen=false
const picked = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const snap = { dmg: p.damageMult, spd: p.speedMult, maxhp: p.maxHealth, nades: p.grenades, hp: p.health };
  g.level.player._snapBefore = snap;
  g.draft.pick(0);
  const changed = p.damageMult !== snap.dmg || p.speedMult !== snap.spd
    || p.maxHealth !== snap.maxhp || p.grenades !== snap.nades || p.health !== snap.hp;
  return { changed, isOpen: g.draft.isOpen, shown: document.getElementById('draft').classList.contains('show'), picks: g.level.runBuild.picks.length };
});
check(picked.changed, 'пік картки змінив стат гравця', JSON.stringify(picked));
check(!picked.isOpen && !picked.shown, 'після піку драфт закрито');
check(picked.picks === 1, 'runBuild зафіксував 1 пік', picked.picks);

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 DRAFT OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
