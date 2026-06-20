// Тести M3: «Глава 1: Я рятівник» — система глав, медаль, хуки подій
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

// ============ 🎖️ ГЛАВА 1: Я РЯТІВНИК ============
console.log('▸ M3: Глава 1 «Я рятівник»');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
// fresh: chapter has no progress
let sv = await save();
check(sv.chapter && sv.chapter.done === false, 'нова глава: не пройдена');
// drive all steps via chapter.onEvent
await page.evaluate(() => {
  const ch = window.__game.chapter;
  ch.onEvent('enterLevel'); ch.onEvent('kill', 10); ch.onEvent('mission'); ch.onEvent('gadget'); ch.onEvent('boss');
});
sv = await save();
check(sv.chapter.done === true, 'усі 5 кроків → главу пройдено');
check(Array.isArray(sv.medals) && sv.medals.includes('rescuer'), 'видано медаль «rescuer»');
// persists
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
check((await save()).chapter.done === true, 'глава лишається пройденою після reload');

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
