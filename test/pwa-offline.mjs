import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, extra);
  if (!ok) failed++;
};

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
const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.join('\n'));

await ctx.setOffline(false);
await browser.close();
closeServer();
process.exit(failed === 0 && realErrors.length === 0 ? 0 : 1);
