// 🗓️ Сезон: детермінізм сходинок, знімок бази, прогрес із наявних лічильників, клейм.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const src = readFileSync(new URL('season.js', root), 'utf8')
  .replace("from './i18n.js'", "from './_i18n.mjs'")
  .replace("from './net/cloudsave.js'", "from './_cloud.mjs'");

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const resolved = src
  .replace('./_i18n.mjs', asData('export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);'))
  .replace('./_cloud.mjs', asData('export const liberatedCount = (l = {}) => Object.keys(l || {}).filter((id) => l[id]).length;'));
const season = await import(asData(resolved));
const {
  SEASON_POOL, SEASON_STEPS, SEASON_WEEKS,
  seasonIndex, seasonSteps, ensureSeason, seasonState, claimSeasonStep, stepReward,
  SEASON_EPOCH_WEEK,
} = season;
const W = SEASON_EPOCH_WEEK;   // тиждень старту Сезону 1

test('season lasts six weeks and holds twelve unique steps', () => {
  assert.equal(SEASON_WEEKS, 6);
  assert.equal(SEASON_STEPS, 12);
  assert.equal(seasonIndex(W), 0, 'тиждень релізу — Сезон 1');
  assert.equal(seasonIndex(W + 5), 0);
  assert.equal(seasonIndex(W + 6), 1);
  assert.equal(seasonIndex(W + 13), 2);
  assert.equal(seasonIndex(W - 100), 0, 'старий сейв не дає від\'ємний сезон');
  assert.equal(seasonIndex(undefined), 0);

  for (let s = 0; s < 40; s++) {
    const steps = seasonSteps(s);
    assert.equal(steps.length, SEASON_STEPS, `сезон ${s}: 12 сходинок`);
    assert.equal(new Set(steps.map((x) => x.id)).size, SEASON_STEPS, `сезон ${s}: без повторів`);
    for (const step of steps) assert.ok(SEASON_POOL.includes(step), 'сходинка з пулу');
  }
  assert.deepEqual(seasonSteps(3).map((s) => s.id), seasonSteps(3).map((s) => s.id), 'детерміновано');
  assert.notDeepEqual(seasonSteps(0).map((s) => s.id), seasonSteps(1).map((s) => s.id), 'сезони різні');
});

test('every pool entry drives the player into a distinct place', () => {
  const modes = SEASON_POOL.filter((s) => s.metric === 'mode').map((s) => s.mode);
  assert.equal(new Set(modes).size, modes.length, 'жоден режим не дублюється в пулі');
  assert.ok(modes.length >= 12, 'пул покриває щонайменше 12 режимів');
  assert.deepEqual(
    [...new Set(SEASON_POOL.map((s) => s.metric))].sort(),
    ['friends', 'kills', 'liberated', 'mode'],
  );
});

test('base snapshot means old wins do not pre-complete steps', () => {
  const save = { modeWins: { knockout: 9, defense: 4 }, liberated: { UKR: true }, stats: { killed: 900 }, friends: { UKR: true } };
  ensureSeason(save, W);
  const state = seasonState(save, W);
  assert.equal(state.index, 0);
  assert.ok(state.steps.every((s) => s.progress === 0), 'старі перемоги не зараховані');
  assert.equal(state.claimable, 0);
});

test('progress is read from existing counters and step can be claimed once', () => {
  const save = { modeWins: {}, liberated: {}, stats: { killed: 0 }, friends: {} };
  ensureSeason(save, W);
  const target = seasonSteps(0).find((s) => s.metric === 'mode');
  save.modeWins[target.mode] = target.target;

  const before = seasonState(save, W);
  const step = before.steps.find((s) => s.id === target.id);
  assert.equal(step.done, true);
  assert.equal(step.claimed, false);
  assert.equal(before.claimable, 1);
  assert.equal(before.next.id, target.id, 'компас веде до незабраної нагороди');

  const reward = claimSeasonStep(save, W, target.id);
  assert.ok(reward && reward.crystals > 0 && reward.xp > 0);
  assert.equal(claimSeasonStep(save, W, target.id), null, 'двічі не забрати');
  assert.equal(seasonState(save, W).claimable, 0);
});

test('new season resets steps and takes a fresh snapshot', () => {
  const save = { modeWins: {}, liberated: {}, stats: { killed: 0 }, friends: {} };
  ensureSeason(save, W);
  const first = seasonSteps(0).find((s) => s.metric === 'mode');
  save.modeWins[first.mode] = first.target;
  claimSeasonStep(save, W, first.id);
  assert.equal(save.season.claimed.length, 1);

  ensureSeason(save, W + SEASON_WEEKS);       // наступний сезон
  assert.equal(save.season.i, 1);
  assert.deepEqual(save.season.claimed, [], 'клейми нового сезону чисті');
  const state = seasonState(save, W + SEASON_WEEKS);
  assert.ok(state.steps.every((s) => s.progress === 0), 'нова база — прогрес з нуля');
});

