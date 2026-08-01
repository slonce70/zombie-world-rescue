// ⭐ Вторинні цілі забігу (⭐2) і пороги зірок: розмір пулу, гейт за зіркою складності,
// детермінізм вибору, кооп-підмножина, forceId і умови (gate/measure) важких цілей.
// Чистий модуль → тестуємо в node напряму, підмінюючи імпорти через data-URL
// (той самий прийом, що в test/season-unit.mjs і test/countrypowers-unit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const src = readFileSync(new URL('stars.js', root), 'utf8')
  .replace("from './i18n.js'", "from './_i18n.mjs'")
  .replace("from './countries.js'", "from './_countries.mjs'");

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const resolved = src
  .replace('./_i18n.mjs', asData('export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);'))
  .replace('./_countries.mjs', asData(
    "export const CAMPAIGN_ORDER = ['UKR','POL','DEU','FRA','ESP','PRT','ITA','TUR','SWE','EGY','JPN','CHN'];",
  ));
const stars = await import(asData(resolved));
const {
  STARS_PER_COUNTRY, CAMPAIGN_STAR_MAX, STAR_THRESHOLDS, SECONDARY_OBJECTIVE_IDS,
  COOP_SECONDARY_IDS, secondaryPool, pickSecondaryObjective, starTotal, countryStars,
} = stars;

// країна-заглушка: важать лише seed і difficulty.counts (масштаб «монет»/«зомбі»)
const COUNTRY = { id: 'UKR', seed: 7, difficulty: { hp: 1, dmg: 1, counts: 2 } };
const EASY = { id: 'UKR', seed: 7, difficulty: { hp: 1, dmg: 1, counts: 1 } };

// ті чотири цілі, що були в грі до v750 — межа «дитячого» набору ★1
const LEGACY = ['elites', 'megabox', 'coins', 'headshots'];

test('пул виріс приблизно до чотирнадцяти різних цілей', () => {
  const all = secondaryPool(5);
  assert.equal(all.length, 14, 'усього 14 цілей');
  assert.equal(new Set(all.map((o) => o.id)).size, all.length, 'жоден id не дублюється');
  assert.deepEqual(SECONDARY_OBJECTIVE_IDS, all.map((o) => o.id));
  for (const o of all) {
    assert.ok(o.id && o.ev && o.icon, `${o.id}: id/ev/іконка на місці`);
    assert.ok(Number.isInteger(o.diffStar) && o.diffStar >= 1 && o.diffStar <= 5, `${o.id}: diffStar 1..5`);
    assert.equal(typeof o.coop, 'boolean', `${o.id}: явно позначена кооп-видимість`);
    assert.equal(typeof o.target, 'function', `${o.id}: є target()`);
    assert.equal(typeof o.label, 'function', `${o.id}: є label()`);
  }
});

test('★1 лишається сьогоднішнім дитячим набором — важкого там нема', () => {
  const easy = secondaryPool(1).map((o) => o.id);
  for (const id of LEGACY) assert.ok(easy.includes(id), `★1 містить стару ціль ${id}`);
  // усі ★1-цілі закриваються самі по ходу забігу: жодна не має умови-заперечення
  for (const o of secondaryPool(1)) {
    assert.ok(!o.gate || o.id === 'kills', `★1 ціль ${o.id} без вимогливої умови`);
  }
  // важкі цілі на ★1 недоступні
  for (const hard of ['nogadget', 'accuracy', 'flawless', 'bossfast', 'pistol', 'combo', 'noshop']) {
    assert.ok(!easy.includes(hard), `★1 НЕ видає ${hard}`);
  }
});

test('пул росте зіркою складності і лишається кумулятивним', () => {
  const sizes = [1, 2, 3, 4, 5].map((s) => secondaryPool(s).length);
  assert.deepEqual(sizes, [7, 9, 11, 13, 14]);
  for (let s = 2; s <= 5; s++) {
    const prev = new Set(secondaryPool(s - 1).map((o) => o.id));
    const cur = secondaryPool(s).map((o) => o.id);
    for (const id of prev) assert.ok(cur.includes(id), `★${s} не втратив ціль ${id}`);
  }
  assert.ok(secondaryPool(4).map((o) => o.id).includes('nogadget'), 'найжорсткіші — з ★4');
  assert.ok(!secondaryPool(4).map((o) => o.id).includes('flawless'), '«без єдиного удару» — лише ★5');
  assert.ok(secondaryPool(5).map((o) => o.id).includes('flawless'));
});

