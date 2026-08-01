// 🎖️ Пасивки країн: таблиця, збірка модифікаторів із `save.liberated` і межа сили.
// Чистий модуль → тестуємо в node напряму, підмінюючи імпорти через data-URL
// (той самий прийом, що в test/season-unit.mjs і test/worldfront-unit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const src = readFileSync(new URL('countrypowers.js', root), 'utf8')
  .replace("from './i18n.js'", "from './_i18n.mjs'")
  .replace("from './net/cloudsave.js'", "from './_cloud.mjs'");

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const resolved = src
  .replace('./_i18n.mjs', asData('export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);'))
  .replace('./_cloud.mjs', asData('export const hasLiberated = (l = {}, id) => !!(l && l[id]);'));
const mod = await import(asData(resolved));
const {
  COUNTRY_POWERS, countryPower, earnedCountryPowers, countryPowerMods, countryPowerCards, neutralCountryMods,
} = mod;

const ALL_SIX = { ESP: true, PRT: true, ITA: true, SWE: true, JPN: true, CHN: true };

// 🛒 гілки «Прокачування» + «Спорядження» — межа, за яку пасивки не мають заходити.
// Максимуми читаємо з реального src/shop.js, щоб тест ловив дрейф самої гілки,
// а не порівнювався з числами, переписаними колись від руки.
const shopSrc = readFileSync(new URL('shop.js', root), 'utf8');
const shopMax = (id) => {
  const m = shopSrc.match(new RegExp(`id: '${id}'[\\s\\S]*?max: (\\d+)`));
  return m ? Number(m[1]) : null;
};
// ефекти сходинок: main.js (maxhp +25, speed +10%, damage +15%), player.js (vest +50, helmet 0.85)
const BRANCH = {
  maxHealth: 25 * shopMax('maxhp'),
  speedMult: 1 + 0.1 * shopMax('speed'),
  damageMult: 1 + 0.15 * shopMax('damage'),
  maxArmor: 50 * shopMax('vest'),
  damageTakenMult: 0.85,
};
// 🦺 броня поглинає 60% шкоди, поки є; отже витримана шкода = (HP + броня) / множник шкоди
const ehp = (hp, armor, taken) => (hp + armor) / taken;

test('шість країн середини кампанії мають рівно по одній пасивці', () => {
  assert.equal(COUNTRY_POWERS.length, 6);
  assert.deepEqual(COUNTRY_POWERS.map((p) => p.country), ['ESP', 'PRT', 'ITA', 'SWE', 'JPN', 'CHN']);
  assert.equal(new Set(COUNTRY_POWERS.map((p) => p.id)).size, 6, 'id унікальні');
  for (const p of COUNTRY_POWERS) {
    assert.ok(p.icon && p.name() && p.desc(), `${p.id}: іконка, назва й опис на місці`);
    assert.ok(Object.keys(neutralCountryMods()).includes(p.stat), `${p.id}: stat є в наборі модифікаторів`);
    const hasAdd = typeof p.add === 'number';
    const hasMul = typeof p.mul === 'number';
    assert.ok(hasAdd !== hasMul, `${p.id}: рівно одне з add/mul`);
  }
  // країни зі зброєю (і взагалі будь-які інші) пасивки не мають
  for (const id of ['UKR', 'POL', 'DEU', 'FRA', 'TUR', 'EGY', 'LOST', 'LAB', 'MOON']) {
    assert.equal(countryPower(id), null, `${id}: без пасивки`);
  }
  assert.equal(countryPower('ESP').id, 'toro');
});

test('порожній список країн — порожній набір', () => {
  assert.deepEqual(countryPowerMods({}), neutralCountryMods());
  assert.deepEqual(earnedCountryPowers({}), []);
  // новий сейв ще не має поля взагалі
  assert.deepEqual(countryPowerMods(undefined), neutralCountryMods());
  assert.deepEqual(countryPowerMods(null), neutralCountryMods());
});

test('одна країна дає рівно свій ефект і нічого більше', () => {
  const one = countryPowerMods({ CHN: true });
  assert.equal(one.maxHealth, 20, 'Китай: +20 макс. HP');
  const base = neutralCountryMods();
  for (const key of Object.keys(base)) {
    if (key === 'maxHealth') continue;
    assert.equal(one[key], base[key], `Китай не чіпає ${key}`);
  }
  assert.equal(countryPowerMods({ ESP: true }).speedMult, 1.04);
  assert.equal(countryPowerMods({ PRT: true }).healMult, 1.12);
  assert.equal(countryPowerMods({ ITA: true }).maxArmor, 25);
  assert.equal(countryPowerMods({ SWE: true }).damageTakenMult, 0.95);
  assert.equal(countryPowerMods({ JPN: true }).damageMult, 1.05);
  assert.deepEqual(earnedCountryPowers({ JPN: true, ESP: true }).map((p) => p.id), ['toro', 'samurai'],
    'порядок кампанійний, а не порядок ключів сейва');
});

test('усі шість — сума всіх ефектів', () => {
  const all = countryPowerMods(ALL_SIX);
  assert.deepEqual(all, {
    maxHealth: 20, maxArmor: 25, speedMult: 1.04, damageMult: 1.05, damageTakenMult: 0.95, healMult: 1.12,
  });
  assert.equal(earnedCountryPowers(ALL_SIX).length, 6);
});

