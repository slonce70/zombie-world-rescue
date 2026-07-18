import { openBrowserTest, makeCheck } from './_browser.mjs';
import { mkdirSync } from 'node:fs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);
mkdirSync('test-results', { recursive: true });

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__game;
  const point = g.level.missions.delegate.get('rebuild').woodNodes[0];
  g.test.teleport(point.x, point.z + 8);
  g.level.player.yaw = 0;
});
await page.waitForTimeout(350);
await page.screenshot({ path: 'test-results/ukraine-resources-before-tools.png' });

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
  const resourcesVisibleBeforeTools = rebuild.points.every((point) => point.mesh.visible);
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
  for (let i = 0; i < 3; i++) delegate._up_rebuild(rebuild, 10, hold, true);
  story._syncObjectiveStates();

  const rebuildAttackers = g.level.zombies.list.filter((zombie) => zombie.rebuildAttack);
  const settlementSnapshot = { ...g.save.settlement };
  g.save.settlement.level = 3;
  const upgradedCenter = delegate._makeCityCenter(rebuild);

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
      resourcesVisibleBeforeTools,
      waves: rebuild.buildWaves,
      attackers: rebuildAttackers.length,
      leftAttackers: rebuildAttackers.filter((zombie) => zombie.x < rebuild.dest.x).length,
      rightAttackers: rebuildAttackers.filter((zombie) => zombie.x > rebuild.dest.x).length,
      settlement: settlementSnapshot,
      settlementTier: rebuild.rebuilt.userData.settlementTier,
      upgradedTier: upgradedCenter.userData.settlementTier,
      upgradedParts: upgradedCenter.children.length,
    },
    bossUnlocked: story.bossUnlocked,
  };
});
await page.waitForTimeout(350);
await page.screenshot({ path: 'test-results/ukraine-rebuild-attack.png' });

check(ukraine.ids.join(',') === 'ukr-rescue,ukr-signal,ukr-defense,ukr-rebuild',
  'Україна має правильний ланцюжок без французьких баз і Місяця', JSON.stringify(ukraine.ids));
check(ukraine.defense.type === 'defense' && ukraine.defense.timer <= 0
  && ukraine.defense.x === ukraine.defense.villageX && ukraine.defense.z === ukraine.defense.villageZ,
  'оборона реально триває 22 секунди на сільській площі', JSON.stringify(ukraine.defense));
