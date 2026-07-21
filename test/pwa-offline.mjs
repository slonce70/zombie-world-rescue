import { readFileSync } from 'fs';
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, ctx, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1024, height: 768 } } });

let failed = 0;
const check = makeCheck(() => failed++);
const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
check(swSource.includes("'./src/ui/frontcopy.js'"), 'Front copy module is cached for offline play');

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
await page.waitForFunction(async () => {
  if (!navigator.serviceWorker) return false;
  const reg = await navigator.serviceWorker.ready;
  return !!reg.active;
}, null, { timeout: 30000 });

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
const state = await page.evaluate(() => ({ ...window.__game.test.state(), appVersion: window.__APP_VERSION }));

check(state.state === 'globe', 'offline PWA reload starts on globe', JSON.stringify({ state: state.state, version: state.appVersion }));

await page.click('#btn-menu');
await page.waitForFunction(() => document.getElementById('overlay-menu').classList.contains('show'), null, { timeout: 10000 });
const menuState = await page.evaluate(() => ({
  menu: document.getElementById('overlay-menu').classList.contains('show'),
  progressButton: !!document.getElementById('btn-progress'),
}));
check(menuState.menu && menuState.progressButton, 'offline menu surface opens', JSON.stringify(menuState));

await page.click('#btn-progress');
await page.waitForFunction(() => document.getElementById('overlay-progress').classList.contains('show'), null, { timeout: 10000 });
const progressState = await page.evaluate(() => ({
  menuClosed: !document.getElementById('overlay-menu').classList.contains('show'),
  progress: document.getElementById('overlay-progress').classList.contains('show'),
  status: document.getElementById('cloud-status').textContent,
}));
check(progressState.menuClosed && progressState.progress && /Хмара|Cloud|хмара/i.test(progressState.status),
  'offline progress/save surface opens', JSON.stringify(progressState));

await page.evaluate(() => document.querySelector('[data-close="overlay-progress"]').click());
await page.evaluate(() => window.__game.startLevel('UKR'));
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.level && window.__game.level.countryId === 'UKR',
  null, { timeout: 30000 });
const levelState = await page.evaluate(() => window.__game.test.state());
check(levelState.state === 'level' && levelState.country === 'UKR' && levelState.player,
  'offline starts simple country level', JSON.stringify({ state: levelState.state, country: levelState.country, player: !!levelState.player }));

const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.join('\n'));

await ctx.setOffline(false);
await closeTest();
process.exit(failed === 0 && realErrors.length === 0 ? 0 : 1);
