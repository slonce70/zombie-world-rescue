// Скріншот-хелпер: вантажить URL у заданому вʼюпорті й зберігає PNG.
// Обхід зламаного preview-MCP — Playwright рендерить гру у headless Chromium.
// node test/_shot.mjs <url> <w> <h> <out.png> [waitMs]
import { chromium } from 'playwright';
const [url, w, h, out, waitMs] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await b.newContext({ viewport: { width: +w || 390, height: +h || 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await p.goto(url, { waitUntil: 'load' });
await p.waitForTimeout(+waitMs || 4500);
await p.screenshot({ path: out });
await b.close();
console.log('wrote', out, errs.length ? ('ERRORS: ' + errs.join(' | ')) : '(no page errors)');
