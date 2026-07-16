// 🎖️ Зоряний шлях: стеля 65 (v236), титул «Зоряний гравець» на фіналі,
// престиж-ранги після стелі, catch-up нагород 41..65 для легасі-сейвів.
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader'] }, context: { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }, captureErrors: false });
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&lang=uk`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

const info = await page.evaluate(async () => {
  const { xpForLevel, PASS_MAX_LEVEL } = await import('/src/progress.js');
  const g = window.__game;
  let xp = 0;
  for (let n = 1; n < PASS_MAX_LEVEL; n++) xp += xpForLevel(n);
  g.save.xp = xp + 1200;
  g.saveGame(); // syncTitles: предикат титулу спрацьовує від xp
  g.renderPassPanel();
  g._showOverlay('overlay-pass');
  return {
    cap: PASS_MAX_LEVEL,
    level: g.progress.level,
    prestige: g.progress.prestigeStars,
    hasTitle: g.save.titles.includes('star_player'),
    text: document.getElementById('pass-progress').innerText.trim(),
  };
});

check(info.cap === 65 && info.level === 65 && info.prestige === 2, 'стеля шляху 65, тестовий сейв на максимумі з 2 рангами', JSON.stringify(info));
check(/Ранг Рятівника/.test(info.text) && /2/.test(info.text), 'Зоряний шлях показує Ранг Рятівника після максимуму', JSON.stringify(info));
check(info.hasTitle, 'фінал шляху відкриває титул «Зоряний гравець»');

// catch-up: «легасі»-сейв (passLvl=null, xp вище стелі) отримує нагороди 41..65 одним махом
const backlog = await page.evaluate(() => {
  const g = window.__game;
  g.save.passLvl = null; // симулюємо сейв зі старої версії (до продовження шляху)
  const coins0 = g.save.coins;
  const cr0 = g.save.crystals || 0;
  g.progress.grantBacklog();
  return {
    dCoins: g.save.coins - coins0,
    dCr: (g.save.crystals || 0) - cr0,
    passLvl: g.save.passLvl,
    mineHyper: (g.save.gadgetHypers || []).includes('mine'),
  };
});
// монети 41..64: 1500+1600+...+3800 (без 45/50/55/60) = 50000;
// 45 = гіперзаряд міни (v246), кристали 50/55/60: 25+30+35 = 90
check(backlog.dCoins === 50000 && backlog.dCr === 90 && backlog.mineHyper && backlog.passLvl === 65,
  'catch-up видає нагороди 41..65 разом і фіксує passLvl', JSON.stringify(backlog));

// повторний виклик — нічого не дублює
const repeat = await page.evaluate(() => {
  const g = window.__game;
  const coins0 = g.save.coins;
  g.progress.grantBacklog();
  return g.save.coins - coins0;
});
check(repeat === 0, 'повторний grantBacklog нічого не дублює', String(repeat));

await page.screenshot({ path: 'shots/pass-prestige.png', fullPage: true });
await closeTest();
process.exit(failed === 0 ? 0 : 1);
