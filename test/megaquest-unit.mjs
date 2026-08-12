// ⚡ Мега-квести: рефреш раз на дві доби НЕ має перевидавати нагороду квесту,
// прогрес якого рахується з сейва (titles3 — титули ніколи не зникають).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const i18n = asData(`
  export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);
  export const keyHint = (touch, key) => key;
  export const getLang = () => 'uk';
`);
const utils = asData(`
  export class RNG {
    constructor(seed) { this.a = (seed >>> 0) || 1; }
    next() { this.a = (this.a * 1664525 + 1013904223) >>> 0; return this.a / 4294967296; }
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  }
`);
const src = readFileSync(new URL('../src/progress.js', import.meta.url), 'utf8')
  .replace("'./utils.js'", `'${utils}'`)
  .replace("'./i18n.js'", `'${i18n}'`);
const { DailyQuests, MEGA_QUEST_REFRESH_MS, MEGA_QUEST_MIN_LEVEL } = await import(asData(src));

// мінімальна гра: усе, чого торкається ensureMegaQuests і видача нагороди
function makeGame(save = {}) {
  return {
    save: {
      coins: 0, crystals: 0, xp: 0, titles: [], gadgetHypers: [], quests: null, megaQuests: {},
      ...save,
    },
    progress: { level: MEGA_QUEST_MIN_LEVEL, addXp() {} },
    audio: { questDone() {} },
    hud: { toast() {}, banner() {} },
    saveGame() {},
  };
}

test('titles3 не друкує монети сам собою після рефрешу', () => {
  const game = makeGame({ titles: ['a', 'b', 'c'] });
  const quests = new DailyQuests(game);
  let now = 1_000_000;

  quests.ensureMegaQuests(now);
  const q = game.save.megaQuests.titles3;
  assert.equal(q.done, true, 'три титули закривають квест');
  assert.equal(game.save.coins, 5000, 'нагорода видається один раз');

  // дві доби без жодної дії гравця — квест оновлюється, але нагороди більше немає
  now += MEGA_QUEST_REFRESH_MS;
  quests.ensureMegaQuests(now);
  assert.equal(q.done, false, 'рефреш через дві доби працює як раніше');
  assert.equal(q.progress, 0, 'прогрес обнулено, наявні титули не зараховуються');
  assert.equal(game.save.coins, 5000, 'нових монет нема');

  // ще сто діб і переведення годинника вперед — так само нуль
  for (let i = 1; i <= 50; i++) quests.ensureMegaQuests(now + i * MEGA_QUEST_REFRESH_MS);
  assert.equal(game.save.coins, 5000, 'годинник уперед не друкує монети');
  assert.equal(game.save.megaQuests.titles3.done, false);
});

test('нові титули після рефрешу нагороду дають', () => {
  const game = makeGame({ titles: ['a', 'b', 'c'] });
  const quests = new DailyQuests(game);
  quests.ensureMegaQuests(1000);
  quests.ensureMegaQuests(1000 + MEGA_QUEST_REFRESH_MS);
  assert.equal(game.save.coins, 5000);

  game.save.titles.push('d', 'e');
  quests.ensureMegaQuests(2000 + MEGA_QUEST_REFRESH_MS);
  assert.equal(game.save.megaQuests.titles3.progress, 2, 'рахуються лише нові титули');
  assert.equal(game.save.coins, 5000, 'на 2/3 нагороди нема');

  game.save.titles.push('f');
  quests.ensureMegaQuests(3000 + MEGA_QUEST_REFRESH_MS);
  assert.equal(game.save.megaQuests.titles3.done, true);
  assert.equal(game.save.coins, 10000, 'три НОВІ титули знову дають 5000');
});

test('старий сейв без base рахує титули як і раніше', () => {
  const game = makeGame({
    titles: ['a', 'b', 'c'],
    megaQuests: { titles3: { progress: 0, done: false } },
  });
  const quests = new DailyQuests(game);
  quests.ensureMegaQuests(1000);
  assert.equal(game.save.megaQuests.titles3.done, true, 'зароблене не відбирається');
  assert.equal(game.save.coins, 5000);
});

test('рефреш звичайного мега-квесту не змінився', () => {
  const game = makeGame();
  const quests = new DailyQuests(game);
  quests.ensureMegaQuests(1000);
  const q = game.save.megaQuests.gadget30;
  q.progress = 30;
  q.done = true;
  q.doneAt = 1000;

  quests.ensureMegaQuests(1000 + MEGA_QUEST_REFRESH_MS - 1);
  assert.equal(q.done, true, 'раніше двох діб квест лишається виконаним');
  quests.ensureMegaQuests(1000 + MEGA_QUEST_REFRESH_MS);
  assert.equal(q.done, false, 'рівно через дві доби квест оновлюється');
  assert.equal(q.progress, 0);
});
