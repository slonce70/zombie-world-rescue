// 🏅 Другий ярус прокачки: гейт базової гілки, взаємне виключення в парах, ціни й ефекти.
// Чистий модуль → тестуємо в node напряму, підмінюючи імпорт i18n через data-URL
// (той самий прийом, що в test/countrypowers-unit.mjs і test/worldfront-unit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const src = readFileSync(new URL('tier2.js', root), 'utf8')
  .replace("from './i18n.js'", `from '${asData("export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);")}'`);
const {
  BASE_BRANCH, TIER2, TIER2_PAIRS, TIER2_ITEMS, tier2Item,
  baseBranchLeft, baseBranchDone, tier2Chosen, tier2Lock,
  neutralTier2Mods, tier2Mods, rangeDamageMult,
} = await import(asData(src));

const shopSrc = readFileSync(new URL('shop.js', root), 'utf8');
const shopMax = (id) => {
  const m = shopSrc.match(new RegExp(`id: '${id}'[\\s\\S]*?max: (\\d+)`));
  return m ? Number(m[1]) : null;
};
const shopPrice = (id) => {
  const m = shopSrc.match(new RegExp(`id: '${id}'[\\s\\S]*?price: (\\d+)`));
  return m ? Number(m[1]) : null;
};
// повна базова гілка — саме те, що відкриває ярус
const FULL_BASE = Object.fromEntries(BASE_BRANCH.map((s) => [s.id, s.max]));

test('ярус — це три пари по два товари з унікальними id та іконками', () => {
  assert.equal(TIER2_PAIRS.length, 3);
  assert.equal(TIER2_ITEMS.length, 6);
  for (const pair of TIER2_PAIRS) assert.equal(pair.items.length, 2, `${pair.id}: рівно два товари`);
  assert.equal(new Set(TIER2_ITEMS.map((i) => i.id)).size, 6, 'id унікальні');
  for (const item of TIER2_ITEMS) {
    assert.ok(item.icon && item.name() && item.desc(), `${item.id}: іконка, назва й опис на місці`);
    assert.ok(item.id.startsWith('t2-'), `${item.id}: id ярусу має власний префікс`);
    // «суперник» — інший товар ТІЄЇ Ж пари, і посилання взаємне
    const rival = tier2Item(item.rival);
    assert.ok(rival, `${item.id}: суперник існує`);
    assert.equal(rival.pair, item.pair, `${item.id}: суперник із тієї ж пари`);
    assert.equal(rival.rival, item.id, `${item.id}: посилання взаємне`);
  }
});

test('BASE_BRANCH дзеркалить реальні max із shop.js', () => {
  // shop.js імпортує tier2.js, тож зворотного імпорту нема — звіряємо тут,
  // щоб гілка й гейт не розійшлися мовчки, якщо колись піднімуть max товару.
  for (const step of BASE_BRANCH) {
    assert.equal(step.max, shopMax(step.id), `${step.id}: max збігається з shop.js`);
  }
  assert.equal(BASE_BRANCH.length, 6, 'у базовій гілці шість позицій');
});

