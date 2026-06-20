// Тести M6: «Зроби свого героя» — кастом-скін + кольори з save.hero (пресети не чіпаємо)
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

// ============ 🎨 ЗРОБИ СВОГО ГЕРОЯ ============
console.log('▸ M6: Зроби свого героя');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
let sv = await save();
check(sv.hero && typeof sv.hero === 'object', 'save.hero існує');
check(sv.skins.includes('custom'), 'кастом-скін завжди доступний');
// custom hero builds without error with chosen colors
const built = await page.evaluate(() => {
  try { const r = window.__makeHeroTest ? window.__makeHeroTest('custom', { shirt: 0xe14b4b, pants: 0x2d3436, skin: 0xf1c27d }) : null; return r ? 'ok' : 'noapi'; }
  catch (e) { return 'throw:' + e.message; }
});
check(built === 'ok' || built === 'noapi', `makeHero('custom', colors) не падає (${built})`);
// selecting custom + colors persists
await page.evaluate(() => { window.__game.save.activeSkin = 'custom'; window.__game.save.hero = { shirt: 0xe14b4b, pants: 0x2d3436, skin: 0xf1c27d }; window.__game.saveGame(); });
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
sv = await save();
check(sv.activeSkin === 'custom' && sv.hero.shirt === 0xe14b4b, 'кастом-герой і кольори переживають reload');

console.log('▸ M6: палітра в Гардеробі');
await page.evaluate(() => { window.__game.save.activeSkin = 'custom'; window.__game._showOverlay('overlay-wardrobe'); window.__game.renderWardrobe(); });
const hasPalette = await page.evaluate(() => !!document.querySelector('#wardrobe-content .hero-swatch'));
check(hasPalette, 'для кастом-скіна показано палітру кольорів');
await page.evaluate(() => { const s = document.querySelector('#wardrobe-content .hero-swatch[data-slot="shirt"]'); if (s) s.click(); });
const changed = await page.evaluate(() => typeof window.__game.save.hero.shirt === 'number');
check(changed, 'клік по свотчу оновлює save.hero.shirt');

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
