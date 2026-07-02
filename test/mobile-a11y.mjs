import { readFileSync } from 'fs';
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const root = new URL('..', import.meta.url);
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, extra);
  if (!ok) failed++;
};

console.log('▸ Mobile a11y: static PWA and live-region semantics');
const index = readFileSync(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

check(/id="banner"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/.test(index),
  'banner exposes polite atomic status semantics');
check(/id="toasts"[^>]*role="status"[^>]*aria-live="polite"/.test(index),
  'toast stack exposes polite status semantics');
check(/id="weapon-wheel"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="weapon-wheel-title"/.test(index),
  'weapon wheel is labelled as a modal dialog');
check(!/кампанія 6 країн/i.test(manifest.description),
  'manifest description no longer says 6 countries', manifest.description);
check(/12 країн/i.test(manifest.description) && /фінальн/i.test(manifest.description),
  'manifest description reflects current campaign scale', manifest.description);

console.log('▸ Mobile a11y: weapon wheel labels, escape close, focus return');
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&touch&country=UKR`);
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.touch, null, { timeout: 30000 });
const wheelState = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  for (const id of ['rifle', 'shotgun']) p.giveWeapon(id, false);
  document.getElementById('tb-weapon').focus();
  g.touch._openWheel();
  const buttons = [...document.querySelectorAll('#weapon-wheel-grid .ww-item')];
  const opened = {
    wheelHidden: document.getElementById('weapon-wheel').getAttribute('aria-hidden'),
    activeId: document.activeElement && document.activeElement.dataset.weapon,
    labels: buttons.map((b) => b.getAttribute('aria-label')),
  };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return {
    ...opened,
    closedHidden: document.getElementById('weapon-wheel').getAttribute('aria-hidden'),
    focusReturned: document.activeElement && document.activeElement.id,
  };
});

check(wheelState.wheelHidden === 'false', 'weapon wheel opens for assistive tech', JSON.stringify(wheelState));
check(wheelState.activeId === 'pistol', 'current weapon receives focus on open', JSON.stringify(wheelState));
check(wheelState.labels.length >= 3 && wheelState.labels.every((s) => /Зброя: .+/.test(s || '')),
  'weapon buttons have explicit aria-labels', JSON.stringify(wheelState.labels));
check(wheelState.closedHidden === 'true', 'Escape closes weapon wheel', JSON.stringify(wheelState));
check(wheelState.focusReturned === 'tb-weapon', 'closing weapon wheel returns focus to trigger', JSON.stringify(wheelState));

const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`, realErrors.slice(0, 2).join('|'));

await browser.close();
closeServer();
console.log(failed === 0 ? '🎉 MOBILE A11Y OK' : `❌ MOBILE A11Y FAILURES: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
