import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });

const ukraine = await page.evaluate(() => {
  const g = window.__game;
  const story = g.level.missions;
  const delegate = story.delegate;
  const player = g.level.player;
  const press = () => ({ pressed: (k) => k === 'KeyE', down: () => false, justPressed: new Set(['KeyE']) });
  const hold = { pressed: () => false, down: (k) => k === 'KeyE', justPressed: new Set() };

  story._completeObjective('ukr-rescue');
  story._completeObjective('ukr-signal');
  const defense = delegate.get('defense');
  player.pos.set(defense.zone.x, player.pos.y, defense.zone.z);
  delegate._up_defense(defense, 0.1);
  delegate._up_defense(defense, 22.1);
  story._syncObjectiveStates();

  const rebuild = delegate.get('rebuild');
  for (const tool of rebuild.tools) {
    player.pos.set(tool.x, tool.y, tool.z);
    delegate._up_rebuild(rebuild, 0.1, press(), true);
  }
  const toolModels = rebuild.tools.map((tool) => tool.mesh.children.length);
  const wrongToolMisses = !delegate.resourceHitTest(
    player.pos.clone().set(rebuild.woodNodes[0].x, rebuild.woodNodes[0].y + 2.1, rebuild.woodNodes[0].z + 3),
    player.pos.clone().set(0, 0, -1), 3.6, 'pickaxe');
  for (const point of rebuild.points) {
    const tool = point.kind === 'wood' ? 'axe' : 'pickaxe';
    const y = point.y + (point.kind === 'wood' ? 2.1 : 0.75);
    const origin = player.pos.clone().set(point.x, y, point.z + 3);
    const dir = player.pos.clone().set(0, 0, -1);
    for (let hit = 0; hit < 4; hit++) {
      const target = delegate.resourceHitTest(origin, dir, 3.6, tool);
      delegate.damageResource(target.node, target.point, tool);
    }
  }
  player.pos.set(rebuild.dest.x, rebuild.dest.y, rebuild.dest.z);
  delegate._up_rebuild(rebuild, 30, hold, true);
  story._syncObjectiveStates();

  return {
    ids: story.objectives.map((o) => o.id),
    states: story.objectives.map((o) => o.state),
    defense: {
      type: defense.type,
      timer: defense.timer,
      x: defense.zone?.x ?? defense.site.x,
      z: defense.zone?.z ?? defense.site.z,
      villageX: delegate.L.village.x,
      villageZ: delegate.L.village.z,
    },
    rebuild: {
      wood: rebuild.wood, stone: rebuild.stone, progress: rebuild.buildProgress,
      buildingParts: rebuild.rebuilt.children.length,
      mainBuildingWidth: rebuild.rebuilt.children[0].geometry.parameters.width,
      tools: player.weapons.filter((w) => w === 'axe' || w === 'pickaxe'), toolModels, wrongToolMisses,
    },
    bossUnlocked: story.bossUnlocked,
  };
});

check(ukraine.ids.join(',') === 'ukr-rescue,ukr-signal,ukr-defense,ukr-rebuild',
  'Україна має правильний ланцюжок без французьких баз і Місяця', JSON.stringify(ukraine.ids));
check(ukraine.defense.type === 'defense' && ukraine.defense.timer <= 0
  && ukraine.defense.x === ukraine.defense.villageX && ukraine.defense.z === ukraine.defense.villageZ,
  'оборона реально триває 22 секунди на сільській площі', JSON.stringify(ukraine.defense));
check(ukraine.rebuild.wood === 120 && ukraine.rebuild.stone === 50 && ukraine.rebuild.progress === 1
  && ukraine.rebuild.tools.join(',') === 'axe,pickaxe' && ukraine.rebuild.toolModels.every((n) => n > 2)
  && ukraine.rebuild.wrongToolMisses && ukraine.rebuild.mainBuildingWidth === 16 && ukraine.rebuild.buildingParts > 15,
  'реальні вибірні інструменти → правильне рубання/видобування → великий міський штаб', JSON.stringify(ukraine.rebuild));
check(ukraine.states.every((state) => state === 'done') && ukraine.bossUnlocked,
  'після українських завдань відкривається бос', JSON.stringify(ukraine));

