// 🏅 Прогрес титулів: current/target у кожному записі, прогрес-бар у Гардеробі,
//    тост «майже досяг» (≥80%) на перемозі з тротлом раз-на-сесію.
import { chromium } from 'playwright';
import { waitFor as waitForAsync, makeCheck } from './_browser.mjs';
import { ensureWebServer } from './_server.mjs';

const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });

let failed = 0;
const check = makeCheck(() => failed++);

const waitFor = (page, fn, timeoutMs, label) => waitForAsync(fn, timeoutMs, label, 200);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

console.log('▸ Boot ?test&fresh&country=UKR — свіжий сейв, у рівні');
await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000 * SLOW, 'рівень');

// Нейтралізуємо челенджі, щоб їх нарахування не заважали перемозі/тостам
await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
});

console.log('▸ 1. Кожен титул має валідні current(save)→number і target>0');
const rows = await page.evaluate(async () => {
  const g = window.__game;
  const mod = await import('/src/titles.js');
  const out = [];
  for (const [id, meta] of Object.entries(mod.TITLES)) {
    let okCurrent = false;
    let curVal = null;
    try {
      curVal = meta.current(g.save);
      okCurrent = typeof curVal === 'number' && !Number.isNaN(curVal);
    } catch (e) {
      okCurrent = false;
      curVal = String(e && e.message || e);
    }
    const tgtVal = meta.target;
    const okTarget = typeof tgtVal === 'number' && tgtVal > 0;
    out.push({ id, okCurrent, okTarget, curVal, tgtVal });
  }
  return out;
});
check(rows.length > 0, '1: TITLES не порожній', JSON.stringify({ n: rows.length }));
for (const r of rows) {
  check(r.okCurrent, `1: ${r.id} — current(save) повертає число`, JSON.stringify({ curVal: r.curVal }));
  check(r.okTarget, `1: ${r.id} — target число > 0`, JSON.stringify({ tgtVal: r.tgtVal }));
}

console.log('▸ 2. «Майже досяг»: killed=554/555 → тост про «Зомбі кілер»');
await page.evaluate(() => {
  const g = window.__game;
  g.save.stats = g.save.stats || {};
  g.save.stats.killed = 554; // 554/555 ≈ 0.998 ≥ 0.8
  // ретельно прибрати вже виданий титул, якщо якось є
  g.save.titles = (g.save.titles || []).filter((id) => id !== 'zombie_killer');
  g._almostTitleToasts = undefined; // чистий тротл-стан для тесту
  g.victoryShown = false;
  g._showVictory();
});
await waitFor(page, async () => (await page.evaluate(() => document.getElementById('overlay-victory').classList.contains('show'))), 10000 * SLOW, 'overlay-victory show');

// невеличка пауза, щоб тост встиг додатися у DOM
await page.waitForTimeout(300);
const afterFirst = await page.evaluate(() => {
  const toasts = [...document.querySelectorAll('#toasts .toast, .toast')].map((el) => el.textContent);
  const killerToasts = toasts.filter((t) => t.includes('Зомбі кілер'));
  return {
    hasProgressToast: toasts.some((t) => t.includes('554/555') && t.includes('Зомбі кілер')),
    killerCount: killerToasts.length,
    sample: killerToasts,
  };
});
check(afterFirst.hasProgressToast, '2: тост «майже досяг» з 554/555 і «Зомбі кілер» зʼявився', JSON.stringify(afterFirst.sample));

console.log('▸ 3. Тротл: другий _showVictory НЕ дублює той самий тост');
await page.evaluate(() => {
  const g = window.__game;
  g.victoryShown = false; // метод рано виходить, якщо victoryShown === true
  g._showVictory();
});
await page.waitForTimeout(300);
const afterSecond = await page.evaluate(() => {
  const toasts = [...document.querySelectorAll('#toasts .toast, .toast')].map((el) => el.textContent);
  return { killerCount: toasts.filter((t) => t.includes('Зомбі кілер')).length };
});
check(afterSecond.killerCount === afterFirst.killerCount,
  '3: кількість тостів «Зомбі кілер» не зросла після 2-го виклику (тротл через Set)',
  JSON.stringify({ before: afterFirst.killerCount, after: afterSecond.killerCount }));

console.log('▸ 4. Гардероб: картка нерозблокованого «Зомбі кілер» показує 554/555');
const wardHasProgress = await page.evaluate(() => {
  const g = window.__game;
  g.renderWardrobe();
  const cards = [...document.querySelectorAll('.ward-card.locked[data-kind="title"]')];
  const card = cards.find((c) => c.dataset.id === 'zombie_killer');
  if (!card) return { found: false };
  const txt = card.textContent;
  const barTxt = card.querySelector('.ward-progress-text');
  return {
    found: true,
    hasProgressText: txt.includes('554/555'),
    barText: barTxt ? barTxt.textContent : null,
  };
});
check(wardHasProgress.found, '4: locked-картка титулу zombie_killer знайдена у Гардеробі', JSON.stringify(wardHasProgress));
check(wardHasProgress.hasProgressText, '4: картка містить прогрес 554/555', JSON.stringify(wardHasProgress));

console.log('▸ 5. JS-помилки');
check(errors.length === 0, `5: без JS-помилок (${errors.slice(0, 3).join(' | ')})`);

await ctx.close();
console.log(failed === 0 ? '✅ title-progress pass' : `❌ title-progress failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
