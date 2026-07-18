import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });

await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 9999;
  g.shop.open();
});
await page.locator('.shop-tab[data-cat="Режими"]').click();
await page.locator('.shop-item[data-id="mapeditor"]').click();
const denied = await page.evaluate(() => ({ coins: window.__game.save.coins, owned: window.__game.save.upgrades.mapeditor || 0 }));
await page.evaluate(() => { window.__game.save.coins = 10000; window.__game.shop.render(); });
await page.locator('.shop-item[data-id="mapeditor"]').click();
const bought = await page.evaluate(() => ({ coins: window.__game.save.coins, owned: window.__game.save.upgrades.mapeditor || 0 }));
await page.evaluate(() => { window.__game.save.coins = 10000; window.__game.shop.render(); });
await page.locator('.shop-item[data-id="mapeditor"]').click();
const afterSecond = await page.evaluate(() => window.__game.save.coins);
const purchase = { denied, bought, afterSecond };
check(purchase.denied.coins === 9999 && purchase.denied.owned === 0
  && purchase.bought.coins === 0 && purchase.bought.owned === 1 && purchase.afterSecond === 10000,
  'доступ купується через справжню вкладку «Режими» рівно один раз за 10 000', JSON.stringify(purchase));

await page.evaluate(() => { window.__game.shop.close(); window.__game.endLevel(); });
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
  const player = g.level.player;
  const request = g.input.request;
  let lockRequested = 0;
  g.input.request = () => { lockRequested++; };
  document.querySelector('[data-map-object="tree"]').click();
  g.input.request = request;
  player.yaw = 0;
  player.pitch = 1.45;
  const highLookTarget = mode._targetPoint();
  const highLookDistance = Math.hypot(highLookTarget.x - player.pos.x, highLookTarget.z - player.pos.z);
  player.pitch = 0;
  const move = (code, shift = false) => {
    player.pos.set(0, 14, 55);
    g.input.keys.add(code);
    if (shift) g.input.keys.add('ShiftLeft');
    mode.update(1, g.input, true);
    g.input.keys.delete(code);
    g.input.keys.delete('ShiftLeft');
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z };
  };
  const moves = {
    w: move('KeyW'), s: move('KeyS'), a: move('KeyA'), d: move('KeyD'),
    up: move('Space'), down: move('ControlLeft'), fast: move('KeyW', true),
  };
  player.pos.set(0, 14, 55);
  const beforeSelect = mode.data.objects.length;
  g.input.justPressed.add('Digit1');
  mode.update(1 / 60, g.input, true);
  g.input.justPressed.clear();
  const selectedOnly = mode.data.objects.length === beforeSelect;
  g.input.justPressed.add('KeyE');
  mode.update(0.01, g.input, true);
  g.input.justPressed.clear();
  const points = {
    tree: { x: -24, z: 0 }, lake: { x: -10, z: 0 },
    zombie: { x: 12, z: 0 }, rock: { x: 24, z: 0 },
  };
  for (const [type, point] of Object.entries(points)) mode.place(type, point);
  for (const point of [{ x: 0, z: -20 }, { x: 45, z: -25 }, { x: -45, z: -25 }]) mode.place('task', point);
  const rejected = {
    spawn: mode.place('rock', { x: 0, z: 55 }),
    overlap: mode.place('tree', { x: -24, z: 0 }),
    edge: mode.place('task', { x: 171, z: 0 }),
    taskLimit: mode.place('task', { x: 0, z: -55 }),
  };
  const solid = {};
  for (const [type, start, dt] of [['house', 6, 0.4], ['tree', 3, 0.2], ['rock', 3, 0.2]]) {
    const item = mode.data.objects.find((object) => object.type === type);
    player.pos.set(item.x, 3, item.z + start);
    player.yaw = 0;
    g.input.keys.add('KeyW');
    mode.update(dt, g.input, true);
    g.input.keys.delete('KeyW');
    solid[type] = Math.hypot(player.pos.x - item.x, player.pos.z - item.z);
  }
  mode.save();
  return {
    countryId: g.level.countryId,
    blankWorld: g.level.world.colliders.length,
    moves,
    selectedOnly,
    lockRequested,
    highLookDistance,
    selectedButton: document.querySelector('[data-map-object="house"]').classList.contains('on'),
    preview: mode.preview.visible,
    toolbar: document.getElementById('map-editor-tools').classList.contains('show'),
    types: g.save.customMap.objects.map((item) => item.type).sort(),
    quests: g.save.customMap.objects.filter((item) => item.type === 'task').map((item) => item.quest),
    spawned: mode.spawned,
    rejected,
    solid,
  };
});
await page.waitForTimeout(700);
check(editor.countryId === 'CUSTOM' && editor.toolbar && editor.selectedOnly && editor.selectedButton && editor.preview
  && editor.lockRequested === 1 && Math.abs(editor.highLookDistance - 18) < 0.01
  && editor.moves.w.z < 55 && editor.moves.s.z > 55 && editor.moves.a.x < 0 && editor.moves.d.x > 0
  && editor.moves.up.y > 14 && editor.moves.down.y < 14 && Math.abs(editor.moves.fast.z - 55) > Math.abs(editor.moves.w.z - 55)
  && editor.types.join(',') === 'house,lake,rock,task,task,task,tree,zombie'
  && editor.quests.join(',') === 'rescue,collect,repair'
  && editor.spawned.task === 3 && Object.entries(editor.spawned).filter(([type]) => !['task', 'airdrop', 'church', 'largehouse'].includes(type)).every(([, count]) => count === 1)
  && editor.solid.house > 3 && editor.solid.tree > 1 && editor.solid.rock > 1.6
  && Object.values(editor.rejected).every((value) => value === false),
  'W/S/A/D рухають правильно, будинки/дерева/каміння тверді, небезпечні точки відхиляються', JSON.stringify(editor));

