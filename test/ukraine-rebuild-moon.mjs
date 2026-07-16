import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });

const result = await page.evaluate(() => {
  const g = window.__game;
  const story = g.level.missions;
  const delegate = story.delegate;
  const player = g.level.player;
  const press = () => ({ pressed: (k) => k === 'KeyE', down: () => false, justPressed: new Set(['KeyE']) });
  const hold = { pressed: () => false, down: (k) => k === 'KeyE', justPressed: new Set() };

  for (const id of ['ukr-rescue', 'ukr-signal', 'ukr-defense']) story._completeObjective(id);

  const rebuild = delegate.get('rebuild');
  for (const tool of rebuild.tools) {
    player.pos.set(tool.x, tool.y, tool.z);
    delegate._up_rebuild(rebuild, 0.1, press(), true);
  }
  for (const point of rebuild.points) {
    player.pos.set(point.x, point.y, point.z);
    delegate._up_rebuild(rebuild, 1.2, hold, true);
  }
  player.pos.set(rebuild.dest.x, rebuild.dest.y, rebuild.dest.z);
  delegate._up_rebuild(rebuild, 30, hold, true);
  story._syncObjectiveStates();

  const bases = delegate.get('bases');
  for (const base of bases.nestList) {
    player.pos.set(base.x, base.y, base.z);
    delegate._up_bases(bases, 4, hold, true);
  }
  story._syncObjectiveStates();

  const moon = delegate.get('moonrescue');
  for (const item of moon.items) {
    player.pos.set(item.x, item.y, item.z);
    delegate._up_moonrescue(moon, 0.1, press(), true);
  }
  player.pos.set(moon.dest.x, moon.dest.y, moon.dest.z);
  delegate._up_moonrescue(moon, 10, hold, true);
  story._syncObjectiveStates();

  return {
    ids: story.objectives.map((o) => o.id),
    states: story.objectives.map((o) => o.state),
    rebuild: { wood: rebuild.wood, stone: rebuild.stone, progress: rebuild.buildProgress, monument: !!rebuild.rebuilt },
    bases: bases.cleared,
    moon: { found: moon.found, delivered: moon.delivered, night: g.level.nightK },
    bossUnlocked: story.bossUnlocked,
  };
});

check(result.ids.slice(-3).join(',') === 'ukr-rebuild,ukr-bases,ukr-moon',
  'Україна має новий ланцюжок завдань', JSON.stringify(result.ids));
check(result.rebuild.wood === 120 && result.rebuild.stone === 50 && result.rebuild.progress === 1 && result.rebuild.monument,
  'сокира/кірка → 120 дерева + 50 каменю → 30 секунд відбудови', JSON.stringify(result.rebuild));
check(result.bases === 3, 'зачищено 3 зомбі-бази', String(result.bases));
check(result.moon.found === 3 && result.moon.delivered && result.moon.night === 1,
  '3 уламки повертають Місяць і ніч', JSON.stringify(result.moon));
check(result.states.every((state) => state === 'done') && result.bossUnlocked,
  'після всіх завдань відкривається бос', JSON.stringify(result));

if (errors.length) {
  for (const error of errors) console.log('  ❌', error);
  failed += errors.length;
}
console.log(failed ? `💥 Провалено: ${failed}` : '✅ Нові завдання України працюють');
await closeTest();
process.exit(failed ? 1 : 0);
