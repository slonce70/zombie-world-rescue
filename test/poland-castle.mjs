import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base, close } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await mkdir('test-results', { recursive: true });

const assert = (value, message, details = '') => {
  if (!value) throw new Error(`${message}${details ? `: ${details}` : ''}`);
  console.log(`  ✅ ${message}`);
};

const worldSource = await readFile(new URL('../src/world.js', import.meta.url), 'utf8');
assert(
  worldSource.includes('const N = 48;')
    && worldSource.includes('block.rotation.y = -ang - Math.PI / 2;')
    && worldSource.includes('dungeonGap < 0.1')
    && worldSource.includes('const h = 8.5;')
    && worldSource.includes('lintel.position.set(0, 7.4, 0);')
    && worldSource.includes('mouth.position.set(0, 2.7, 0.8);')
    && !worldSource.includes('const broken = i === 1'),
  'мури суцільні, брама без верхньої діри, ґрати видно, а вежі цілі',
);

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  await page.evaluate(() => window.__game.startLevel('POL'));
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.countryId === 'POL', null, { timeout: 30000 });

  let state = await page.evaluate(() => {
    const g = window.__game;
    const story = g.level.missions;
    const bonfire = story.delegate.get('bonfire');
    const bonfireMarkers = story.getMarkers().filter((marker) => marker.icon === '🔥');
    const castle = story.delegate.get('castle');
    const map = g.level.country.map;
    const castleSite = map.storySites.castleRuin;
    const arenaSite = map.storySites.arena;
    const warehouse = map.sites.warehouse;
    const gate = g.level.world.castleGate;
    g.test.completeStoryObjective('pol-castle');
    return {
      bonfireMarkersMatch: bonfire.points.every((point) => bonfireMarkers.some((marker) => Math.hypot(point.x - marker.x, point.z - marker.z) < 0.1)),
      bonfireMarkerCount: bonfireMarkers.length,
      radius: castle.site.r,
      siteDistance: Math.hypot(castleSite.x - arenaSite.x, castleSite.z - arenaSite.z),
      requiredDistance: castleSite.r + arenaSite.r + 10,
      phase: castle.phase,
      castleState: castle.state,
      storyState: story.get('pol-castle').state,
      gateVisible: g.level.world.castleGate.group.visible,
      gateCollider: g.level.world.colliders.includes(g.level.world.castleGate.collider),
      dungeonCollider: g.level.world.colliders.includes(g.level.world.castleDungeon.collider),
      crateGateDistance: Math.hypot(castle.explosive.x - gate.x, castle.explosive.z - gate.z),
      crateWarehouseDistance: Math.hypot(castle.explosive.x - warehouse.x, castle.explosive.z - warehouse.z),
      plantGateDistance: Math.hypot(castle.plantPoint.x - gate.x, castle.plantPoint.z - gate.z),
      gateColliderRadius: gate.collider.r,
      crateBeamDistance: Math.hypot(castle.explosive.x - castle.beam.group.position.x, castle.explosive.z - castle.beam.group.position.z),
    };
  });
  assert(state.bonfireMarkerCount === 3 && state.bonfireMarkersMatch, 'мінімапа показує три справжні вогнища, а не старі точки біля площі', JSON.stringify(state));
  await page.screenshot({ path: 'test-results/poland-bonfire-markers.png' });
  assert(state.radius >= 34, 'замок справді великий', JSON.stringify(state));
  assert(state.siteDistance > state.requiredDistance, 'замок є окремою будівлею далеко від арени', JSON.stringify(state));
  assert(state.phase === 'find' && state.castleState === 'locked' && state.storyState === 'locked', 'замкнена сюжетна ціль не виконується завчасно', JSON.stringify(state));
  assert(state.gateVisible && state.gateCollider && state.dungeonCollider, 'ворота й підземелля активні лише для castle mission');
  assert(state.crateGateDistance > 100 && state.crateWarehouseDistance < 12, 'ящик захований біля складу, а не біля замку', JSON.stringify(state));
  assert(state.crateBeamDistance < 0.1, '3D-маяк показує на далекий ящик', JSON.stringify(state));
  assert(state.plantGateDistance > state.gateColliderRadius + 1, 'точка встановлення доступна перед колайдером воріт', JSON.stringify(state));
  await page.evaluate(() => {
    const g = window.__game;
    const arena = g.level.country.map.storySites.arena;
    g.test.teleport(arena.x, arena.z + 60);
    g.level.player.yaw = 0;
  });
  await page.waitForTimeout(6500);
  await page.screenshot({ path: 'test-results/poland-separate-arena.png' });

  await page.evaluate(() => {
    const g = window.__game;
    g.test.completeStoryObjective('pol-bonfires');
    const train = g.level.missions.delegate.get('repair');
    g.__trainMissionPlacement = {
      point: train.repairPoint,
      site: train.site,
      beam: { x: train.beam.group.position.x, z: train.beam.group.position.z },
    };
    g.test.teleport(train.repairPoint.x, train.repairPoint.z - 7);
    g.level.player.yaw = Math.PI;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/poland-train-control.png' });
  await page.evaluate(() => {
    const g = window.__game;
    const train = g.level.missions.delegate.get('repair');
    g.test.teleport(train.repairPoint.x, train.repairPoint.z);
    train.progress = 0.99;
    g.test.key('KeyE', true);
    g.level.missions.update(0.2, g.input, true);
    g.test.key('KeyE', false);
    g.__trainWaveSites = g.level.missions.delegate.pendingWaves.map((wave) => wave.site);
    g.test.finishHorde();
    const castle = g.level.missions.delegate.get('castle');
    g.test.teleport(castle.explosive.x, castle.explosive.z);
    g.test.key('KeyE', true);
    g.level.missions.update(0.016, g.input, true);
    g.test.key('KeyE', false);
  });
  state = await page.evaluate(() => {
    const g = window.__game;
    const story = g.level.missions;
    const castle = story.delegate.get('castle');
    const train = story.delegate.get('repair');
    return {
      phase: castle.phase,
      title: story.currentStoryObjective(),
      marker: story.getMarkers()[0],
      trainDone: story.get('pol-train').state,
      trainStarted: g.level.world.rescueTrainStarted,
      trainPoint: train.repairPoint,
      towerPoint: g.level.world.repairPoint,
      placement: g.__trainMissionPlacement,
      waveSites: g.__trainWaveSites,
      plantPoint: castle.plantPoint,
      castleBeam: { x: castle.beam.group.position.x, z: castle.beam.group.position.z },
    };
  });
  assert(state.trainDone === 'done' && state.trainStarted, 'пульт у депо справді запускає сюжетний поїзд', JSON.stringify(state));
  assert(Math.hypot(state.trainPoint.x - state.towerPoint.x, state.trainPoint.z - state.towerPoint.z) > 100, 'пульт поїзда не використовує радіовежу', JSON.stringify(state));
  assert(Math.hypot(state.placement.point.x - state.placement.site.x, state.placement.point.z - state.placement.site.z) < 15, 'хвилі захисту поїзда привʼязані до депо', JSON.stringify(state.placement));
  assert(Math.hypot(state.placement.point.x - state.placement.beam.x, state.placement.point.z - state.placement.beam.z) < 0.1, '3D-маяк поїзда стоїть біля пульта', JSON.stringify(state.placement));
  assert(state.waveSites.length === 2 && state.waveSites.every((site) => Math.hypot(state.trainPoint.x - site.x, state.trainPoint.z - site.z) < 15), 'обидві хвилі нападають біля поїзда', JSON.stringify(state.waveSites));
  assert(state.phase === 'carry' && /воріт/i.test(state.title), 'ящик підбирається і HUD переходить до воріт', JSON.stringify(state));
  assert(Math.hypot(state.plantPoint.x - state.castleBeam.x, state.plantPoint.z - state.castleBeam.z) < 0.1, '3D-маяк після підбору переходить до точки встановлення', JSON.stringify(state));
  state = await page.evaluate(() => {
    const g = window.__game;
    const delegate = g.level.missions.delegate;
    const snapshot = delegate.netState();
    g.level.world.rescueTrainStarted = false;
    delegate.applyNet(snapshot);
    return { trainStarted: g.level.world.rescueTrainStarted };
  });
  assert(state.trainStarted, 'co-op снапшот відновлює зелений стан пульта поїзда');

  await page.evaluate(() => {
    const g = window.__game;
    const gate = g.level.world.castleGate;
    g.test.teleport(gate.x, gate.z + 60);
    g.level.missions.update(0.016, g.input, true);
    g.level.player.yaw = 0;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/poland-castle-gate.png' });

  await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    g.test.teleport(castle.plantPoint.x, castle.plantPoint.z);
    g.level.missions.update(0.016, g.input, true);
    if (castle.phase !== 'plant') throw new Error(`біля воріт має зʼявитися встановлення, маємо ${castle.phase}`);
    castle.plantProgress = 0.99;
    g.test.key('KeyE', true);
    g.level.missions.update(0.1, g.input, true);
    g.test.key('KeyE', false);
  });
  state = await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    const knights = castle.guards.filter((z) => z.castleKnight);
    const regular = castle.guards.filter((z) => !z.castleKnight);
    return {
      phase: castle.phase,
      total: castle.guards.length,
      regular: regular.length,
      knights: knights.length,
      knightStats: knights.map((z) => [z.hp, z.maxHp, z.chestHp, z.chestMax, z.helmetHp, z.helmetMax]),
      gateDestroyed: g.level.world.castleGate.destroyed,
      gatePhysicsGone: !g.level.world.colliders.includes(g.level.world.castleGate.collider)
        && !g.level.world.occluders.includes(g.level.world.castleGate.occluder),
    };
  });
  assert(state.phase === 'fight' && state.total === 30 && state.regular === 25 && state.knights === 5, 'після вибуху зʼявляються рівно 25 зомбі і 5 лицарів', JSON.stringify(state));
  assert(state.knightStats.every((s) => s.join(',') === '150,150,500,500,250,250'), 'кожен лицар має точні HP і міцність броні', JSON.stringify(state.knightStats));
  assert(state.gateDestroyed && state.gatePhysicsGone, 'вибух прибирає ворота, collider і невидиму перешкоду для куль');
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/poland-castle-fight.png' });

  state = await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    const knight = castle.guards.find((z) => z.castleKnight);
    knight.damage(100, null, false);
    const afterChest = [knight.hp, knight.chestHp, knight.helmetHp];
    knight.damage(100, null, true);
    const afterHelmet = [knight.hp, knight.chestHp, knight.helmetHp];
    knight.damage(1000, null, false);
    const afterBreak = [knight.hp, knight.chestHp, knight.chestObj?.visible];
    knight.damage(30, null, false);
    const afterBody = [knight.hp, knight.chestHp];
    for (const zombie of castle.guards) {
      zombie.chestHp = 0;
      zombie.helmetHp = 0;
      if (zombie.state !== 'dead') zombie.damage(99999, null, false);
    }
    g.level.missions.update(0.016, g.input, true);
    const dungeon = g.level.world.castleDungeon;
    return {
      afterChest, afterHelmet, afterBreak, afterBody, phase: castle.phase,
      dungeonOpen: dungeon.open,
      dungeonPhysicsGone: !g.level.world.colliders.includes(dungeon.collider),
      title: castle.title,
    };
  });
  assert(state.afterChest.join(',') === '150,400,250', 'постріл у тіло пошкоджує нагрудник, не HP', JSON.stringify(state));
  assert(state.afterHelmet.join(',') === '150,400,150', 'постріл у голову пошкоджує шолом, не HP', JSON.stringify(state));
  assert(state.afterBreak[0] === 150 && state.afterBreak[1] === 0 && state.afterBreak[2] === false, 'зламаний нагрудник зникає');
  assert(state.afterBody.join(',') === '120,0' && state.phase === 'rescue', 'після броні шкода йде в тіло, а зачистка відкриває порятунок', JSON.stringify(state));
  assert(state.dungeonOpen && state.dungeonPhysicsGone && /відкрите підземелля/i.test(state.title), 'після зачистки прохід у підземелля відкривається автоматично', JSON.stringify(state));

  await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    const dungeon = g.level.world.castleDungeon;
    g.test.teleport(dungeon.x, dungeon.z);
    castle.rescueProgress = 0.99;
    g.test.key('KeyE', true);
    g.level.missions.update(0.1, g.input, true);
    g.test.key('KeyE', false);
  });
  state = await page.evaluate(() => {
    const g = window.__game;
    const story = g.level.missions;
    const castle = story.delegate.get('castle');
    const dungeon = g.level.world.castleDungeon;
    g.test.teleport(dungeon.x + 10, dungeon.z);
    g.level.player.yaw = Math.PI / 2;
    return {
      phase: castle.phase,
      castleState: castle.state,
      storyState: story.get('pol-castle').state,
      bossUnlocked: story.bossUnlocked,
      civilians: story.civilians.length,
      dungeonOpen: dungeon.open,
      dungeonPhysicsGone: !g.level.world.colliders.includes(dungeon.collider),
    };
  });
  assert(state.phase === 'done' && state.castleState === 'done' && state.storyState === 'done' && state.bossUnlocked, 'порятунок завершує весь штурм і відкриває боса', JSON.stringify(state));
  assert(state.civilians >= 3 && state.dungeonOpen && state.dungeonPhysicsGone, 'троє людей виходять із відкритого підземелля', JSON.stringify(state));
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/poland-castle-rescue.png' });
  assert(errors.length === 0, 'у браузері немає помилок', errors.join('\n'));
  console.log('✅ Poland castle assault pass');
} finally {
  await browser.close();
  close();
}
