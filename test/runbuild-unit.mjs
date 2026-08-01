// 🎲 Таблиця карток «Прокачки»: старі числові картки + пʼять бойових (v750).
// src/runbuild.js — чистий модуль БЕЗ ІМПОРТІВ, тож імпортуємо його прямо з
// data-URL (package.json тут commonjs, звичайний import '.js' не спрацював би).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/runbuild.js', import.meta.url), 'utf8');
const { CARD_POOL, COMBOS, RunBuild, cardWeight } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// мінімальний двійник гравця: ті самі поля, що ставить Player у конструкторі
const fakePlayer = () => ({
  damageMult: 1, speedMult: 1, maxHealth: 100, health: 100, armor: 0, maxArmor: 50,
  grenades: 2, jumpPower: 7.6, lifeSteal: 0,
  ricochet: 0, critEvery: 0, critMult: 2, chillHit: 0, killBlast: 0, rocketEvery: 0,
});

// детермінований rng з тим самим інтерфейсом, що й ігровий (rng.int)
const seqRng = (values) => {
  let i = 0;
  return { int: () => values[i++ % values.length] };
};

const LEGACY_IDS = [
  'dmg25', 'nades2', 'dmgnade', 'dmg40', 'nades4', 'dmg60', 'boombag', 'nades6', 'dmgvamp',
  'spd12', 'spdheal', 'spd18', 'spdfull', 'spd25', 'spdjump', 'jumphi', 'spdvamp',
  'maxhp25', 'armor', 'maxhp40', 'vamp', 'maxhp60', 'shield30', 'vamp2', 'fortress',
];
const COMBAT_IDS = ['ricochet', 'crithit', 'chillshot', 'killblast', 'rocketvolley'];

test('старі 25 карток лишились на місці', () => {
  const ids = CARD_POOL.map((c) => c.id);
  for (const id of LEGACY_IDS) assert.ok(ids.includes(id), `картка ${id} зникла з пулу`);
  assert.equal(CARD_POOL.length, LEGACY_IDS.length + COMBAT_IDS.length);
  assert.equal(new Set(ids).size, ids.length, 'id карток мають бути унікальні');
});

test('пʼять бойових карток лежать у тому самому пулі з наявними тегами й рідкостями', () => {
  const tags = new Set(['power', 'speed', 'tank']);
  const rarities = new Set(['common', 'rare', 'epic']);
  for (const id of COMBAT_IDS) {
    const card = CARD_POOL.find((c) => c.id === id);
    assert.ok(card, `бойової картки ${id} немає в пулі`);
    assert.ok(tags.has(card.tag), `${id}: чужий тег ${card.tag}`);
    assert.ok(rarities.has(card.rarity), `${id}: чужа рідкість ${card.rarity}`);
    assert.equal(typeof card.name, 'string');
    assert.ok(card.icon && card.name.length > 0);
    assert.equal(typeof card.apply, 'function');
    assert.ok(cardWeight(card) > 0, `${id}: нульова вага у драфті`);
  }
});

test('apply() ставить гравцю саме ті поля, які читає бій', () => {
  const byId = (id) => CARD_POOL.find((c) => c.id === id);

  let p = fakePlayer();
  byId('ricochet').apply(p);
  assert.equal(p.ricochet, 0.5);

  p = fakePlayer();
  byId('crithit').apply(p);
  assert.equal(p.critEvery, 3);
  assert.equal(p.critMult, 2);

  p = fakePlayer();
  byId('chillshot').apply(p);
  assert.equal(p.chillHit, 1.2);

  p = fakePlayer();
  byId('killblast').apply(p);
  assert.equal(p.killBlast, 55);

  p = fakePlayer();
  byId('rocketvolley').apply(p);
  assert.equal(p.rocketEvery, 6);
});

test('бойові картки накопичуються з капом, як lifeSteal (повтор у драфті нічого не ламає)', () => {
  const p = fakePlayer();
  for (let i = 0; i < 8; i++) for (const id of COMBAT_IDS) CARD_POOL.find((c) => c.id === id).apply(p);
  assert.equal(p.ricochet, 0.9, 'рикошет капнутий');
  assert.equal(p.critEvery, 2, 'крит не частіший за кожне друге влучання');
  assert.equal(p.chillHit, 3, 'заморозка капнута');
  assert.equal(p.killBlast, 165, 'вибух капнутий');
  assert.equal(p.rocketEvery, 3, 'ракета не частіша за кожен третій постріл');
  assert.ok(Number.isFinite(p.ricochet) && Number.isFinite(p.chillHit));
});