check(ukraine.rebuild.wood === 120 && ukraine.rebuild.stone === 50 && ukraine.rebuild.progress === 1
  && ukraine.rebuild.tools.join(',') === 'axe,pickaxe' && ukraine.rebuild.toolModels.every((n) => n > 2)
  && ukraine.rebuild.wrongToolMisses && ukraine.rebuild.resourcesVisibleBeforeTools
  && ukraine.rebuild.mainBuildingWidth === 16 && ukraine.rebuild.buildingParts > 15
  && ukraine.rebuild.waves === 3 && ukraine.rebuild.attackers === 24
  && ukraine.rebuild.leftAttackers === 12 && ukraine.rebuild.rightAttackers === 12
  && ukraine.rebuild.settlement.level === 1 && ukraine.rebuild.settlement.wood === 120
  && ukraine.rebuild.settlement.stone === 50 && ukraine.rebuild.settlement.survivors === 3
  && ukraine.rebuild.settlementTier === 1 && ukraine.rebuild.upgradedTier === 3
  && ukraine.rebuild.upgradedParts > ukraine.rebuild.buildingParts,
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
await page.waitForFunction(() => window.__game?.state === 'globe' && window.__game?.globe?.mode === 'moon', null, { timeout: 10000 });
const moonGlobe = await page.evaluate(async () => {
  const { MOON_REGION_LIST } = await import('/src/moonregions.js');
  return {
    mode: window.__game.globe.mode,
    regions: window.__game.globe.features.map((feature) => feature.properties.name),
    missions: MOON_REGION_LIST.map((region) => region.missions.join(',')),
    atmosphere: window.__game.globe.atmo.visible,
    earthUiHidden: getComputedStyle(document.querySelector('.globe-play-row')).display === 'none',
  };
});
check(moonGlobe.mode === 'moon' && moonGlobe.regions.length === 4 && !moonGlobe.atmosphere
  && moonGlobe.earthUiHidden && new Set(moonGlobe.missions).size === 4
  && moonGlobe.regions.every((name) => !['Україна', 'Франція', 'Німеччина'].includes(name)),
  'Місяць відкривається як сірий глобус із чотирма власними країнами', JSON.stringify(moonGlobe));
await page.waitForTimeout(800);
await page.screenshot({ path: 'test-results/moon-globe.png' });
await page.evaluate(() => window.__game.startLevel('MOON', { moonRegion: 'MARE' }));
await page.waitForFunction(() => window.__game?.state === 'level' && window.__game?.level?.countryId === 'MOON', null, { timeout: 30000 });
await page.evaluate(() => {
  const station = window.__game.level.world.moonStation;
  window.__game.test.teleport(station.x, station.z + 24);
  window.__game.level.player.yaw = 0;
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'test-results/moon-full-region.png' });
const moon = await page.evaluate(() => {
  const g = window.__game;
  const story = g.level.missions;
  const delegate = story.delegate;
  const player = g.level.player;
  const press = () => ({ pressed: (key) => key === 'KeyE', down: () => false, justPressed: new Set(['KeyE']) });
  const hold = { pressed: () => false, down: (key) => key === 'KeyE', justPressed: new Set() };
  const idle = { pressed: () => false, down: () => false, justPressed: new Set() };
  g.hud._drawMinimap();
  const mapC = g.hud.el.minimap.width / 2;
  const minimapColor = [...g.hud.ctx.getImageData(mapC - 50, mapC - 50, 1, 1).data];
  const initial = {
    state: g.state,
    countryId: g.level.countryId,
    bound: g.level.country.map.bound,
    houses: g.level.country.map.houses.length,
    barren: g.level.country.map.barren,
    clouds: g.level.world.clouds.length,
    player: !!g.level.player,
    zombies: g.level.zombies.list.length,
    moonRegion: g.level.moonRegion?.id,
    moonBrutes: g.level.zombies.list.filter((zombie) => zombie.type === 'moonbrute').map((zombie) => ({ hp: zombie.maxHp, damage: zombie.stats.dmg, speed: zombie.stats.chaseSpeed })),
    meteors: ['small', 'medium', 'large'].map((type, i) => {
      const meteor = g.level.moonHazards.spawn(type, 150 + i * 20, 150);
      return { type, size: meteor.size, damage: meteor.damage };
    }),
    suitVisible: g.level.effects.coins.some((item) => item.type === 'spacesuit'),
    ids: story.objectives.map((o) => o.id),
    missionTypes: story.delegate.missions.map((m) => m.type),
    missionTitles: story.delegate.missions.map((m) => m.title),
    boss: g.level.country.boss,
    moonMissionModels: {
      rescue: g.level.world.barnGroup?.userData.kind,
      relay: g.level.world.towerGroup?.userData.kind,
      relayHeight: g.level.world.oxygenRelayHeight,
      station: g.level.world.moonStation?.group.userData.kind,
      stationParts: g.level.world.moonStation?.repairs.length,
      habitats: (g.level.world.moonHabitats || []).map((habitat) => ({
        kind: habitat.userData.kind,
        color: habitat.userData.shellColor,
      })),
    },
    moonSystems: {
      gravity: player.gravity,
      jumpPower: player.jumpPower,
      oxygen: player.oxygen,
      rovers: g.level.vehicles.list.filter((vehicle) => vehicle.rover).length,
      roverParts: g.level.vehicles.list.filter((vehicle) => vehicle.rover).map((vehicle) => vehicle.sc.group.children.length),
    },
    minimapColor,
  };
  player.health = 100;
  player.armor = 0;
  player.respawnProtect = 0;
  const impact = g.level.moonHazards.spawn('small', player.pos.x, player.pos.z);
  impact.t = 0;
  impact.mesh.position.y = impact.y;
  g.level.moonHazards.update(0.01);
  initial.meteorImpactHealth = player.health;
  g.level.effects.onPickup('spacesuit', 1);
  player.oxygen = 40;
  player._updateMoonLifeSupport(20);
  initial.suitEquipped = player.spacesuit;
  initial.oxygenAfterSuit = player.oxygen;

  const rescue = delegate.get('rescue');
  const door = g.level.world.barnDoorCollider;
  player.pos.set(door.x, player.pos.y, door.z - 1);
  delegate._up_rescue(rescue, 0.1, idle, true);
  const rescuePrompt = delegate.prompt?.text || '';
  delegate._up_rescue(rescue, 0.1, press(), true);
  const rescuedCrew = delegate.civilians.map((civilian) => ({
    kind: civilian.kind,
    astronaut: civilian.rig.astronaut,
    role: civilian.rig.astronautRole,
  }));
  delegate._up_rescue(rescue, 2.1, idle, true);
  story._syncObjectiveStates();

  const repair = delegate.get('repair');
  player.pos.set(repair.repairPoint.x, player.pos.y, repair.repairPoint.z);
  delegate._up_repair(repair, 12.1, hold, true);
  story._syncObjectiveStates();

  const defense = delegate.get('defense');
  player.pos.set(defense.zone.x, player.pos.y, defense.zone.z);
  delegate._up_defense(defense, 0.1);
  delegate._up_defense(defense, 45.1);
  story._syncObjectiveStates();

  const station = delegate.get('stationrepair');
  for (const fragment of station.fragments) {
    player.pos.set(fragment.x, player.pos.y, fragment.z);
    delegate._up_stationrepair(station, 0.1, press(), true);
  }
  player.pos.set(station.site.x, player.pos.y, station.site.z);
  delegate._up_stationrepair(station, 30.1, hold, true);
  const launchY = g.level.world.moonStation.group.position.y;
  g.level.world.update(2, player.pos);
  story._syncObjectiveStates();

  delegate.pendingWaves = [];
  delegate.pendingHorde = null;
  g.level.zombies.hordeActive = false;
  g.level.zombies.hordePending = 0;
  g.level.zombies.hordeRemaining = 0;
  story.update(0.1, idle, true);
  player.pos.set(delegate.L.arena.x, player.pos.y, delegate.L.arena.z);
  story.update(0.1, idle, true);
  const boss = g.level.zombies.boss;
  const bossHp = boss?.maxHp || 0;
  if (boss) boss.damage(99999, null, false);

  return {
    initial,
    states: story.objectives.map((o) => o.state),
    bossUnlocked: story.bossUnlocked,
    flow: {
      rescued: rescue.state === 'done', repaired: repair.state === 'done',
      defended: defense.state === 'done', fragmentsFound: station.found,
      stationRepaired: station.repairProgress,
      stationLaunched: g.level.world.moonStation.launching,
      stationFlight: g.level.world.moonStation.group.position.y - launchY,
      stationWaves: station.waves,
      stationAttackers: g.level.zombies.list.filter((zombie) => zombie.stationAttack).length,
      stationAttackSides: new Set(g.level.zombies.list.filter((zombie) => zombie.stationAttack).map((zombie) => zombie.stationSide)).size,
      bossHp, bossDefeated: g.level.bossDefeated, rescuePrompt, rescuedCrew,
    },
  };
});

check(moon.initial.state === 'level' && moon.initial.countryId === 'MOON' && moon.initial.player && moon.initial.zombies > 0,
  'Порятунок Місяця запускається як повноцінна 3D-країна з гравцем і зомбі', JSON.stringify(moon.initial));
check(moon.initial.moonRegion === 'MARE'
  && moon.initial.moonBrutes.length === 3
  && moon.initial.moonBrutes.every((zombie) => zombie.hp === 1000 && zombie.damage === 3 && zombie.speed <= 1.2),
  'на Місяці є три повільні нові зомбі з 1000 HP і шкодою 3', JSON.stringify(moon.initial.moonBrutes));
check(JSON.stringify(moon.initial.meteors) === JSON.stringify([
  { type: 'small', size: 5, damage: 35 }, { type: 'medium', size: 10, damage: 55 }, { type: 'large', size: 19, damage: 75 },
]), 'метеорити мають точні розміри 5/10/19 м і шкоду 35/55/75', JSON.stringify(moon.initial.meteors));
check(moon.initial.meteorImpactHealth === 65,
  'малий метеорит при падінні реально наносить 35 шкоди', String(moon.initial.meteorImpactHealth));
check(moon.initial.suitVisible && moon.initial.suitEquipped && moon.initial.oxygenAfterSuit === 100,
  'скафандр лежить на карті, підбирається і назавжди стабілізує кисень у забігу', JSON.stringify(moon.initial));
check(moon.initial.bound >= 240 && moon.initial.houses >= 6 && moon.initial.barren && moon.initial.clouds === 0,
  'Місяць має велику безповітряну карту зі станцією, а не малу круглу арену', JSON.stringify(moon.initial));
check(moon.initial.moonSystems.gravity < 10 && moon.initial.moonSystems.jumpPower > 9
  && moon.initial.moonSystems.oxygen > 99 && moon.initial.moonSystems.rovers === 2
  && moon.initial.moonSystems.roverParts.every((parts) => parts >= 8),
  'Місяць має низьку гравітацію, кисень і два видимі місяцеходи', JSON.stringify(moon.initial.moonSystems));
check(Math.max(...moon.initial.minimapColor.slice(0, 3)) - Math.min(...moon.initial.minimapColor.slice(0, 3)) < 24,
  'мінікарта Місяця теж сіра, а не зелена земна', JSON.stringify(moon.initial.minimapColor));
check(moon.initial.ids.join(',') === 'moon-crew,moon-relays,moon-defense,moon-station'
  && ['rescue', 'repair', 'defense', 'stationrepair'].every((type) => moon.initial.missionTypes.includes(type)),
  'на Місяці є чотири важкі повноцінні завдання', JSON.stringify(moon.initial));
check(moon.initial.moonMissionModels.rescue === 'moon-rescue-module'
  && moon.initial.moonMissionModels.relay === 'moon-oxygen-relay'
  && moon.initial.moonMissionModels.relayHeight < 6
  && moon.initial.moonMissionModels.station === 'moon-space-station'
  && moon.initial.moonMissionModels.stationParts === 5
  && moon.initial.moonMissionModels.habitats.length >= 6
  && moon.initial.moonMissionModels.habitats.every((habitat) => {
    const r = habitat.color >> 16, g = (habitat.color >> 8) & 255, b = habitat.color & 255;
    return habitat.kind === 'moon-habitat' && Math.max(r, g, b) - Math.min(r, g, b) > 30;
  }),
  'модуль, реле, кольорові космічні будинки й справжня станція мають окремі 3D-моделі', JSON.stringify(moon.initial.moonMissionModels));
check(moon.initial.missionTitles.some((title) => /космонавт|модул/i.test(title))
  && moon.initial.missionTitles.every((title) => !/хлів/i.test(title))
  && /аварійний модуль/i.test(moon.flow.rescuePrompt)
  && moon.flow.rescuedCrew.length === 3
  && moon.flow.rescuedCrew.every((crew) => crew.astronaut && crew.kind.startsWith('astronaut-')),
  'місія говорить про модуль і рятує трьох космонавтів у скафандрах, а не людей із хліва', JSON.stringify({ titles: moon.initial.missionTitles, prompt: moon.flow.rescuePrompt, crew: moon.flow.rescuedCrew }));
check(moon.states.every((state) => state === 'done') && moon.bossUnlocked
  && moon.flow.rescued && moon.flow.repaired && moon.flow.defended
  && moon.flow.fragmentsFound === 5 && moon.flow.stationRepaired === 1
  && moon.flow.stationLaunched && moon.flow.stationFlight > 20
  && moon.flow.stationWaves >= 1 && moon.flow.stationAttackers === 12 && moon.flow.stationAttackSides === 4
  && moon.initial.boss.style === 'mechTitan' && moon.flow.bossHp === 10000 && moon.flow.bossDefeated,
  '5 уламків → 30 секунд оборони з чотирьох сторін → зліт станції → Місячний Титан', JSON.stringify(moon));

if (errors.length) {
  for (const error of errors) console.log('  ❌', error);
  failed += errors.length;
}
console.log(failed ? `💥 Провалено: ${failed}` : '✅ Україна, Франція і повноцінна 3D-країна Місяць працюють');
await closeTest();
process.exit(failed ? 1 : 0);
