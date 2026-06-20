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

// ============ 🔥 bestCombo: 3 вбивства підряд ============
console.log('▸ bestCombo: 3 зомбі підряд');
await loadCountry('UKR');
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  // скидаємо комбо перед тестом
  g.level.combo.n = 0; g.level.combo.t = 0; g.level.combo.best = 0;
  // вбиваємо 3 зомбі без паузи (combo.t скинеться лише через 3.2 с ігрового часу)
  g.test.spawnZombie('walker', p.x + 5, p.z).damage(9999, null, false);
  g.test.spawnZombie('walker', p.x + 6, p.z).damage(9999, null, false);
  g.test.spawnZombie('walker', p.x + 7, p.z).damage(9999, null, false);
});
sv = await save();
check(sv.stats.bestCombo >= 3, `bestCombo ≥ 3 після трьох вбивств підряд (${sv.stats.bestCombo})`);

// ============ 💥 headshots: bus.emit('hitmarker', true) ============
console.log('▸ headshots: emit hitmarker(crit=true)');
await loadCountry('UKR');
const hsBeforeRaw = await page.evaluate(() => window.__game.save.stats.headshots);
await page.evaluate(() => { window.__game.level.bus.emit('hitmarker', true); });
sv = await save();
check(sv.stats.headshots === hsBeforeRaw + 1, `headshots інкрементується через bus.emit('hitmarker', true) (${sv.stats.headshots})`);

// ============ 📦 megaboxes: bus.emit('megaboxOpened') ============
console.log('▸ megaboxes: emit megaboxOpened');
const mbBeforeRaw = await page.evaluate(() => window.__game.save.stats.megaboxes);
await page.evaluate(() => { window.__game.level.bus.emit('megaboxOpened'); });
sv = await save();
check(sv.stats.megaboxes === mbBeforeRaw + 1, `megaboxes інкрементується через bus.emit('megaboxOpened') (${sv.stats.megaboxes})`);

// bosses: спавн справжнього боса занадто важкий для headless — перевіряється в браузері.

// ============ 🔄 МІГРАЦІЯ: старий сейв без поля stats ============
console.log('▸ міграція: старий сейв без stats не кидає помилку');
// Записуємо старий сейв (без stats) і перезавантажуємо БЕЗ fresh
await page.evaluate(() => {
  localStorage.setItem('zr-save-v1', JSON.stringify({
    coins: 50, weapons: [], liberated: {}, records: {}, upgrades: {}, xp: 0
  }));
});
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'міграція-reload');
// перевіряємо: немає оверлею крашу
const hasCrash = await page.evaluate(() => {
  const el = document.getElementById('crash') || document.getElementById('error-overlay');
  return el ? el.style.display !== 'none' && el.offsetParent !== null : false;
});
check(!hasCrash, 'старий сейв завантажився без краш-оверлею');
sv = await save();
check(sv.stats && typeof sv.stats === 'object', 'stats — об\'єкт після міграції');
check(sv.stats.killed === 0, `stats.killed дефолт 0 після міграції (${sv.stats && sv.stats.killed})`);
const statKeys = ['killed', 'headshots', 'bosses', 'megaboxes', 'golden', 'bestCombo'];
const allNumeric = statKeys.every(k => typeof sv.stats[k] === 'number');
check(allNumeric, `всі 6 ключів stats числові після міграції (${statKeys.map(k => k + ':' + (sv.stats && sv.stats[k])).join(', ')})`);

// ============ 🎖️ ШТАБ: рендер секції «Мої цифри» ============
console.log('▸ Штаб: рендер секції «Мої цифри»');
await loadCountry('UKR');
// рендер Штабу показує цифри
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  g.test.spawnZombie('walker', p.x + 5, p.z).damage(9999, null, false);
  g.hq.render();
});
const hqHtml = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/Мої цифри|My Stats|Мои цифры/.test(hqHtml), 'Штаб рендерить секцію «Мої цифри»');
check(/hq-stat-n/.test(hqHtml), 'Штаб показує картки-цифри');

// ============ 🗺️ ШТАБ: секція «Моя пригода» (печаті країн) ============
console.log('▸ Штаб: Моя пригода (печаті країн)');
// До звільнення: Україна відкрита, решта світу затемнена (???)
// (isCountryOpen: УКР завжди відкрита, увесь світ — лише після звільнення УКР)
await page.evaluate(() => { window.__game.save.liberated = {}; window.__game.hq.render(); });
let advHtml = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-country/.test(advHtml), 'Штаб показує картки країн');
check(/🇺🇦/.test(advHtml), 'Україна — у списку пригоди');
check(/locked/.test(advHtml), 'незвільнені країни затемнені (???)');
// Після звільнення УКР: печать «врятовано» (saved) з'являється на картці країни
await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; window.__game.hq.render(); });
advHtml = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
const sealCount = (advHtml.match(/hq-country saved/g) || []).length;
check(sealCount >= 1, `звільнена країна має печать saved (${sealCount})`);

// підсумок
console.log('');
if (errors.length) console.log('JS-помилки на сторінці:\n', errors.join('\n'));
await browser.close();
if (failed) { console.log(`\n❌ ПРОВАЛЕНО: ${failed} перевірок`); process.exit(1); }
else console.log('\n✅ ВСІ ПЕРЕВІРКИ ПРОЙДЕНО');
