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

// ---- ІНТЕГРАЦІЯ: реальна геймплейна подія рухає главу (zombieKilled → chapter hook) ----
await page.evaluate(() => { window.__game.save.chapter = { p: {}, done: false }; });
await page.evaluate(() => {
  const g = window.__game;
  const z = g.test.spawnZombie('walker', g.level.player.x + 3, g.level.player.z + 3);
  z.damage(9999, null, false);
});
await waitFor(async () => ((await save()).chapter.p.kill || 0) >= 1, 5000, 'kill через геймплей');
check(((await save()).chapter.p.kill || 0) >= 1, 'реальне вбивство зомбі → chapter.p.kill ≥ 1 (хук wired)');
// reset chapter to fresh before the direct-event drive below
await page.evaluate(() => { window.__game.save.chapter = { p: {}, done: false }; });

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

// ============ 📖 ГЛАВА У ШТАБІ ============
console.log('▸ M3: Глава у Штабі');
await page.evaluate(() => { window.__game.save.chapter = { p: { kill:3 }, done:false }; window.__game.save.medals = []; window.__game.hq.render(); });
let hq = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-chapter/.test(hq), 'Штаб показує секцію глави');
check(/Я рятівник|I'm a Rescuer|Я спасатель/.test(hq), 'є назва глави');
check((hq.match(/hq-step/g) || []).length === 5, 'рівно 5 кроків');
check(/3\/10/.test(hq) || (/\b3\b/.test(hq) && /\b10\b/.test(hq)), 'прогрес кроку рендериться (3/10)');

// пройдена глава → лінія медалі рендериться у Штабі
await page.evaluate(() => { window.__game.save.chapter = { p: {}, done:true }; window.__game.save.medals = ['rescuer']; window.__game.hq.render(); });
hq = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-medal|отримано|received|получено/.test(hq), 'медаль рендериться, коли главу пройдено');

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