test('done but unclaimed step moves into the new season instead of freezing it', () => {
  const save = { modeWins: {}, liberated: {}, stats: { killed: 0 }, friends: {} };
  ensureSeason(save, W);
  const target = seasonSteps(0).find((s) => s.metric === 'mode');
  save.modeWins[target.mode] = target.target;   // сходинка виконана, «Забрати» не тиснули

  ensureSeason(save, W + SEASON_WEEKS);         // сезон змінився
  assert.equal(save.season.i, 1, 'сезон котиться далі, а не чекає на клейм');
  assert.deepEqual(save.season.claimed, [], 'клейми нового сезону чисті');
  assert.deepEqual(save.season.carry.map((c) => c.id), [target.id], 'незабране переїхало');

  const held = seasonState(save, W + SEASON_WEEKS);
  assert.equal(held.index, 1);
  assert.equal(held.claimable, 1, 'незабрана нагорода лишається доступною в новому сезоні');
  const moved = held.steps.find((s) => s.carried);
  assert.ok(moved && moved.done && !moved.claimed && moved.title === target.title(target.target));
  assert.ok(held.steps.filter((s) => !s.carried).every((s) => s.progress === 0), 'нова база — прогрес з нуля');

  const reward = claimSeasonStep(save, W + SEASON_WEEKS, moved.id);
  assert.ok(reward && reward.crystals > 0, 'нагороду видано через межу сезону');
  assert.equal(claimSeasonStep(save, W + SEASON_WEEKS, moved.id), null, 'повторно нагороду не дають');
  assert.equal(seasonState(save, W + SEASON_WEEKS).claimable, 0);
  assert.deepEqual(save.season.carry, [], 'забране зі списку переносу зникло');
});

test('carried reward never blocks the next rollover and does not pile up', () => {
  const save = { modeWins: {}, liberated: {}, stats: { killed: 0 }, friends: {} };
  ensureSeason(save, W);
  const target = seasonSteps(0).find((s) => s.metric === 'mode');
  save.modeWins[target.mode] = target.target;

  ensureSeason(save, W + SEASON_WEEKS);         // сезон 2: нагорода переїхала
  ensureSeason(save, W + SEASON_WEEKS * 2);     // сезон 3: так і не забрали
  assert.equal(save.season.i, 2, 'перенесене не тримає сезон');
  assert.deepEqual(save.season.carry.map((c) => c.id), [target.id], 'дублікатів не з\'явилось');
  assert.equal(seasonState(save, W + SEASON_WEEKS * 2).claimable, 1, 'нагорода й далі чекає');

  // сходинку нового сезону забрали — вона в claimed і НЕ переїжджає далі
  const fresh = seasonSteps(2).find((s) => s.metric === 'mode' && s.id !== target.id);
  save.modeWins[fresh.mode] = (save.modeWins[fresh.mode] | 0) + fresh.target;
  assert.ok(claimSeasonStep(save, W + SEASON_WEEKS * 2, fresh.id));
  ensureSeason(save, W + SEASON_WEEKS * 3);
  assert.deepEqual(save.season.carry.map((c) => c.id), [target.id], 'забране не переносять');
});

test('old save without carry keeps working', () => {
  const save = { modeWins: {}, liberated: {}, stats: { killed: 0 }, friends: {}, season: { i: 0, base: {}, claimed: [] } };
  const state = seasonState(save, W);
  assert.equal(state.index, 0);
  assert.ok(Array.isArray(save.season.carry), 'carry добудовано без втрати сезону');
  assert.deepEqual(save.season.claimed, []);
});

test('rewards grow and the last step carries the season title', () => {
  const rewards = Array.from({ length: SEASON_STEPS }, (_, i) => stepReward(i));
  assert.ok(rewards.every((r) => r.crystals > 0 && r.xp > 0));
  assert.equal(rewards.filter((r) => r.eggs > 0).length, 3, 'яйце кожні 4 сходинки');
  assert.equal(rewards.at(-1).title, 'season_hero');
  assert.equal(rewards.filter((r) => r.title).length, 1, 'титул лише за фінал');
  assert.ok(rewards.at(-1).crystals > rewards[0].crystals);
});

test('malformed save never throws', () => {
  assert.equal(ensureSeason(null, 0), null);
  const broken = { season: 'nope', modeWins: null, stats: null };
  const state = seasonState(broken, W + 3);
  assert.equal(state.steps.length, SEASON_STEPS);
  assert.equal(state.claimable, 0);
});
