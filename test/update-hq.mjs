// Тести M1: Штаб — Моя пригода (lifetime-статистика)
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
const state = () => page.evaluate(() => window.__game.test.state());
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

// ============ 🏅 M1: МОЇ ЦИФРИ (lifetime-статистика) ============
console.log('▸ Штаб: Мої цифри');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
let sv = await save();
check(sv.stats && sv.stats.killed === 0, `новий сейв: stats.killed = 0 (${sv.stats && sv.stats.killed})`);

// вбивство інкрементує killed
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  g.test.spawnZombie('walker', p.x + 5, p.z).damage(9999, null, false);
});
sv = await save();
check(sv.stats.killed === 1, `вбивство → stats.killed = 1 (${sv.stats.killed})`);

// золотий зомбі інкрементує golden
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  const z = g.test.spawnZombie('walker', p.x + 5, p.z); z.golden = true; z.damage(9999, null, false);
});
sv = await save();
check(sv.stats.golden >= 1, `золотий зомбі → stats.golden ≥ 1 (${sv.stats.golden})`);
check(sv.stats.killed === 2, `усього вбито 2 (${sv.stats.killed})`);

// збереження переживає reload
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
sv = await save();
check(sv.stats.killed >= 2, `stats переживає reload (${sv.stats.killed})`);

// підсумок
console.log('');
if (errors.length) console.log('JS-помилки на сторінці:\n', errors.join('\n'));
await browser.close();
if (failed) { console.log(`\n❌ ПРОВАЛЕНО: ${failed} перевірок`); process.exit(1); }
else console.log('\n✅ ВСІ ПЕРЕВІРКИ ПРОЙДЕНО');
