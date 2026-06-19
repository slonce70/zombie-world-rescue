// Гард міграції сейва: найвідповідальніший шлях (втрата прогресу дитини).
// Перевіряємо, що historичні/биті форми сейва не кидають винятку і коректно
// мігрують. Потрібна статика на 8741.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

async function loadWith(raw) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  // ?test вимикає хмару/перевірку версій; ставимо сейв ДО завантаження модулів гри
  await page.addInitScript((r) => { try { localStorage.setItem('zr-save-v1', r); } catch (e) {} }, raw);
  await page.goto('http://localhost:8741/?test');
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', { timeout: 15000 });
  const save = await page.evaluate(() => window.__game.save);
  await page.close();
  return { save, errs };
}

// 1. Легасі-гаджети (заряди → відкриття назавжди)
{
  const { save, errs } = await loadWith(JSON.stringify({
    liberated: { UKR: true }, weapons: ['pistol'], gadgets: { tramp: 2, wall: 1 },
  }));
  check(errs.length === 0, `легасі-гаджети: без винятків (${errs[0] || 'ok'})`);
  check(Array.isArray(save.gadgetsOwned) && save.gadgetsOwned.includes('tramp') && save.gadgetsOwned.includes('wall'),
    'легасі-гаджети: tramp+wall перенесено у gadgetsOwned');
  check(save.gadgets === undefined, 'легасі-гаджети: старе поле gadgets видалено');
}

// 2. Сейв без weapons + зі звільненими країнами → зброя бекфілиться
{
  const { save, errs } = await loadWith(JSON.stringify({ liberated: { UKR: true, POL: true } }));
  check(errs.length === 0, `без weapons: без винятків (${errs[0] || 'ok'})`);
  check(Array.isArray(save.weapons) && save.weapons.length > 0 && !save.weapons.includes(undefined),
    'без weapons: масив зброї заповнено, без undefined');
}

// 3. Зіпсований (не-JSON) сейв → гра стартує на дефолтах, без краша
{
  const { save, errs } = await loadWith('{ це не json');
  check(errs.length === 0, `битий JSON: без винятків (${errs[0] || 'ok'})`);
  check(typeof save.coins === 'number' && isFinite(save.coins), 'битий JSON: coins — скінченне число');
  check(Array.isArray(save.weapons) && save.weapons.includes('pistol'), 'битий JSON: дефолтна зброя pistol');
}

// 4. Порожній об'єкт → повні дефолти
{
  const { save, errs } = await loadWith('{}');
  check(errs.length === 0, `порожній {}: без винятків (${errs[0] || 'ok'})`);
  check(save.activeSkin === 'classic' && Array.isArray(save.skins), 'порожній {}: дефолти скінів на місці');
}

await browser.close();
console.log(failed === 0 ? '\n🎉 МІГРАЦІЯ СЕЙВА НАДІЙНА' : `\n❌ МІГРАЦІЯ: ${failed} провалів`);
process.exit(failed === 0 ? 0 : 1);