await page.goto(`${BASE}/?test&fresh&country=FRA`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });
const france = await page.evaluate(() => {
  const g = window.__game;
  const story = g.level.missions;
  const delegate = story.delegate;
  const player = g.level.player;
  const hold = { pressed: () => false, down: (k) => k === 'KeyE', justPressed: new Set() };
  for (const id of ['fra-kitchen', 'fra-balloon', 'fra-cellar']) story._completeObjective(id);
  const bases = delegate.get('bases');
  for (const base of bases.nestList) {
    player.pos.set(base.x, base.y, base.z);
    delegate._up_bases(bases, 4, hold, true);
  }
  story._syncObjectiveStates();
  return {
    ids: story.objectives.map((o) => o.id),
    states: story.objectives.map((o) => o.state),
    bases: bases.cleared,
    bossUnlocked: story.bossUnlocked,
  };
});
check(france.ids.join(',') === 'fra-kitchen,fra-balloon,fra-cellar,fra-bases' && france.bases === 3,
  'зачистка трьох зомбі-баз належить Франції', JSON.stringify(france));
check(france.states.every((state) => state === 'done') && france.bossUnlocked,
  'французькі бази відкривають боса', JSON.stringify(france));

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
await page.click('#btn-menu');
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 10000 });
check(!!await page.$('#btn-moonbase'), 'у Штабі є окремий вхід до Порятунку Місяця');
await page.click('#btn-moonbase');
await page.waitForFunction(() => window.__game?.state === 'hqbase' && window.__game?.hqbase?.mode === 'moon', null, { timeout: 10000 });
const moon = await page.evaluate(() => {
  const g = window.__game;
  const before = { xp: g.save.xp, crystals: g.save.crystals };
  const initial = g.hqbase.debugState();
  g.input.keys.add('KeyW');
  for (let i = 0; i < 60; i++) g.hqbase.update(1 / 60);
  g.input.keys.delete('KeyW');
  const walked = g.hqbase.debugState();
  g.hqbase.moonHealth = 10000;
  for (const relay of g.hqbase.targets.filter((target) => target.userData.moonRelay)) {
    g.hqbase.hero.position.set(relay.position.x, 0, relay.position.z);
    g.input.keys.add('KeyE');
    for (let i = 0; i < 41; i++) g.hqbase.update(0.1);
    g.input.keys.delete('KeyE');
  }
  const repaired = g.hqbase.debugState();
  g.hqbase.hero.position.set(0, 0, -2);
  for (let i = 0; i < 310; i++) g.hqbase.update(0.1);
  const defended = g.hqbase.debugState();
  const boss = g.hqbase.moonEnemies.find((enemy) => enemy.boss);
  g.hqbase._pointer.set(0, 0);
  g.hqbase._raycaster.setFromCamera(g.hqbase._pointer, g.hqbase.camera);
  const fired = g.hqbase._shootMoon(true);
  while (boss && boss.hp > 0) g.hqbase._hitMoonEnemy(boss);
  const completed = g.hqbase.debugState();
  const reward = { xp: g.save.xp - before.xp, crystals: g.save.crystals - before.crystals };
  g.exitHQBase();
  g.enterHQBase('moon');
  const repeated = { xp: g.save.xp - before.xp, crystals: g.save.crystals - before.crystals };
  return { initial, walked, repaired, defended, fired, completed, reward, repeated, status: document.getElementById('moonbase-status')?.textContent || '' };
});

check(moon.initial.mode === 'moon' && moon.initial.moonCrew === 3 && moon.initial.moonHero && moon.initial.moonEnemies >= 3,
  'Порятунок Місяця — керована жива 3D-база з екіпажем і ворогами', JSON.stringify(moon.initial));
check(moon.walked.moonHero.z < moon.initial.moonHero.z - 4,
  'герой ходить Місяцем за керуванням WASD', JSON.stringify({ initial: moon.initial.moonHero, walked: moon.walked.moonHero }));
check(moon.repaired.moonRelays === 3 && moon.defended.moonDefenseDone && moon.defended.moonBossHp === 1200 && moon.fired,
  'три реле та 30-секундна оборона відкривають Місячного титана', JSON.stringify(moon));
check(moon.completed.moonDone && moon.completed.moonBossHp === 0 && moon.reward.xp === 500 && moon.reward.crystals === 3,
  'перемога над титаном завершує місію й видає одноразову нагороду', JSON.stringify(moon));
check(moon.repeated.xp === 500 && moon.repeated.crystals === 3 && /врятована|saved|спасена/i.test(moon.status),
  'місячна база зберігається, нагорода не дублюється', JSON.stringify(moon));

if (errors.length) {
  for (const error of errors) console.log('  ❌', error);
  failed += errors.length;
}
console.log(failed ? `💥 Провалено: ${failed}` : '✅ Україна, Франція і жива місячна база працюють');
await closeTest();
process.exit(failed ? 1 : 0);
