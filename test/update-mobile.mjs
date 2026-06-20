// Тести мобільного оновлення (Task 1): режим «Малюк» — лише м'яка допомога
// прицілу, БЕЗ автовогню й гарантованого хедшоту. Десктоп не зачіпається.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
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

// ============ 🐣 Режим Малюк: без автовогню ============
console.log('▸ Mobile: режим Малюк — без автовогню');
await page.goto(`${BASE}/?test&fresh&country=UKR&touch`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'level');

const shotsBefore = await page.evaluate(() => {
  const g = window.__game;
  g.save.kidMode = true;            // вмикаємо режим Малюк
  g.input.touchMode = true;         // переконуємось, що тач активний
  // зомбі прямо у передньому конусі гравця (8 м попереду по поточному yaw)
  const p = g.level.player;
  g.test.spawnZombie('walker', p.pos.x - Math.sin(p.yaw) * 8, p.pos.z - Math.cos(p.yaw) * 8);
  return g.level.stats.shotsFired;
});

// ~1.5с без жодного вводу вогню: режим Малюк НЕ має стріляти сам
await page.waitForTimeout(1500);
const shotsAfter = await page.evaluate(() => window.__game.level.stats.shotsFired);
check(shotsAfter === shotsBefore, `режим Малюк НЕ стріляє сам (${shotsBefore}→${shotsAfter})`);

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
