// Тести M2: «Моя ціль» — постановка цілі в магазині, шапка, автоочищення при покупці
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
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

// ============ 🎯 МОЯ ЦІЛЬ ============
console.log('▸ M2: Моя ціль — магазин');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
await page.evaluate(() => { window.__game.save.coins = 1000; window.__game.save.goal = null; window.__game.shop.open(); });
// бронежилет — у вкладці «Спорядження»; перемикаємось на неї, щоб картка зрендерилась
await page.evaluate(() => { window.__game.shop.activeTab = 'Спорядження'; window.__game.shop.render(); });
let goalBtn = await page.$('#shop [data-goal="vest"]');
check(!!goalBtn, 'у магазині є кнопка «🎯 ціль» для бронежилета');
const coinsBefore = await page.evaluate(() => window.__game.save.coins);
await page.evaluate(() => document.querySelector('#shop [data-goal="vest"]').click());
check((await save()).goal === 'vest', 'клік 🎯 встановлює save.goal=vest');
const coinsAfter = await page.evaluate(() => window.__game.save.coins);
check(coinsAfter === coinsBefore, 'клік 🎯 не списує монет (stopPropagation, не купівля)');
const header = await page.evaluate(() => document.getElementById('shop-goal') && document.getElementById('shop-goal').textContent);
check(/Бронежилет|ціль|Ціль/i.test(header || ''), 'шапка магазину показує ціль');
// F42: ціль на БАГАТОРІВНЕВИЙ товар (vest max:2) НЕ очищається після першої покупки —
// лише коли вичерпано до max. Інакше дитина «досягла» цілі, ще не докупивши апгрейд.
await page.evaluate(() => window.__game.shop.buy('vest')); // 0 → 1 (ще не max)
check((await save()).goal === 'vest', 'F42: ціль на vest ЛИШАЄТЬСЯ після 1-ї покупки (1/2)');
await page.evaluate(() => window.__game.shop.buy('vest')); // 1 → 2 (=max)
check((await save()).goal === null, 'F42: ціль очищається коли товар вичерпано (2/2)');
// одноразовий товар (max:1) очищає ціль одразу — поведінка незмінна
await page.evaluate(() => {
  window.__game.save.coins = 2500; window.__game.save.goal = 'sniper'; window.__game.shop.buy('sniper');
});
check((await save()).goal === null, 'F42: одноразовий товар (sniper) очищає ціль одразу');
// persist
await page.evaluate(() => { window.__game.save.goal = 'sniper'; window.__game.saveGame(); });
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
check((await save()).goal === 'sniper', 'ціль переживає reload');

// ============ 🎯 МОЯ ЦІЛЬ — ШТАБ ============
console.log('▸ M2: Моя ціль — Штаб');
await page.evaluate(() => { window.__game.save.coins = 120; window.__game.save.goal = 'vest'; window.__game.hq.render(); });
const hq = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-goal/.test(hq), 'Штаб має секцію «Моя ціль»');
check(/Бронежилет|Vest|Бронежилет/.test(hq) && /\d/.test(hq), 'ціль показує назву і скільки ще монет');
await page.evaluate(() => { window.__game.save.goal = null; window.__game.hq.render(); });
const hq2 = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-goal/.test(hq2) && /Обери ціль|Pick a goal|Выбери цель/.test(hq2), 'без цілі — запрошення обрати ціль');

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
closeServer();
process.exit(failed === 0 ? 0 : 1);
