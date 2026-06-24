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
  check(typeof save.crystals === 'number' && isFinite(save.crystals), 'битий JSON: crystals — скінченне число');
  check(Array.isArray(save.weapons), 'битий JSON: weapons — валідний масив (стартовий pistol неявний, у player.js)');
}

// 4. Порожній об'єкт → повні дефолти
{
  const { save, errs } = await loadWith('{}');
  check(errs.length === 0, `порожній {}: без винятків (${errs[0] || 'ok'})`);
  check(save.activeSkin === 'classic' && Array.isArray(save.skins), 'порожній {}: дефолти скінів на місці');
  check(save.crystals === 0, 'порожній {}: crystals = 0');
}

// 5. F26: глибокий merge вкладених об'єктів — старий сейв із НЕПОВНИМИ stats/hero/chapter.
// Бракуючі під-поля мають братися з дефолтів (без NaN/undefined), а наявні — зберегтися.
{
  const { save, errs } = await loadWith(JSON.stringify({
    liberated: { UKR: true }, weapons: ['pistol'],
    stats: { killed: 42 },          // лише одне поле — решта мають доповнитись дефолтами
    hero: { shirt: 0x123456 },      // лише сорочка — pants/skin з дефолтів
    chapter: { p: { kill: 3 } },    // без done — має зʼявитись false
  }));
  check(errs.length === 0, `F26 неповні вкладені: без винятків (${errs[0] || 'ok'})`);
  check(save.stats.killed === 42, 'F26: наявне stats.killed збережено');
  for (const k of ['headshots', 'bosses', 'megaboxes', 'golden', 'bestCombo']) {
    check(typeof save.stats[k] === 'number' && isFinite(save.stats[k]), `F26: stats.${k} — число (не NaN)`);
  }
  check(save.hero.shirt === 0x123456, 'F26: наявний hero.shirt збережено');
  check(typeof save.hero.pants === 'number' && typeof save.hero.skin === 'number', 'F26: hero.pants/skin доповнено дефолтами');
  check(save.chapter.p && save.chapter.p.kill === 3, 'F26: наявний chapter.p збережено');
  check(save.chapter.done === false, 'F26: chapter.done доповнено дефолтом (false)');
}

// 6. Улюбленці: легасі-собака (upgrades.dog) → у список pets + активний
{
  const { save, errs } = await loadWith(JSON.stringify({
    liberated: { UKR: true }, weapons: ['pistol'], upgrades: { dog: 1, maxhp: 2 },
  }));
  check(errs.length === 0, `легасі-собака: без винятків (${errs[0] || 'ok'})`);
  check(Array.isArray(save.pets) && save.pets.includes('dog'), 'легасі-собака: dog перенесено у save.pets');
  check(save.activePet === 'dog', 'легасі-собака: activePet = dog');
}

// 7. activePet, що вказує на неоплаченого улюбленця → скидається
{
  const { save, errs } = await loadWith(JSON.stringify({ pets: ['cat'], activePet: 'dragon' }));
  check(errs.length === 0, `битий activePet: без винятків (${errs[0] || 'ok'})`);
  check(save.activePet === 'cat', 'битий activePet → перший із наявних (cat)');
}

await browser.close();
console.log(failed === 0 ? '\n🎉 МІГРАЦІЯ СЕЙВА НАДІЙНА' : `\n❌ МІГРАЦІЯ: ${failed} провалів`);
process.exit(failed === 0 ? 0 : 1);
