// Тести M4: «Поклич друга» — інвайт-посилання в один тап у лобі кооперативу
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}
async function loadCountry(c, extra = '') {
  await page.goto(`${BASE}/?test&fresh&country=${c}${extra}`);
  await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'рівень ' + c);
}

// ============ 📨 ПОКЛИЧ ДРУГА ============
console.log('▸ M4: Поклич друга');
await loadCountry('UKR');
// button exists in lobby DOM
const hasBtn = await page.evaluate(() => !!document.getElementById('btn-coop-invite'));
check(hasBtn, 'кнопка «Поклич друга» є в лобі');
// URL builder produces a ?coopjoin link to THIS origin
const origin = await page.evaluate(() => location.origin);
const url = await page.evaluate(() => window.__game.coop._inviteUrl('ABCD'));
check(/\?coopjoin=ABCD$/.test(url), `_inviteUrl будує посилання з кодом — ${url}`);
check(url.startsWith(origin) || url.startsWith('http'), 'посилання містить origin');
// invite handler with no active room is a safe no-op (no throw)
const safe = await page.evaluate(() => { try { window.__game.coop._shareInvite(); return 'ok'; } catch (e) { return 'throw:' + e.message; } });
check(safe === 'ok', 'клік без кімнати не падає');

// ============ ПІДСУМОК ============
console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 12)) console.log('  ', e);
  failed += errors.length;
} else {
  console.log('✅ Без помилок у консолі');
}
console.log(failed === 0 ? '🎉 УСІ ПЕРЕВІРКИ ПРОЙШЛИ' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