test('ціни ярусу на порядок вищі за базову гілку', () => {
  const baseTotal = BASE_BRANCH.reduce((sum, s) => sum + shopPrice(s.id) * s.max, 0);
  assert.equal(baseTotal, 2100, 'базова гілка коштує 2100 монет');
  for (const item of TIER2_ITEMS) {
    assert.ok(item.price >= 3000 && item.price <= 6000, `${item.id}: ціна ${item.price} у межах 3000–6000`);
  }
  // вітрина магазину бере товари ЗВІДСИ, а не дублює їх — інакше ціни розійшлися б
  assert.match(shopSrc, /TIER2_ITEMS\.map\(/, 'shop.js розкладає TIER2_ITEMS у SHOP_ITEMS');
  assert.equal(shopPrice('t2-carapace'), null, 'у shop.js власної ціни ярусу нема');
  // у парі ціни однакові — інакше «вибір» перетворився б на «візьми дешевше»
  for (const pair of TIER2_PAIRS) {
    assert.equal(pair.items[0].price, pair.items[1].price, `${pair.id}: у парі однакова ціна`);
  }
  const oneOfEach = TIER2_PAIRS.reduce((sum, p) => sum + p.items[0].price, 0);
  assert.equal(oneOfEach, 11000, 'по одному з кожної пари — 11000 монет');
  assert.ok(oneOfEach >= baseTotal * 5, `ярус коштує ≥5 базових гілок (${oneOfEach} проти ${baseTotal})`);
  // ~1400 монет за країну → ярус збирається кілька країн, а не за вечір
  assert.ok(oneOfEach / 1400 >= 7, `на весь ярус треба ≥7 країн (${(oneOfEach / 1400).toFixed(1)})`);
  const cheapest = Math.min(...TIER2_ITEMS.map((i) => i.price));
  assert.ok(cheapest / 1400 >= 2, `навіть найдешевша позиція — ≥2 країни (${(cheapest / 1400).toFixed(1)})`);
});

test('ярус замкнений, поки базова гілка не викуплена ПОВНІСТЮ', () => {
  assert.equal(baseBranchLeft({}), 14, 'свіжий сейв: 14 сходинок базової гілки');
  assert.equal(baseBranchDone({}), false);
  for (const item of TIER2_ITEMS) {
    const lock = tier2Lock({}, item.id);
    assert.equal(lock.kind, 'base', `${item.id}: замок «базова гілка»`);
    assert.equal(lock.left, 14, `${item.id}: підказка каже, скільки лишилось`);
  }
  // не вистачає рівно однієї сходинки — ярус усе ще замкнений
  const almost = { ...FULL_BASE, sneakers: 0 };
  assert.equal(baseBranchLeft(almost), 1);
  assert.equal(baseBranchDone(almost), false);
  assert.equal(tier2Lock(almost, 't2-carapace').kind, 'base');
  // перебір сходинок понад max (легасі-сейв, ручна правка) гілку не ламає
  assert.equal(baseBranchDone({ ...FULL_BASE, maxhp: 99 }), true);
});

test('повна базова гілка відкриває всі шість — без міграції сейва', () => {
  // «старий сейв»: купував усе підряд, зайві ключі й сміття поруч
  const oldSave = { ...FULL_BASE, mapeditor: 1, mapeditorplus: 1, 'angel-action-1': 1, dog: 1 };
  assert.equal(baseBranchDone(oldSave), true);
  for (const item of TIER2_ITEMS) assert.equal(tier2Lock(oldSave, item.id), null, `${item.id}: відкритий`);
  // жодного нового поля сейва ярус не вимагає — усе живе в save.upgrades
  assert.equal(tier2Lock(undefined, 't2-carapace').kind, 'base');
  assert.equal(tier2Lock('сміття', 't2-carapace').kind, 'base');
  assert.equal(tier2Lock(FULL_BASE, 'немає-такого'), null, 'невідомий id — не наша справа');
});

test('покупка одного з пари назавжди закриває друге, інші пари не чіпає', () => {
  const save = { ...FULL_BASE, 't2-carapace': 1 };
  assert.deepEqual(tier2Lock(save, 't2-carapace'), { kind: 'owned', item: tier2Item('t2-carapace') });
  const rivalLock = tier2Lock(save, 't2-nanoplates');
  assert.equal(rivalLock.kind, 'rival');
  assert.equal(rivalLock.rival.id, 't2-carapace', 'підказка називає того, кого вже обрано');
  // сусідні пари лишились вільними
  for (const id of ['t2-pointblank', 't2-marksman', 't2-ammobelt', 't2-quickhands']) {
    assert.equal(tier2Lock(save, id), null, `${id}: інша пара відкрита`);
  }
  assert.equal(tier2Chosen(save, 'body').id, 't2-carapace');
  assert.equal(tier2Chosen(save, 'shot'), null);
  assert.equal(tier2Chosen(save, 'немає'), null);
});

test('ефекти: кожна покупка дає рівно свій модифікатор і нічого зайвого', () => {
  const neutral = neutralTier2Mods();
  assert.deepEqual(tier2Mods({}), neutral, 'без покупок — нейтральний набір');
  assert.deepEqual(tier2Mods(FULL_BASE), neutral, 'сама лише базова гілка нічого не додає');
  // гейт діє і на ефект: сейв із товаром, але без повної гілки, сили не отримує
  assert.deepEqual(tier2Mods({ 't2-carapace': 1 }), neutral, 'без базової гілки ефекту нема');

  const only = (id) => tier2Mods({ ...FULL_BASE, [id]: 1 });
  const diff = (mods) => Object.fromEntries(Object.entries(mods).filter(([k, v]) => v !== neutral[k]));

  assert.deepEqual(diff(only('t2-carapace')), { maxArmor: TIER2.carapaceArmor });
  assert.deepEqual(diff(only('t2-nanoplates')), { armorRegen: TIER2.plateRegen, armorRegenDelay: TIER2.plateDelay });
  assert.deepEqual(diff(only('t2-pointblank')), { closeMult: TIER2.closeMult, closeRange: TIER2.closeRange });
  assert.deepEqual(diff(only('t2-marksman')), { farMult: TIER2.farMult, farRange: TIER2.farRange });
  assert.deepEqual(diff(only('t2-ammobelt')), { ammoMult: TIER2.ammoMult });
  assert.deepEqual(diff(only('t2-quickhands')), { reloadMult: TIER2.reloadMult });

  // по одному з кожної пари — три ефекти складаються
  const build = tier2Mods({ ...FULL_BASE, 't2-nanoplates': 1, 't2-marksman': 1, 't2-quickhands': 1 });
  assert.equal(build.armorRegen, TIER2.plateRegen);
  assert.equal(build.farMult, TIER2.farMult);
  assert.equal(build.reloadMult, TIER2.reloadMult);
  assert.equal(build.maxArmor, 0, 'непридбаний Панцир броні не дає');
  assert.equal(build.closeMult, 1, 'непридбаний Впритул шкоди не дає');
  assert.equal(build.ammoMult, 1, 'непридбаний Патронташ патронів не дає');

  // зіпсований сейв з ОБОМА товарами пари не подвоює вісь — беремо перше за таблицею
  const broken = tier2Mods({ ...FULL_BASE, 't2-carapace': 1, 't2-nanoplates': 1 });
  assert.equal(broken.maxArmor, TIER2.carapaceArmor);
  assert.equal(broken.armorRegen, 0, 'друге з пари не застосовується навіть із зіпсованого сейва');
});

test('множник шкоди за дистанцією працює рівно у своїх межах', () => {
  const near = tier2Mods({ ...FULL_BASE, 't2-pointblank': 1 });
  const far = tier2Mods({ ...FULL_BASE, 't2-marksman': 1 });
  const none = neutralTier2Mods();
  assert.equal(rangeDamageMult(near, 0), TIER2.closeMult, 'впритул — у нуль метрів');
  assert.equal(rangeDamageMult(near, TIER2.closeRange), TIER2.closeMult, 'рівно на межі — ще діє');
  assert.equal(rangeDamageMult(near, TIER2.closeRange + 0.1), 1, 'за межею — ні');
  assert.equal(rangeDamageMult(near, 60), 1);
  assert.equal(rangeDamageMult(far, TIER2.farRange - 0.1), 1, 'ближче за поріг — ні');
  assert.equal(rangeDamageMult(far, TIER2.farRange), TIER2.farMult, 'рівно на межі — діє');
  assert.equal(rangeDamageMult(far, 120), TIER2.farMult);
  assert.equal(rangeDamageMult(far, 5), 1);
  // «мертвої зони» між парами немає — вони взаємно виключні, тож 12..25 м без бонусу
  assert.ok(TIER2.closeRange < TIER2.farRange, 'пороги не перетинаються');
  for (const mods of [none, near, far]) {
    assert.equal(rangeDamageMult(mods, NaN), 1, 'сміттєва дистанція — множник 1');
    assert.equal(rangeDamageMult(mods, -3), 1);
  }
  assert.equal(rangeDamageMult(null, 5), 1);
});

test('легальна шкода з ярусом не впирається в кооп-стелю clampDmg', () => {
  // стелю читаємо просто з src/net/host.js — щоб тест ловив її зміну
  const hostSrc = readFileSync(new URL('net/host.js', root), 'utf8');
  const cap = Number(hostSrc.match(/Math\.min\((\d+), Number\(v\)/)[1]);
  assert.equal(cap, 2000, 'стеля хоста — 2000 за влучання');
  // найбільше базове влучання гри: снайперка (120) × хедшот (×2)
  const sniperHead = 120 * 2;
  // магазин ×1.45 · пасивка Японії ×1.05 · пара карток драфту ×2 (виміряно в тікеті 07 — 731)
  const lateGame = sniperHead * 1.45 * 1.05 * 2;
  assert.ok(Math.round(lateGame) === 731, `пізнє влучання без ярусу = ${Math.round(lateGame)}`);
  const withTier2 = lateGame * Math.max(TIER2.closeMult, TIER2.farMult);
  assert.ok(withTier2 < cap, `з ярусом ${Math.round(withTier2)} < ${cap}`);
  assert.ok(withTier2 * 1.5 < cap, `навіть із запасом ×1.5 (${Math.round(withTier2 * 1.5)}) стеля не досягнута`);
  // пара «Постріл» взаємно виключна, тож ×1.5 і ×1.5 одночасно накластись не можуть
  const both = tier2Mods({ ...FULL_BASE, 't2-pointblank': 1, 't2-marksman': 1 });
  assert.equal(rangeDamageMult(both, 0) * rangeDamageMult(both, 100), TIER2.closeMult, 'сумарно не більше однієї гілки');
});

test('ярус сильніший за базову гілку по своїй осі, але не переписує гру', () => {
  const armorFull = 50 + 50 * shopMax('vest');          // 150 броні з базової гілки
  const hpFull = 100 + 25 * shopMax('maxhp');           // 200 HP з базової гілки
  // 🦺 броня поглинає 60% шкоди, поки є → витримана шкода = (HP + броня) / множник шолома
  const ehp = (hp, armor) => (hp + armor) / 0.85;
  const base = ehp(hpFull, armorFull);
  const carapace = ehp(hpFull, armorFull + TIER2.carapaceArmor);
  assert.ok(carapace / base > 1.3, `Панцир помітний: ×${(carapace / base).toFixed(2)}`);
  assert.ok(carapace / base < 2, `але не подвоює виживання: ×${(carapace / base).toFixed(2)}`);
  // Нанопластини наливають ту саму броню, тільки поступово — повний бак за розумний час
  const refill = armorFull / TIER2.plateRegen;
  assert.ok(refill > 15 && refill < 30, `повне відновлення броні ~${refill.toFixed(0)} с — не миттєве`);
  // шкода: ярус більший за всю гілку «Шкода» (+45%), але лише на СВОЇЙ дистанції
  assert.ok(TIER2.closeMult - 1 >= 0.15 * shopMax('damage'), 'ярус вагоміший за всю гілку «Шкода»');
  assert.ok(TIER2.closeMult <= 1.5 && TIER2.farMult <= 1.5, 'але не більше ніж +50%');
});
