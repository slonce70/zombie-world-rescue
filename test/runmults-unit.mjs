// 🧬 База проти бонусу забігу: покупка в магазині перераховує базові множники з нуля,
// і не має з'їдати картки драфту, ранг спеціаліста, рівень бійця чи кооп-роль.
// src/runbuild.js — чистий модуль БЕЗ ІМПОРТІВ, тож імпортуємо його прямо з data-URL
// (package.json тут commonjs, звичайний import '.js' не спрацював би).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/runbuild.js', import.meta.url), 'utf8');
const { CARD_POOL, COMBOS, RUN_MULT_CAP, applyBaseMults, applyBaseJump } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// мінімальний двійник гравця: ті поля, що ставить Player у конструкторі
const fakePlayer = () => ({
  damageMult: 1, speedMult: 1, jumpPower: 7.6, maxHealth: 100, health: 100,
  armor: 0, maxArmor: 50, grenades: 2, lifeSteal: 0, pickupMult: 1,
});
const card = (id) => CARD_POOL.find((c) => c.id === id);
const near = (got, want, msg) => assert.ok(Math.abs(got - want) < 1e-9, `${msg}: ${got} ≠ ${want}`);

// старт рівня: main.js рахує базу з save.upgrades і пасивок країн
const startLevel = (p, upgrades = {}, powers = null) => applyBaseMults(p, upgrades, powers);

test('картка драфту + покупка «Шкода» = добуток обох, а не сама покупка', () => {
  const p = fakePlayer();
  startLevel(p);
  card('dmg40').apply(p);                     // +40% шкоди → 1.4
  near(p.damageMult, 1.4, 'картка не застосувалась');
  applyBaseMults(p, { damage: 1 });           // покупка «Шкода» посеред забігу
  near(p.damageMult, 1.15 * 1.4, 'покупка стерла картку');
  applyBaseMults(p, { damage: 2 });           // друга покупка — теж без втрат
  near(p.damageMult, 1.3 * 1.4, 'друга покупка зʼїла картку');
});

test('картка швидкості переживає покупку «Швидкість» і «Кросівки»', () => {
  const p = fakePlayer();
  startLevel(p);
  card('spd12').apply(p);                     // ×1.12
  applyBaseMults(p, { speed: 1 });
  near(p.speedMult, 1.1 * 1.12, 'покупка швидкості стерла картку');
  applyBaseMults(p, { speed: 1, sneakers: 1 });
  near(p.speedMult, 1.1 * 1.08 * 1.12, 'кросівки стерли картку');
});

test('пасивка країни лишається в базі й не подвоюється від повторного перерахунку', () => {
  const p = fakePlayer();
  const powers = { speedMult: 1.04, damageMult: 1.05 };
  startLevel(p, { speed: 1 }, powers);
  near(p.speedMult, 1.1 * 1.04, 'пасивка не потрапила в базу');
  applyBaseMults(p, { speed: 1 }, powers);    // покупка, що не міняє швидкість
  near(p.speedMult, 1.1 * 1.04, 'перерахунок бази не ідемпотентний');
  near(p.damageMult, 1.05, 'пасивка шкоди поїхала');
});

test('множники Експедиції і кооп-ролі переживають покупку', () => {
  const p = fakePlayer();
  startLevel(p, { speed: 1, damage: 1 });
  p.speedMult *= 1.12;                        // ранг спеціаліста (main.js: specialistModifiers)
  p.damageMult *= 1.5;                        // рівень бійця Експедиції (fighterLevelMultiplier)
  p.speedMult *= 1.08;                        // кооп-роль scout
  applyBaseMults(p, { speed: 2, damage: 2 }); // покупка обох апгрейдів
  near(p.speedMult, 1.2 * 1.12 * 1.08, 'бонуси Експедиції/коопу стерлись зі швидкості');
  near(p.damageMult, 1.3 * 1.5, 'множник рівня бійця стерся');
});

test('стелі забігу лишаються дійсними: покупка не проносить бонус вище капу', () => {
  const p = fakePlayer();
  startLevel(p);
  p.speedMult = RUN_MULT_CAP.speedMult;       // картки вже вперлись у стелю
  p.damageMult = RUN_MULT_CAP.damageMult;
  applyBaseMults(p, { speed: 3, damage: 3, sneakers: 1 });
  near(p.speedMult, RUN_MULT_CAP.speedMult, 'швидкість пробила стелю');
  near(p.damageMult, RUN_MULT_CAP.damageMult, 'шкода пробила стелю');
});

test('підняту комбо стелю покупка не відбирає', () => {
  const p = fakePlayer();
  startLevel(p);
  p.speedMult = 2.2;                          // ⚡ БЛИСКАВКА (COMBOS.speed)
  p.damageMult = 6;                           // 🔥 СИЛАЧ (COMBOS.power)
  applyBaseMults(p, { speed: 1, damage: 1 });
  near(p.speedMult, 2.2, 'покупка знизила швидкість');
  near(p.damageMult, 6, 'покупка знизила шкоду');
});

test('RUN_MULT_CAP дзеркалить стелі самих карток', () => {
  // самі картки (без комбо) не мають переростати RUN_MULT_CAP — інакше константа
  // розійшлась із Math.min() у CARD_POOL і перерахунок бази ріже бонус зарано
  const p = fakePlayer();
  for (const c of CARD_POOL) c.apply(p);
  near(p.speedMult, RUN_MULT_CAP.speedMult, 'стеля швидкості розійшлась із картками');
  near(p.damageMult, RUN_MULT_CAP.damageMult, 'стеля шкоди розійшлась із картками');
  // комбо свідомо піднімають стелю вище — RUN_MULT_CAP тримає нижню, «карткову» пару
  COMBOS.speed.apply(p);
  COMBOS.power.apply(p);
  assert.ok(p.speedMult > RUN_MULT_CAP.speedMult && p.damageMult > RUN_MULT_CAP.damageMult);
});

test('бонус стрибка від картки переживає покупку жилета і кросівок', () => {
  const p = fakePlayer();
  applyBaseJump(p, 7.6);                      // старт рівня без спорядження
  card('spdjump').apply(p);                   // +1.2 до стрибка
  near(p.jumpPower, 8.8, 'картка не додала стрибка');
  applyBaseJump(p, 7.6);                      // покупка жилета/шолома/ярусу 2 → applyGear
  near(p.jumpPower, 8.8, 'покупка жилета стерла бонус стрибка');
  applyBaseJump(p, 8.6);                      // покупка кросівок піднімає саму базу
  near(p.jumpPower, 9.8, 'кросівки зʼїли бонус картки');
});

test('Місяць: база стрибка з низькою гравітацією теж не губить картку', () => {
  const p = fakePlayer();
  p.jumpPower = 9.4;
  applyBaseJump(p, 9.4);
  card('jumphi').apply(p);                    // +2.2
  applyBaseJump(p, 9.4);
  near(p.jumpPower, 11.6, 'місячна база стерла бонус');
});
