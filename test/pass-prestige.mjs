import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

await page.goto(`${BASE}/?test&fresh&lang=uk`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

const info = await page.evaluate(async () => {
  const { xpForLevel, PASS_MAX_LEVEL } = await import('/src/progress.js');
  const g = window.__game;
  let xp = 0;
  for (let n = 1; n < PASS_MAX_LEVEL; n++) xp += xpForLevel(n);
  g.save.xp = xp + 1200;
  g.renderPassPanel();
  g._showOverlay('overlay-pass');
  return {
    level: g.progress.level,
    prestige: g.progress.prestigeStars,
    text: document.getElementById('pass-progress').innerText.trim(),
  };
});

check(info.level === 40 && info.prestige === 2, 'тестовий сейв має 40 рівень і 2 ранги', JSON.stringify(info));
check(/Ранг Рятівника/.test(info.text) && /2/.test(info.text), 'Зоряний шлях показує Ранг Рятівника після максимуму', JSON.stringify(info));

await page.screenshot({ path: 'shots/pass-prestige.png', fullPage: true });
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
