import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });
await page.evaluate(() => { window.__game.save.coins = 15000; window.__game.shop.open(); });
await page.locator('.shop-tab[data-cat="Режими"]').click();
await page.locator('.shop-item[data-id="mapeditorplus"]').click();
const locked = await page.evaluate(() => ({ coins: window.__game.save.coins, plus: window.__game.save.upgrades.mapeditorplus || 0 }));
await page.evaluate(() => { window.__game.save.coins = 25000; window.__game.shop.render(); });
await page.locator('.shop-item[data-id="mapeditor"]').click();
await page.evaluate(() => { window.__game.shop.activeTab = 'Режими'; window.__game.shop.render(); });
await page.locator('.shop-item[data-id="mapeditorplus"]').click();
const bought = await page.evaluate(() => ({ coins: window.__game.save.coins, base: window.__game.save.upgrades.mapeditor || 0, plus: window.__game.save.upgrades.mapeditorplus || 0 }));
check(locked.coins === 15000 && locked.plus === 0 && bought.coins === 0 && bought.base === 1 && bought.plus === 1,
  'Plus коштує 15 000 і відкривається лише після базового редактора', JSON.stringify({ locked, bought }));

await page.evaluate(() => {
  const g = window.__game;
  g.shop.close(); g.save.customMap = { biome: 'summer', objects: [{ type: 'tree', x: -30, z: 0, ry: 0 }] };
  g.endLevel();
});
await page.waitForFunction(() => window.__game?.state === 'globe');
await page.evaluate(() => { document.getElementById('btn-custom-slot').click(); document.getElementById('btn-custom-biome').click(); });
const menu = await page.evaluate(() => ({
  slot: window.__game.save.customMapSlot,
  biome: window.__game.save.customMap2.biome,
  slotText: document.getElementById('btn-custom-slot').textContent,
  biomeText: document.getElementById('btn-custom-biome').textContent,
}));
check(menu.slot === 1 && menu.biome === 'snow' && /2/.test(menu.slotText) && /Снігова/.test(menu.biomeText),
  'Plus перемикає другу карту й сніговий біом', JSON.stringify(menu));

await page.evaluate(() => window.__game.startLevel('CUSTOM', { customMap: 'edit', customMapSlot: 1 }));
await page.waitForFunction(() => window.__game?.level?.customMap?.editor, null, { timeout: 30000 });
const built = await page.evaluate(() => {
  const g = window.__game, mode = g.level.customMap;
  mode.select('zombie'); mode.select('zombie');
  mode.place('zombie', { x: -45, z: 0 });
  const drops = [mode.place('airdrop', { x: -20, z: 0 }), mode.place('airdrop', { x: 0, z: 0 }), mode.place('airdrop', { x: 20, z: 28 })];
  const churches = [mode.place('church', { x: 35, z: 0 }), mode.place('church', { x: -45, z: -30 })];
  const largehouses = [-100, -70, -40, -10, 20, 50].map((x) => mode.place('largehouse', { x, z: -105 }));
  mode.select('task');
  for (let i = 0; i < 6; i++) mode.select('task');
  const task = mode.place('task', { x: 0, z: -35 });
  mode.save();
  return {
    max: mode.maxObjects, plusButtons: ['airdrop', 'church'].every((type) => !document.querySelector(`[data-map-object="${type}"]`).hidden),
    drops, churches, largehouses, task, objects: g.save.customMap2.objects,
  };
});
check(built.max === 140 && built.plusButtons && built.drops.join(',') === 'true,true,false'
  && built.churches.join(',') === 'true,false' && built.task
  && built.largehouses.join(',') === 'true,true,true,true,true,false'
  && built.objects.find((item) => item.type === 'zombie')?.zombieType === 'runner'
  && built.objects.find((item) => item.type === 'task')?.quest === 'rebuild',
  'Plus дає 140 місць, різних зомбі, максимум 2 аірдропи, 1 церкву та завдання відбудови', JSON.stringify(built));

await page.evaluate(() => { window.__game.level.customMap.exit(); });
await page.waitForFunction(() => window.__game?.state === 'globe');
await page.evaluate(() => window.__game.startLevel('CUSTOM', { customMap: 'play', customMapSlot: 1 }));
await page.waitForFunction(() => window.__game?.level?.customMap?.tasks?.length === 1, null, { timeout: 30000 });
const finale = await page.evaluate(() => {
  const g = window.__game, mode = g.level.customMap, task = mode.tasks[0];
  for (const tool of task.tools) {
    g.level.player.pos.set(tool.x, g.level.player.pos.y, tool.z);
    g.input.justPressed.add('KeyE'); mode.update(0.1, g.input, true); g.input.justPressed.clear();
  }
  g.level.player.pos.set(task.action.x, g.level.player.pos.y, task.action.z);
  g.input.keys.add('KeyE'); mode.update(12.1, g.input, true); g.input.keys.delete('KeyE');
  const before = Math.hypot(mode.boss.x - g.level.player.pos.x, mode.boss.z - g.level.player.pos.z);
  for (let i = 0; i < 20; i++) g.level.zombies.update(0.1);
  const after = Math.hypot(mode.boss.x - g.level.player.pos.x, mode.boss.z - g.level.player.pos.z);
  const boss = { started: mode.bossStarted, hp: mode.boss?.hp, maxHp: mode.boss?.maxHp, aggroed: mode.boss?.aggroed, noLeash: mode.boss?.noLeash, before, after, mapDoneBeforeKill: mode.done };
  mode.boss.state = 'dead'; mode.update(0.1, g.input, true);
  return { taskDone: task.done, tools: task.tools.map((tool) => tool.done), boss, mapDone: mode.done };
});
check(finale.taskDone && finale.tools.every(Boolean) && finale.boss.started && finale.boss.hp === 5500
  && finale.boss.maxHp === 5500 && finale.boss.aggroed && finale.boss.noLeash && finale.boss.after < finale.boss.before
  && !finale.boss.mapDoneBeforeKill && finale.mapDone,
  'інструменти й відбудова запускають фінального боса рівно з 5500 HP', JSON.stringify(finale));

await page.evaluate(() => { window.__game.endLevel(); window.confirm = () => true; });
await page.waitForFunction(() => window.__game?.state === 'globe');
await page.evaluate(() => document.getElementById('btn-custom-delete').click());
const removed = await page.evaluate(() => ({ first: window.__game.save.customMap.objects.length, second: window.__game.save.customMap2.objects.length, playHidden: document.getElementById('btn-custom-play').hidden }));
check(removed.first === 1 && removed.second === 0 && removed.playHidden,
  'видалення очищає тільки вибрану карту й не чіпає іншу', JSON.stringify(removed));

for (const error of errors) { console.log('  ❌', error); failed++; }
console.log(failed ? `💥 Провалено: ${failed}` : '✅ Створювач карт+: покупка → друга карта → біом → обʼєкти → бос → видалення');
await closeTest();
process.exit(failed ? 1 : 0);