test('сміття у зірці складності падає у бік легшого (★1)', () => {
  const easy = secondaryPool(1).map((o) => o.id);
  for (const junk of [undefined, null, 0, -3, 99, 'ой', {}, NaN]) {
    assert.deepEqual(secondaryPool(junk).map((o) => o.id), easy, `«${String(junk)}» → пул ★1`);
  }
  // числовий рядок лишається валідним — так само поводиться sanitizeDiffStar у net/protocol.js
  assert.equal(secondaryPool('5').length, 14);
});

test('вибір цілі детермінований від сіда — двоє в коопі отримають ОДНУ ціль', () => {
  for (let seed = -5; seed < 40; seed++) {
    for (const star of [1, 3, 5]) {
      const a = pickSecondaryObjective(COUNTRY, seed, null, star);
      const b = pickSecondaryObjective(COUNTRY, seed, null, star);
      assert.equal(a.id, b.id, `сід ${seed}, ★${star}: той самий вибір`);
      assert.ok(secondaryPool(star).some((o) => o.id === a.id), 'ціль із пулу своєї зірки');
      assert.ok(a.target >= 1 && a.progress === 0 && a.done === false, 'свіжий живий об’єкт');
      assert.equal(typeof a.label(), 'string');
    }
  }
  // сусідні сіди розводять цілі — гравець не бачить ту саму щоразу
  const ids = new Set();
  for (let seed = 0; seed < 14; seed++) ids.add(pickSecondaryObjective(COUNTRY, seed, null, 5).id);
  assert.equal(ids.size, 14, 'на ★5 чотирнадцять сідів дають усі чотирнадцять цілей');
});

test('кооп-пул — лише те, що ХОСТ бачить авторитетно', () => {
  assert.deepEqual(COOP_SECONDARY_IDS, ['elites', 'megabox', 'kills', 'bossfast']);
  for (const star of [1, 2, 3, 4, 5]) {
    const coop = secondaryPool(star, true);
    for (const o of coop) {
      assert.ok(o.coop, `${o.id} позначена як хост-авторитетна`);
      assert.ok(o.diffStar <= star, `${o.id} не проліз повз зірку ★${star}`);
    }
    // прогрес цих хост НЕ бачить — у кооп-пул вони не потрапляють ніколи
    for (const local of ['coins', 'headshots', 'pickups', 'scooter', 'combo', 'noshop', 'pistol', 'nogadget', 'accuracy', 'flawless']) {
      assert.ok(!coop.some((o) => o.id === local), `★${star}: ${local} поза кооп-пулом`);
    }
  }
  assert.deepEqual(secondaryPool(1, true).map((o) => o.id), ['elites', 'megabox', 'kills']);
  assert.deepEqual(secondaryPool(3, true).map((o) => o.id), ['elites', 'megabox', 'kills', 'bossfast']);
});

test('forceId дає рівно замовлену ціль і обходить фільтр зірки (тестовий хук)', () => {
  for (const id of SECONDARY_OBJECTIVE_IDS) {
    const so = pickSecondaryObjective(COUNTRY, 0, id, 1);
    assert.equal(so.id, id, `_forceSecondary='${id}' працює навіть на ★1`);
  }
  // невідомий id не ламає забіг — падаємо у звичайний вибір за сідом
  const fallback = pickSecondaryObjective(COUNTRY, 3, 'no-such-goal', 1);
  assert.equal(fallback.id, pickSecondaryObjective(COUNTRY, 3, null, 1).id);
});

test('цілі-лічильники масштабуються складністю країни', () => {
  assert.equal(pickSecondaryObjective(EASY, 0, 'coins').target, 150);
  assert.equal(pickSecondaryObjective(COUNTRY, 0, 'coins').target, 300);
  assert.equal(pickSecondaryObjective(EASY, 0, 'kills').target, 25);
  assert.equal(pickSecondaryObjective(COUNTRY, 0, 'kills').target, 50);
  assert.equal(pickSecondaryObjective(COUNTRY, 0, 'elites').target, 2, 'еліти не масштабуються');
  // ціль без країни (реконструкція зі стану в net/client.js) не падає
  assert.ok(pickSecondaryObjective(null, 0, 'coins').target >= 1);
});