test('бойові картки переживають серіалізацію збірки Експедиції (restore за id)', () => {
  const live = new RunBuild();
  const player = fakePlayer();
  for (const id of COMBAT_IDS) live.apply(CARD_POOL.find((c) => c.id === id), player);
  assert.deepEqual(live.ids, COMBAT_IDS);

  // наступний етап Експедиції: новий гравець + build з масиву id
  const rebuilt = fakePlayer();
  const restored = new RunBuild().restore(live.ids, rebuilt);
  assert.equal(rebuilt.ricochet, player.ricochet);
  assert.equal(rebuilt.critEvery, player.critEvery);
  assert.equal(rebuilt.chillHit, player.chillHit);
  assert.equal(rebuilt.killBlast, player.killBlast);
  assert.equal(rebuilt.rocketEvery, player.rocketEvery);
  assert.equal(rebuilt.maxHealth, player.maxHealth, 'крос-комбо теж відтворилось');
  assert.deepEqual(restored.picks, live.picks);
  assert.deepEqual(restored.tags, live.tags);
});

test('restore() мовчки пропускає невідомий id (старий сейв із видаленою карткою)', () => {
  const p = fakePlayer();
  const build = new RunBuild().restore(['killblast', 'ghost-card', 'ricochet'], p);
  assert.deepEqual(build.ids, ['killblast', 'ricochet']);
  assert.equal(p.killBlast, 55);
  assert.equal(p.ricochet, 0.5);
});

test('комбо за трьома однаковими тегами спрацьовує і з новими картками', () => {
  const power = CARD_POOL.filter((c) => c.tag === 'power');
  assert.ok(power.some((c) => COMBAT_IDS.includes(c.id)), 'жодної нової картки в тегу power');
  const build = new RunBuild();
  const p = fakePlayer();
  assert.equal(build.apply(power[0], p), null);
  assert.equal(build.apply(power[1], p), null);
  const combatPower = power.find((c) => c.id === 'killblast');
  assert.equal(build.apply(combatPower, p), 'power', 'третя картка тега має добити комбо');
  assert.equal(p.killBlast, 55, 'комбо не з’їло ефект самої картки');
  assert.equal(build.apply(power[3], p), null, 'комбо не повторюється');
});

test('крос-комбо працює на трьох нових картках різних тегів', () => {
  const build = new RunBuild();
  const p = fakePlayer();
  const pick = (id) => build.apply(CARD_POOL.find((c) => c.id === id), p);
  assert.equal(pick('killblast'), null);            // power
  assert.equal(pick('ricochet'), null);             // speed
  assert.equal(pick('chillshot'), 'cross');         // tank → є всі три теги
  assert.equal(p.killBlast, 55);
  assert.equal(p.ricochet, 0.5);
  assert.equal(p.chillHit, 1.2);
  assert.ok(p.maxHealth > 100, 'крос-комбо додало HP');
  assert.ok(p.damageMult > 1 && p.speedMult > 1);
});

test('offer() роздає РІЗНІ картки і вміє видати бойові', () => {
  const build = new RunBuild();
  const offered = build.offer(seqRng([0]), 3);
  assert.equal(offered.length, 3);
  assert.equal(new Set(offered.map((c) => c.id)).size, 3);

  // проходимо всю колоду: кожна картка (у т.ч. нові) має колись випасти
  const seen = new Set();
  const rng = { int: (lo, hi) => Math.floor((lo + hi) / 2) };
  const deck = new RunBuild();
  for (let i = 0; i < 200; i++) for (const c of deck.offer(rng, 3)) { seen.add(c.id); deck.taken.add(c.id); }
  for (const id of COMBAT_IDS) assert.ok(seen.has(id), `бойова картка ${id} ніколи не пропонується`);
});

test('кооп: набір хоста (id) розвертається в картки на боці гостя', () => {
  // draft.openNet(ids) шукає рівно так само — id з CARD_POOL
  const ids = ['ricochet', 'killblast', 'chillshot'];
  const cards = ids.map((id) => CARD_POOL.find((c) => c.id === id)).filter(Boolean);
  assert.equal(cards.length, 3);
  assert.ok(cards.every((c) => c.id && c.name && typeof c.apply === 'function'));
});

test('COMBOS лишились чотирма і не зачіпають бойові поля', () => {
  assert.deepEqual(Object.keys(COMBOS).sort(), ['cross', 'power', 'speed', 'tank']);
  for (const key of Object.keys(COMBOS)) {
    const p = fakePlayer();
    COMBOS[key].apply(p);
    assert.equal(p.ricochet, 0);
    assert.equal(p.killBlast, 0);
    assert.equal(p.chillHit, 0);
    assert.equal(p.critEvery, 0);
    assert.equal(p.rocketEvery, 0);
  }
});