await page.evaluate(() => {
  const mode = window.__game.level.customMap;
  mode.place('tree', { x: 40, z: 40 });
  mode.undo();
});
await page.waitForFunction(() => window.__game?.level?.customMap?.editor && window.__game.level.customMap.data.objects.length === 8, null, { timeout: 30000 });
const undo = await page.evaluate(() => ({ draft: window.__game.level.customMap.data.objects.length, saved: window.__game.save.customMap.objects.length }));
check(undo.draft === 8 && undo.saved === 8, '«Скасувати останнє» перебудовує чернетку й не псує збережену карту', JSON.stringify(undo));

const exitGuard = await page.evaluate(() => {
  const g = window.__game;
  g.level.customMap.place('tree', { x: 50, z: 40 });
  window.confirm = () => false;
  const stayed = g.level.customMap.exit() === false && g.state === 'level';
  window.confirm = () => true;
  g.level.customMap.exit();
  return stayed;
});
check(exitGuard, 'вихід не втрачає незбережену чернетку без підтвердження');
await page.waitForFunction(() => window.__game?.state === 'globe');
const playVisible = await page.evaluate(() => !document.getElementById('btn-custom-play').hidden);
check(playVisible, 'після збереження в меню зʼявляється кнопка гри');

await page.evaluate(() => window.__game.startLevel('CUSTOM', { customMap: 'play' }));
await page.waitForFunction(() => window.__game?.level?.customMap && !window.__game.level.customMap.editor, null, { timeout: 30000 });
const played = await page.evaluate(() => {
  const g = window.__game;
  const mode = g.level.customMap;
  const [rescue, collect, repair] = mode.tasks;
  g.level.player.pos.set(rescue.action.x, g.level.player.pos.y, rescue.action.z);
  g.input.justPressed.add('KeyE');
  mode.update(0.1, g.input, true);
  g.input.justPressed.clear();
  for (const crate of collect.targets) {
    g.level.player.pos.set(crate.x, g.level.player.pos.y, crate.z);
    g.input.justPressed.add('KeyE');
    mode.update(0.1, g.input, true);
    g.input.justPressed.clear();
  }
  g.level.player.pos.set(repair.action.x, g.level.player.pos.y, repair.action.z);
  g.input.keys.add('KeyE');
  mode.update(6.1, g.input, true);
  g.input.keys.delete('KeyE');
  return {
    zombies: g.level.zombies.list.filter((zombie) => zombie.customPlaced).length,
    realPeopleParts: rescue.people.map((person) => { let count = 0; person.traverse(() => count++); return count; }),
    taskDone: mode.tasks.every((task) => task.done),
    quests: mode.tasks.map((task) => task.quest),
    mapDone: mode.done,
    hud: mode.getHudList(),
    savedObjects: g.save.customMap.objects.length,
  };
});
check(played.zombies === 1 && played.realPeopleParts.every((count) => count > 10)
  && played.taskDone && played.mapDone && played.hud.every((task) => task.done) && played.savedObjects === 8
  && played.quests.join(',') === 'rescue,collect,repair',
  'збережена карта запускається, її зомбі живі, а поставлене завдання виконується', JSON.stringify(played));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.save.customMap = { objects: [
    { type: 'task', quest: 'lights', x: -45, z: -25, ry: 0 },
    { type: 'task', quest: 'elites', x: 0, z: -25, ry: 0 },
    { type: 'task', quest: 'warehouse', x: 45, z: -25, ry: 0 },
  ] };
  g.startLevel('CUSTOM', { customMap: 'play' });
});
await page.waitForFunction(() => window.__game?.level?.customMap?.tasks?.length === 3, null, { timeout: 30000 });
const combatTasks = await page.evaluate(() => {
  const g = window.__game;
  const mode = g.level.customMap;
  const [lights, elites, warehouse] = mode.tasks;
  for (const lamp of lights.targets) {
    g.level.player.pos.set(lamp.x, g.level.player.pos.y, lamp.z);
    g.input.justPressed.add('KeyE');
    mode.update(0.1, g.input, true);
    g.input.justPressed.clear();
  }
  for (const zombie of [...elites.enemies, ...warehouse.enemies]) zombie.state = 'dead';
  mode.update(0.1, g.input, true);
  return {
    quests: mode.tasks.map((task) => task.quest),
    done: mode.tasks.map((task) => task.done),
    lights: lights.targets.filter((lamp) => lamp.done).length,
    elites: elites.enemies.length,
    warehouse: warehouse.enemies.length,
    mapDone: mode.done,
  };
});
check(combatTasks.quests.join(',') === 'lights,elites,warehouse' && combatTasks.done.every(Boolean)
  && combatTasks.lights === 3 && combatTasks.elites === 3 && combatTasks.warehouse === 8 && combatTasks.mapDone,
  'ліхтарі, елітні зомбі та зачистка складу мають окрему робочу логіку', JSON.stringify(combatTasks));

if (errors.length) {
  for (const error of errors) console.log('  ❌', error);
  failed += errors.length;
}
console.log(failed ? `💥 Провалено: ${failed}` : '✅ Створювач карт: покупка → політ → збереження → гра');
await closeTest();
process.exit(failed ? 1 : 0);
