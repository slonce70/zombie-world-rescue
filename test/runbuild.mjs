// Чиста логіка драфту «Прокачка» — БЕЗ браузера (як version-sync.mjs).
// runbuild.js не має імпортів — вантажимо його в node напряму. Репо стоїть на
// "type":"commonjs", тож читаємо ESM-джерело текстом і вантажимо через data:-URL
// (так node трактує src/runbuild.js як ES-модуль, не чіпаючи ні файл, ні package.json).
import { makeCheck } from './_browser.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
const srcPath = fileURLToPath(new URL('../src/runbuild.js', import.meta.url));
const src = readFileSync(srcPath, 'utf8');
const { CARD_POOL, COMBOS, RunBuild, cardWeight } =
  await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let fail = 0;
const check = makeCheck(() => fail++);
const mkPlayer = () => ({ damageMult: 1, speedMult: 1, maxHealth: 100, health: 100, grenades: 2, maxArmor: 50, armor: 0 });
const combatSnapshot = (p) => [p.damageMult, p.speedMult, p.maxHealth, p.health, p.grenades, p.armor, p.lifeSteal || 0];

// пул має ≥3 картки і покриває 3 теги
check(CARD_POOL.length >= 3, 'у пулі ≥3 карток', CARD_POOL.length);
check(['power', 'speed', 'tank'].every((tg) => CARD_POOL.some((c) => c.tag === tg)), 'усі 3 теги присутні');

// offer() дає рівно 3 РІЗНІ картки
const off = new RunBuild().offer({ int: () => 0 });
check(off.length === 3, 'драфт пропонує 3 картки', off.length);
check(new Set(off.map((c) => c.id)).size === 3, 'усі 3 — різні');
const supplierOffer = new RunBuild().offer({ int: () => 0 }, 4);
check(supplierOffer.length === 4, 'Снабженець пропонує 4 картки', supplierOffer.length);
check(new Set(supplierOffer.map((c) => c.id)).size === 4, 'усі 4 — різні');
const tank = CARD_POOL.find((c) => c.tag === 'tank');
check(cardWeight(tank, { tags: ['tank'], ids: [], multiplier: 2 }) === cardWeight(tank) * 2,
  'тематична картка має подвійну вагу');

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

// === Прокачка 2.0 ===
// пул великий, id унікальні, рідкості валідні, кожна рідкість представлена
check(CARD_POOL.length >= 15, 'у пулі ≥15 карток', CARD_POOL.length);
check(new Set(CARD_POOL.map((c) => c.id)).size === CARD_POOL.length, 'id карток унікальні');
check(CARD_POOL.every((c) => ['common', 'rare', 'epic'].includes(c.rarity)), 'усі рідкості валідні');
check(['common', 'rare', 'epic'].every((r) => CARD_POOL.some((c) => c.rarity === r)), 'є common, rare і epic');

for (const card of CARD_POOL) {
  const pc = mkPlayer();
  const beforeCard = combatSnapshot(pc).join('|');
  card.apply(pc);
  const afterCard = combatSnapshot(pc);
  check(afterCard.join('|') !== beforeCard, `картка ${card.id} змінює бойовий стан`);
  check(afterCard.every(Number.isFinite), `картка ${card.id} не ламає числові стати`, JSON.stringify(afterCard));
}

// взяті картки не пропонуються повторно (поки колода не скінчилась)
const rb3 = new RunBuild();
const p3 = mkPlayer();
const first = rb3.offer({ int: () => 0 });
rb3.apply(first[0], p3);
const second = rb3.offer({ int: () => 0 });
check(!second.some((c) => c.id === first[0].id), 'взята картка не повторюється у наступному драфті');

// коли колода вичерпана — перетасовується, offer() завжди дає 3 картки
const rb4 = new RunBuild();
for (const c of CARD_POOL) rb4.taken.add(c.id);
const reshuffled = rb4.offer({ int: () => 0 });
check(reshuffled.length === 3, 'після вичерпання колоди драфт знову дає 3 картки', reshuffled.length);

// вампіризм: картка додає run-only поле lifeSteal
const vamp = CARD_POOL.find((c) => c.id === 'vamp');
const p4 = mkPlayer();
vamp.apply(p4);
check(p4.lifeSteal === 1, 'картка вампіризму дає lifeSteal=1', p4.lifeSteal);

// стара домінована картка «Лікування вщент» видалена
check(!CARD_POOL.some((c) => c.id === 'heal'), 'мертвого піка heal більше немає');

console.log(fail === 0 ? '\n🎉 RUNBUILD OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
process.exit(fail ? 1 : 0);
