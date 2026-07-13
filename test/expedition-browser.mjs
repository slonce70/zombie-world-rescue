import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

let fail = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${msg}`, extra); if (!ok) fail++; };
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(`${BASE}/?test&fresh&seed=400`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.state === 'globe');
  await page.click('#btn-expedition');
  await page.waitForSelector('#overlay-expedition.show');
  const opened = await page.evaluate(() => ({ run: window.__game.save.expedition, text: document.querySelector('#expedition-route').textContent }));
  check(opened.run?.status === 'active' && opened.run?.step === 0, 'нова експедиція відкриває перший етап');
  check(opened.text.includes('Порятунок'), 'маршрут показує тип етапу');

  await page.click('#btn-expedition-go');
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.expedition);
  const first = await page.evaluate(() => ({ step: window.__game.level.expedition.step, build: window.__game.level.runBuild.ids }));
  check(first.step === 0 && Array.isArray(first.build), 'етап стартує з серіалізованою збіркою');

  await page.evaluate(() => window.__game._showVictory());
  await page.waitForSelector('#overlay-victory.show');
  await page.click('#btn-victory-next');
  await page.waitForSelector('#overlay-expedition.show');
  const choiceCount = await page.locator('#expedition-route button.expedition-node').count();
  check(choiceCount === 2, 'після перемоги доступні два маршрути');
  await page.locator('#expedition-route button.expedition-node').first().click();
  const chosen = await page.evaluate(() => window.__game.save.expedition);
  check(chosen.status === 'active' && chosen.step === 1 && chosen.build.length === 1, 'вибір маршруту зберігає картку й наступний етап');
  check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));
} finally {
  await browser.close();
  closeServer();
}

if (fail) process.exit(1);
console.log('\n🎉 ЕКСПЕДИЦІЯ У БРАУЗЕРІ ПРАЦЮЄ');
