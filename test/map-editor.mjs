import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });

const purchase = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 9999;
  g.test.shopBuy('mapeditor');
  const denied = { coins: g.save.coins, owned: g.save.upgrades.mapeditor || 0 };
  g.save.coins = 10000;
  g.test.shopBuy('mapeditor');
  const bought = { coins: g.save.coins, owned: g.save.upgrades.mapeditor || 0 };
  g.save.coins = 10000;
  g.test.shopBuy('mapeditor');
  return { denied, bought, afterSecond: g.save.coins };
});
check(purchase.denied.coins === 9999 && purchase.denied.owned === 0
  && purchase.bought.coins === 0 && purchase.bought.owned === 1 && purchase.afterSecond === 10000,
  'доступ коштує рівно 10 000 монет і купується один раз', JSON.stringify(purchase));

await page.evaluate(() => window.__game.endLevel());
await page.waitForFunction(() => window.__game?.state === 'globe');
const menu = await page.evaluate(() => ({
  editor: document.getElementById('btn-map-editor').textContent,
  playHidden: document.getElementById('btn-custom-play').hidden,
}));
check(/Створювач карт/.test(menu.editor) && !/🔒/.test(menu.editor) && menu.playHidden,
  'після покупки редактор відкритий, а кнопка гри чекає на збережену карту', JSON.stringify(menu));

await page.evaluate(() => window.__game.startLevel('CUSTOM', { customMap: 'edit' }));
await page.waitForFunction(() => window.__game?.level?.customMap?.editor, null, { timeout: 30000 });
const editor = await page.evaluate(() => {
  const g = window.__game;
  const mode = g.level.customMap;
  const y0 = g.level.player.pos.y;
  g.input.keys.add('Space');
  mode.update(1, g.input, true);
  g.input.keys.delete('Space');
  const points = {
    house: { x: -24, z: 0 }, tree: { x: -12, z: 0 }, lake: { x: 0, z: 0 },
    zombie: { x: 12, z: 0 }, rock: { x: 24, z: 0 }, task: { x: 0, z: -18 },
  };
  for (const [type, point] of Object.entries(points)) mode.place(type, point);
  mode.save();
  return {
    countryId: g.level.countryId,
    blankWorld: g.level.world.colliders.length,
    flew: g.level.player.pos.y > y0,
    toolbar: document.getElementById('map-editor-tools').classList.contains('show'),
    types: g.save.customMap.objects.map((item) => item.type).sort(),
    spawned: mode.spawned,
  };
});
await page.waitForTimeout(700);
check(editor.countryId === 'CUSTOM' && editor.flew && editor.toolbar
  && editor.types.join(',') === 'house,lake,rock,task,tree,zombie'
  && Object.values(editor.spawned).every((count) => count === 1),
  'у порожньому 3D-редакторі можна літати й поставити всі 6 типів', JSON.stringify(editor));

await page.evaluate(() => window.__game.level.customMap.exit());
await page.waitForFunction(() => window.__game?.state === 'globe');
const playVisible = await page.evaluate(() => !document.getElementById('btn-custom-play').hidden);
check(playVisible, 'після збереження в меню зʼявляється кнопка гри');

await page.evaluate(() => window.__game.startLevel('CUSTOM', { customMap: 'play' }));
await page.waitForFunction(() => window.__game?.level?.customMap && !window.__game.level.customMap.editor, null, { timeout: 30000 });
const played = await page.evaluate(() => {
  const g = window.__game;
  const mode = g.level.customMap;
  const task = mode.tasks[0];
  g.level.player.pos.set(task.x, g.level.player.pos.y, task.z);
  g.input.justPressed.add('KeyE');
  mode.update(0.1, g.input, true);
  return {
    zombies: g.level.zombies.list.filter((zombie) => zombie.customPlaced).length,
    taskDone: task.done,
    mapDone: mode.done,
    hud: mode.getHudList(),
    savedObjects: g.save.customMap.objects.length,
  };
});
check(played.zombies === 1 && played.taskDone && played.mapDone && played.hud[0].done && played.savedObjects === 6,
  'збережена карта запускається, її зомбі живі, а поставлене завдання виконується', JSON.stringify(played));

if (errors.length) {
  for (const error of errors) console.log('  ❌', error);
  failed += errors.length;
}
console.log(failed ? `💥 Провалено: ${failed}` : '✅ Створювач карт: покупка → політ → збереження → гра');
await closeTest();
process.exit(failed ? 1 : 0);
