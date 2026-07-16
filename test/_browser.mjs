import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

export async function openBrowserTest({
  viewport = { width: 1280, height: 800 },
  launch = { args: ['--use-angle=swiftshader'] },
  context = {},
  server = {},
  captureErrors = true,
  captureConsole = true,
  pageErrorPrefix = 'PAGEERROR: ',
} = {}) {
  const { base: BASE, close: closeServer } = await ensureWebServer(server);
  const browser = await chromium.launch(launch);
  const ctx = await browser.newContext({ viewport, ...context });
  const page = await ctx.newPage();
  const errors = [];
  if (captureErrors && captureConsole) page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (captureErrors) page.on('pageerror', (e) => errors.push(`${pageErrorPrefix}${e.message}`));
  const closeTest = async () => {
    await browser.close();
    closeServer();
  };
  return { BASE, browser, ctx, page, errors, closeTest };
}

export async function openCoopTest({
  relayPort,
  launch = { args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] },
  context = { viewport: { width: 1280, height: 800 } },
  server = {},
  captureErrors = true,
} = {}) {
  const { base: BASE, close: closeServer } = await ensureWebServer(server);
  const relay = await spawnRelay(relayPort);
  const [browserA, browserB] = await Promise.all([chromium.launch(launch), chromium.launch(launch)]);
  const [ctxA, ctxB] = await Promise.all([browserA.newContext(context), browserB.newContext(context)]);
  const [A, B] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
  const errors = [];
  if (captureErrors) for (const page of [A, B]) {
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
  }
  const closeTest = async () => {
    await Promise.allSettled([browserA.close(), browserB.close()]);
    relay.kill();
    closeServer();
  };
  return { BASE, RELAY: `ws://localhost:${relayPort}`, A, B, errors, closeTest };
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