test('невідомі й сміттєві id ігноруються', () => {
  const junk = {
    ZZZ: true, '': true, 42: true, LOST: true, MOON: true, UKR: true, // країни без пасивки
    ESP: false, PRT: 0, ITA: null, SWE: undefined, JPN: '', CHN: NaN,  // «звільнено» лише на вигляд
  };
  assert.deepEqual(countryPowerMods(junk), neutralCountryMods());
  assert.deepEqual(earnedCountryPowers(junk), []);
  // сейв, зіпсований типом
  for (const bad of ['nope', 42, true, [], () => {}]) {
    assert.deepEqual(countryPowerMods(bad), neutralCountryMods(), `сміття ${typeof bad} не ламає збірку`);
  }
  // «правдиві» значення, які не є true, все ж рахуються звільненням (як в усій грі)
  assert.equal(countryPowerMods({ CHN: 1 }).maxHealth, 20);
});

test('шість пасивок разом слабші за гілку прокачки', () => {
  const all = countryPowerMods(ALL_SIX);
  // кожна пасивка окремо — менша за ОДНУ сходинку своєї гілки
  assert.ok(all.maxHealth < 25, `+${all.maxHealth} HP менше за одну сходинку «Міцність» (25)`);
  assert.ok(all.maxArmor < 50, `+${all.maxArmor} броні менше за один «Бронежилет» (50)`);
  assert.ok(all.damageMult < 1.15, 'шкода менша за одну сходинку «Шкода» (+15%)');
  assert.ok(all.speedMult < 1.10, 'швидкість менша за одну сходинку «Швидкість» (+10%)');
  assert.ok(all.damageTakenMult > 0.85, 'зниження шкоди слабше за «Шолом» (-15%)');

  // виживання: приріст пасивок поверх ПОВНІСТЮ викупленої гілки — менше третини
  // від того, що дала сама гілка (від голого героя 100 HP + 50 броні).
  const bare = ehp(100, 50, 1);
  const shop = ehp(100 + BRANCH.maxHealth, 50 + BRANCH.maxArmor, BRANCH.damageTakenMult);
  const both = ehp(100 + BRANCH.maxHealth + all.maxHealth, 50 + BRANCH.maxArmor + all.maxArmor,
    BRANCH.damageTakenMult * all.damageTakenMult);
  const share = (both - shop) / (shop - bare);
  assert.ok(share > 0, 'пасивки таки додають виживання');
  assert.ok(share < 1 / 3, `внесок у виживання ${(share * 100).toFixed(1)}% від гілки — менше третини`);

  // шкода і швидкість: та сама межа
  const dmgShare = (all.damageMult - 1) / (BRANCH.damageMult - 1);
  const spdShare = (all.speedMult - 1) / (BRANCH.speedMult - 1);
  assert.ok(dmgShare > 0 && dmgShare < 1 / 3, `внесок у шкоду ${(dmgShare * 100).toFixed(1)}% від гілки`);
  assert.ok(spdShare > 0 && spdShare < 1 / 3, `внесок у швидкість ${(spdShare * 100).toFixed(1)}% від гілки`);

  // гілка на місці — якщо магазин поміняють, тест має впасти тут, а не мовчки поїхати
  assert.deepEqual([shopMax('maxhp'), shopMax('speed'), shopMax('damage'), shopMax('vest'), shopMax('helmet')],
    [4, 3, 3, 2, 1], 'максимуми гілки «Прокачування»/«Спорядження» не змінились');
});

test('картки для екрана: уся таблиця з прапорцем «зароблено»', () => {
  const cards = countryPowerCards({ ESP: true, JPN: true });
  assert.equal(cards.length, 6, 'показуємо і нездобуті — інакше не видно, за що вони');
  assert.deepEqual(cards.filter((c) => c.earned).map((c) => c.country), ['ESP', 'JPN']);
  assert.deepEqual(countryPowerCards({}).filter((c) => c.earned), []);
  assert.equal(countryPowerCards(ALL_SIX).filter((c) => c.earned).length, 6);
});

// 🤝 Кооп: пасивка — ефект на СВОЄМУ гравцеві, у мережу не їде. Єдиний контакт із хостом —
// шкода гостя (host.js clampDmg зрізає до 2000). Перевіряємо, що +5% не перетворює
// легальне влучання на зрізане в реальному діапазоні (магазин + кілька карток драфту).
test('шкода з пасивкою лишається під стелею clampDmg хоста', () => {
  const hostSrc = readFileSync(new URL('net/host.js', root), 'utf8');
  const cap = Number((hostSrc.match(/const clampDmg = \(v\) => Math\.max\(0, Math\.min\((\d+)/) || [])[1]);
  assert.equal(cap, 2000, 'стеля clampDmg на місці');
  const SNIPER_HEADSHOT = 120 * 2;              // найбільша базова шкода за влучання
  const realistic = SNIPER_HEADSHOT * BRANCH.damageMult * 2; // магазин + пара карток драфту (×2)
  const withPower = realistic * countryPowerMods(ALL_SIX).damageMult;
  assert.ok(realistic < cap && withPower < cap,
    `реальне влучання ${Math.round(realistic)} → ${Math.round(withPower)} під стелею ${cap}`);
});
