// Тести M7: «Світ у вогні» — зірки складності (опційні, opt-in).
// ★1 == сьогодні (ідентичність): множник = 1 для hp/dmg/counts і боса.
// ★>1 робить зомбі міцнішими/сильнішими; дефолт save.diffStar === 1.
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

// ============ ⭐ ЗІРКИ СКЛАДНОСТІ ============
console.log('▸ M7: Світ у вогні (зірки складності)');
await loadCountry('UKR');

// spawn-овий walker на заданій зірці → повертаємо його maxHp.
// Свіжий Zombies(level, seed) читає level.diffStar у конструкторі.
const hpAt = (star) => page.evaluate((s) => {
  const g = window.__game; g.level.diffStar = s;
  const Z = g.level.zombies.constructor;
  const zm = new Z(g.level, 12345);
  const p = g.level.player.pos;
  const z = zm.spawn('walker', p.x + 6, p.z);
  const hp = z.maxHp; if (z.rig) g.level.scene.remove(z.rig.group);
  return hp;
}, star);

const hp1 = await hpAt(1);
const hp3 = await hpAt(3);
check(hp3 > hp1 * 1.5, `★3 робить зомбі міцнішими (${hp1} → ${hp3})`);
check((await page.evaluate(() => window.__game.save.diffStar)) === 1, 'дефолтна складність — ★1');
// ★1 ідентична базі: walker TYPE_STATS.hp = 70, базова country.difficulty.hp у соло = 1
check(hp1 === 70, `★1 = базова HP walker (${hp1})`);

// boss теж масштабується зіркою (м'якше), але на ★1 — ідентичний
const bossHpAt = (star) => page.evaluate((s) => {
  const g = window.__game; g.level.diffStar = s;
  const Z = g.level.zombies.constructor;
  const zm = new Z(g.level, 12345);
  const b = zm.spawnBoss();
  const hp = b.maxHp; zm.despawnBoss && zm.despawnBoss();
  if (b.rig) g.level.scene.remove(b.rig.group);
  return hp;
}, star);
const bhp1 = await bossHpAt(1);
const bhp3 = await bossHpAt(3);
check(bhp3 > bhp1, `★3 робить боса міцнішим (${bhp1} → ${bhp3})`);

// diffStar валідується в save (1..5)
const validated = await page.evaluate(() => {
  const g = window.__game;
  g.save.diffStar = 99; g.saveGame();
  // повторне завантаження сейва має повернути в межі 1..5
  const out = g._loadSave();
  return out.diffStar;
});
check(validated >= 1 && validated <= 5, `save.diffStar валідується в 1..5 (got ${validated})`);

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
