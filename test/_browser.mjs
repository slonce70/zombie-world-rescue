import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

export async function openBrowserTest({
  viewport = { width: 1280, height: 800 },
  launch = { args: ['--use-angle=swiftshader'] },
  context = {},
  server = {},
  captureConsole = true,
  pageErrorPrefix = 'PAGEERROR: ',
} = {}) {
  const { base: BASE, close: closeServer } = await ensureWebServer(server);
  const browser = await chromium.launch(launch);
  const ctx = await browser.newContext({ viewport, ...context });
  const page = await ctx.newPage();
  const errors = [];
  if (captureConsole) page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`${pageErrorPrefix}${e.message}`));
  const closeTest = async () => {
    await browser.close();
    closeServer();
  };
  return { BASE, browser, ctx, page, errors, closeTest };
}

export function makeCheck(onFailure) {
  return (ok, msg, extra = '') => {
    console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ` ${extra}` : ''}`);
    if (!ok) onFailure();
  };
}

export async function waitFor(fn, timeoutMs, label, intervalMs = 200) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await delay(intervalMs);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

export async function waitForPage(page, fn, timeoutMs, label) {
  try {
    await page.waitForFunction(fn, null, { timeout: timeoutMs, polling: 200 });
    return true;
  } catch {
    console.log(`  ⚠️ Таймаут: ${label}`);
    return false;
  }
}
