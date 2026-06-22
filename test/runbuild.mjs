// Чиста логіка драфту «Прокачка» — БЕЗ браузера (як version-sync.mjs).
// runbuild.js не має імпортів — вантажимо його в node напряму. Репо стоїть на
// "type":"commonjs", тож читаємо ESM-джерело текстом і вантажимо через data:-URL
// (так node трактує src/runbuild.js як ES-модуль, не чіпаючи ні файл, ні package.json).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
const srcPath = fileURLToPath(new URL('../src/runbuild.js', import.meta.url));
const src = readFileSync(srcPath, 'utf8');
const { CARD_POOL, COMBOS, RunBuild } =
  await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const mkPlayer = () => ({ damageMult: 1, speedMult: 1, maxHealth: 100, health: 100, grenades: 2 });

// пул має ≥3 картки і покриває 3 теги
check(CARD_POOL.length >= 3, 'у пулі ≥3 карток', CARD_POOL.length);
check(['power', 'speed', 'tank'].every((tg) => CARD_POOL.some((c) => c.tag === tg)), 'усі 3 теги присутні');

// offer() дає рівно 3 РІЗНІ картки
const off = new RunBuild().offer({ int: () => 0 });
check(off.length === 3, 'драфт пропонує 3 картки', off.length);
check(new Set(off.map((c) => c.id)).size === 3, 'усі 3 — різні');

// power-картка піднімає шкоду; не пише в жоден save (сигнатура apply(card, player) — без save)
const p = mkPlayer();
const rb = new RunBuild();
const dmg = CARD_POOL.find((c) => c.tag === 'power' && /шкод/i.test(c.name)) || CARD_POOL.find((c) => c.tag === 'power');
check(rb.apply(dmg, p) === null, '1 картка — ще не комбо');
check(p.damageMult > 1, 'шкода зросла після картки', p.damageMult);

// 3 однотегові → комбо спрацьовує РІВНО на 3-й і дає доп.бонус
const p2 = mkPlayer();
const rb2 = new RunBuild();
rb2.apply(dmg, p2);
rb2.apply(dmg, p2);
const before = p2.damageMult;
const combo = rb2.apply(dmg, p2);
check(combo === 'power', '3-тя power-картка → комбо power', combo);
check(p2.damageMult > before * 1.25, 'комбо дало бонус понад звичайну картку', p2.damageMult);
check(rb2.apply(dmg, p2) === null, '4-та — комбо НЕ повторюється');

// summary() — непорожній рядок іконок зібраної збірки
check(typeof rb2.summary() === 'string' && rb2.summary().length > 0, 'summary() дає рядок збірки', rb2.summary());

console.log(fail === 0 ? '\n🎉 RUNBUILD OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
process.exit(fail ? 1 : 0);