test('умови важких цілей читають стан рівня, а не власну телеметрію', () => {
  const lvl = (over = {}) => ({
    stats: { time: 0, shotsFired: 0, shotsHit: 0 }, combo: { n: 0 }, player: { cur: 'pistol' }, ...over,
  });

  const noshop = pickSecondaryObjective(COUNTRY, 0, 'noshop');
  assert.equal(noshop.gate(lvl()), true, 'нічого не куплено — ціль зараховується');
  assert.equal(noshop.gate(lvl({ coinsSpent: 300 })), false, 'покупка за забіг ламає ціль');

  const nogadget = pickSecondaryObjective(COUNTRY, 0, 'nogadget');
  assert.equal(nogadget.gate(lvl()), true);
  assert.equal(nogadget.gate(lvl({ gadgetUsed: true })), false);

  const flawless = pickSecondaryObjective(COUNTRY, 0, 'flawless');
  assert.equal(flawless.gate(lvl()), false, 'без відкритого вікна бою з босом — не зараховуємо');
  assert.equal(flawless.gate(lvl({ bossHitFree: true })), true);
  assert.equal(flawless.gate(lvl({ bossHitFree: false })), false);

  const fast = pickSecondaryObjective(COUNTRY, 0, 'bossfast');
  assert.equal(fast.need, 9);
  assert.equal(fast.gate(lvl({ stats: { time: 9 * 60 - 1 } })), true);
  assert.equal(fast.gate(lvl({ stats: { time: 9 * 60 + 1 } })), false);
  assert.match(fast.label(), /9/, 'у тексті — ті самі хвилини, що в умові');

  const acc = pickSecondaryObjective(COUNTRY, 0, 'accuracy');
  assert.equal(acc.need, 60);
  assert.equal(acc.gate(lvl({ stats: { shotsFired: 10, shotsHit: 10 } })), false, 'один влучний постріл не рахується');
  assert.equal(acc.gate(lvl({ stats: { shotsFired: 100, shotsHit: 59 } })), false);
  assert.equal(acc.gate(lvl({ stats: { shotsFired: 100, shotsHit: 60 } })), true);
  assert.match(acc.label(), /60/);

  const pistol = pickSecondaryObjective(COUNTRY, 0, 'pistol');
  assert.equal(pistol.gate(lvl()), true);
  assert.equal(pistol.gate(lvl({ player: { cur: 'shotgun' } })), false, 'інша зброя не тікає ціль');
  assert.equal(pistol.gate(lvl({ bossDefeated: true })), false, 'переможний «салют» не дарує ціль');

  const kills = pickSecondaryObjective(COUNTRY, 0, 'kills');
  assert.equal(kills.gate(lvl()), true);
  assert.equal(kills.gate(lvl({ bossDefeated: true })), false, 'зачистка після боса не рахується');

  const combo = pickSecondaryObjective(COUNTRY, 0, 'combo');
  assert.equal(combo.gate, null, 'комбо не має умови — воно вимірюється');
  assert.equal(combo.measure(lvl({ combo: { n: 7 } })), 7);
  assert.equal(combo.measure(lvl()), 0);
});

test('пороги 12/24/36 важать стільки, скільки коштує кампанія', () => {
  assert.equal(CAMPAIGN_STAR_MAX, 36);
  assert.equal(STARS_PER_COUNTRY, 3);
  assert.deepEqual(STAR_THRESHOLDS.map((th) => th.at), [12, 24, 36]);
  assert.equal(new Set(STAR_THRESHOLDS.map((th) => th.at)).size, 3, 'ключ клейма унікальний');
  const [t12, t24, t36] = STAR_THRESHOLDS;
  assert.equal(t12.coins, 2500);
  assert.equal(t24.crystals, 40);
  assert.equal(t36.crystals, 100);
  assert.equal(t36.title, 'star_savior', 'титул за ідеальну кампанію лишився');
  for (const th of STAR_THRESHOLDS) {
    assert.ok(th.coins || th.crystals || th.title, `поріг ${th.at} щось дає`);
    assert.equal(typeof th.label(), 'string');
  }
});

test('лічильник зірок сейва лишився безпечним для будь-якого сміття', () => {
  assert.equal(starTotal(null), 0);
  assert.equal(starTotal({ stars: 'ой' }), 0);
  assert.equal(starTotal({ stars: { UKR: 3, POL: 99, LAB: 3 } }), 6, 'LAB поза кампанією, 99 → 3');
  assert.equal(countryStars({ stars: { UKR: -2 } }, 'UKR'), 0);
});
