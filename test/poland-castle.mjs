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
  worldSource.includes('const N = Math.max(24, Math.round((48 * r / 36) / 4) * 4);')
    && worldSource.includes('block.rotation.y = -ang - Math.PI / 2;')
    && worldSource.includes('gateGap < 7.9 || dungeonGap < 3.6')
    && worldSource.includes('const h = 8.5;')
    && worldSource.includes('lintel.position.set(0, 7.4, 0);')
    && worldSource.includes('mouth.position.set(0, 2.7, 0.8);')
    && worldSource.includes('length: 50,')
    && worldSource.includes('const dungeonDepth = 6;')
    && worldSource.includes('floorHeightAt')
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
    const archers = castle.archers;
    return {
      phase: castle.phase,
      total: castle.guards.length,
      regular: regular.length,
      knights: knights.length,
      knightStats: knights.map((z) => [z.hp, z.maxHp, z.chestHp, z.chestMax, z.helmetHp, z.helmetMax]),
      archerStats: archers.map((z) => [z.type, z.hp, z.maxHp, z.ranged?.dmg, z.helmetHp, z.helmetMax, z.y]),
      towerHeights: g.level.world.castleTowerSpawns.map((spot) => spot.y),
      gateDestroyed: g.level.world.castleGate.destroyed,
      gatePhysicsGone: !g.level.world.colliders.includes(g.level.world.castleGate.collider)
        && !g.level.world.occluders.includes(g.level.world.castleGate.occluder),
    };
  });
  assert(state.phase === 'fight' && state.total === 30 && state.regular === 25 && state.knights === 5, 'після вибуху зʼявляються рівно 25 зомбі і 5 лицарів', JSON.stringify(state));
  assert(state.knightStats.every((s) => s.join(',') === '150,150,500,500,250,250'), 'кожен лицар має точні HP і міцність броні', JSON.stringify(state.knightStats));
  assert(state.archerStats.length === 4 && state.archerStats.every((s, i) => s.slice(0, 6).join(',') === 'archer,120,120,7,125,125' && s[6] === state.towerHeights[i]), 'на кожній башті стоїть лучник: 120 HP, 7 шкоди, шолом 125', JSON.stringify(state.archerStats));
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
    for (const archer of castle.archers) {
      archer.helmetHp = 0;
      if (archer.state !== 'dead') archer.damage(99999, null, false);
    }
    g.level.missions.update(0.016, g.input, true);
    const dungeon = g.level.world.castleDungeon;
    const pathSamples = [];
    for (let i = 1; i < dungeon.path.length; i++) {
      const a = dungeon.path[i - 1], b = dungeon.path[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 1; d < len; d += 1) pathSamples.push({
        x: a.x + (b.x - a.x) * d / len,
        z: a.z + (b.z - a.z) * d / len,
      });
    }
    const maxPathPush = pathSamples.reduce((max, point) => {
      const hit = g.level.world.collide(point.x, point.z, 0.45, dungeon.y + 1);
      return Math.max(max, Math.hypot(hit.x - point.x, hit.z - point.z));
    }, 0);
    const dungeonMarker = g.level.missions.getMarkers().find((marker) => marker.icon === '🧙');
    const player = g.level.player;
    const surfaceX = dungeon.tunnelStartX + 15;
    const surfaceY = g.level.world.groundH(surfaceX, dungeon.entranceZ);
    player.inCastleDungeon = false;
    player.pos.set(surfaceX, surfaceY, dungeon.entranceZ);
    player.vel.set(0, 0, 0);
    player.onGround = true;
    player._updateGravityCollide(0.1, g.input, false);
    const surfaceFall = surfaceY - player.pos.y;
    player.inCastleDungeon = false;
    player.pos.set(dungeon.tunnelStartX - 0.15, dungeon.surfaceY, dungeon.entranceZ);
    player.vel.set(5, 0, 0);
    player.onGround = true;
    player._updateGravityCollide(0.2, g.input, false);
    const entranceDescent = {
      inside: player.inCastleDungeon,
      drop: dungeon.surfaceY - player.pos.y,
    };
    player.pos.set(dungeon.tunnelStartX + 3, dungeon.surfaceY - 2, dungeon.entranceZ);
    player.inCastleDungeon = true;
    player.health = 10000;
    for (const wizard of castle.dungeonWizards) wizard.summonCd = 0;
    for (let i = 0; i < 80; i++) g.level.zombies.update(0.05);
    const dungeonEnemies = g.level.zombies.list.filter((z) => z.zone === 'castle-dungeon' && z.state !== 'dead');
    const enemiesContained = dungeonEnemies.every((z) => (
      z.x >= dungeon.enemyMinX && dungeon.floorHeightAt(z.x, z.z) !== null
    ));
    const summoned = g.level.zombies.list.filter((z) => z._summonedBy);
    const summonedContained = summoned.length >= 5 && summoned.every((z) => (
      z.zone === 'castle-dungeon' && z.x >= dungeon.enemyMinX
    ));
    player.pos.set(dungeon.x, dungeon.y, dungeon.z + dungeon.chamberSize / 2 - 0.8);
    player.vel.set(0, 0, 8);
    player.inCastleDungeon = true;
    player.onGround = true;
    for (let i = 0; i < 8; i++) player._updateGravityCollide(0.1, g.input, false);
    const wallCollision = {
      inside: player.inCastleDungeon,
      floor: dungeon.floorHeightAt(player.pos.x, player.pos.z),
      y: player.pos.y,
    };
    const delegate = g.level.missions.delegate;
    const snapshot = delegate.netState();
    const castleNet = snapshot.s[castle.slotIndex];
    const originalOpen = g.level.world.openCastleDungeon;
    const originalDestroy = g.level.world.destroyCastleGate;
    let guestOpenCalls = 0, guestDestroyCalls = 0;
    g.level.world.openCastleDungeon = function (...args) { guestOpenCalls++; return originalOpen.apply(this, args); };
    g.level.world.destroyCastleGate = function (...args) { guestDestroyCalls++; return originalDestroy.apply(this, args); };
    castle.phase = 'find';
    delegate.applyNet(snapshot);
    g.level.world.openCastleDungeon = originalOpen;
    g.level.world.destroyCastleGate = originalDestroy;
    return {
      afterChest, afterHelmet, afterBreak, afterBody, phase: castle.phase,
      dungeonOpen: dungeon.open,
      dungeonPhysicsGone: !g.level.world.colliders.includes(dungeon.collider),
      title: castle.title,
      dungeonLength: dungeon.length,
      dungeonDepth: dungeon.surfaceY - g.level.world.dungeonGroundH(dungeon.x, dungeon.z),
      rampDrop: dungeon.surfaceY - g.level.world.dungeonGroundH(dungeon.entranceX + 5.5, dungeon.entranceZ),
      chamberSize: dungeon.chamberSize,
      chamberFloor: g.level.world.dungeonGroundH(dungeon.x, dungeon.z),
      surfaceFall,
      entranceDescent,
      stairCount: dungeon.stairCount,
      stairHeights: Array.from({ length: dungeon.stairCount }, (_, i) => (
        dungeon.floorHeightAt(dungeon.tunnelStartX + (i + 0.25) * 10 / dungeon.stairCount, dungeon.entranceZ)
      )),
      enemiesBehindStairs: castle.dungeonWizards.concat(castle.dungeonStones)
        .every((z) => z.x >= dungeon.enemyMinX),
      enemiesContained,
      summonedContained,
      wallCollision,
      pathLength: dungeon.path.slice(1).reduce((sum, point, i) => (
        sum + Math.hypot(point.x - dungeon.path[i].x, point.z - dungeon.path[i].z)
      ), 0),
      wizardCount: castle.dungeonWizards.length,
      wizardTypes: castle.dungeonWizards.map((z) => z.type),
      stoneCount: castle.dungeonStones.length,
      stoneStats: castle.dungeonStones.map((z) => [z.type, z.hp, z.maxHp, z.stats.dmg, z.stats.hitStun]),
      maxPathPush,
      dungeonMarker,
      castleNet,
      coopApplied: { phase: castle.phase, left: castle.dungeonLeft, guestOpenCalls, guestDestroyCalls },
    };
  });
  assert(state.afterChest.join(',') === '150,400,250', 'постріл у тіло пошкоджує нагрудник, не HP', JSON.stringify(state));
  assert(state.afterHelmet.join(',') === '150,400,150', 'постріл у голову пошкоджує шолом, не HP', JSON.stringify(state));
  assert(state.afterBreak[0] === 150 && state.afterBreak[1] === 0 && state.afterBreak[2] === false, 'зламаний нагрудник зникає');
  assert(state.afterBody.join(',') === '120,0' && state.phase === 'dungeon', 'після броні шкода йде в тіло, а зачистка відкриває підземелля', JSON.stringify(state));
  assert(state.dungeonOpen && state.dungeonPhysicsGone && /(5 чаклунів|вороги 0\/16)/i.test(state.title), 'після зачистки прохід у підземелля відкривається автоматично', JSON.stringify(state));
  assert(state.dungeonLength === 50 && state.pathLength === 50, 'прохід підземелля має рівно 50 метрів', JSON.stringify(state));
  assert(state.dungeonDepth === 6 && state.rampDrop > 2.5, 'підземелля розташоване на 6 метрів під землею і має справжній спуск', JSON.stringify(state));
  assert(state.chamberSize === 18, 'після 50-метрового проходу є велика підземна зала 18×18 м', JSON.stringify(state));
  assert(state.surfaceFall < 0.05, 'гравець над тунелем не провалюється крізь землю', JSON.stringify(state));
  assert(state.entranceDescent.inside && state.entranceDescent.drop > 0, 'у підземелля можна спуститися лише через вхід', JSON.stringify(state));
  assert(state.stairCount === 20 && state.stairHeights.every((height, i, all) => i === 0 || height < all[i - 1]), 'від землі вниз ведуть 20 послідовних фізичних сходинок', JSON.stringify(state));
  assert(state.enemiesBehindStairs, 'усі вороги зʼявляються під землею за сходами, а не на вході', JSON.stringify(state));
  assert(state.enemiesContained, 'вороги та викликані чаклунами зомбі не можуть піднятися сходами на поверхню', JSON.stringify(state));
  assert(state.summonedContained, 'чаклуни створюють підземних прислужників, а не поверхневих зомбі', JSON.stringify(state));
  assert(state.wallCollision.inside && state.wallCollision.floor !== null && state.wallCollision.y < state.chamberFloor + 0.05, 'зіткнення зі стіною лишає гравця у підземеллі без телепорту нагору', JSON.stringify(state.wallCollision));
  assert(state.maxPathPush < 0.15, 'усі 50 метрів центрального проходу фізично прохідні', JSON.stringify(state));
  assert(state.wizardCount === 5 && state.wizardTypes.every((type) => type === 'wizard'), 'у підземеллі зʼявляються рівно 5 справжніх зомбі-чаклунів', JSON.stringify(state));
  assert(state.stoneCount === 11 && state.stoneStats.every((s) => s.join(',') === 'stone,500,500,10,0.5'), 'у підземеллі рівно 11 камʼяних зомбі: 500 HP, 10 шкоди, 0.5с оглушення', JSON.stringify(state.stoneStats));
  assert(state.dungeonMarker && state.castleNet[1] === 4 && state.castleNet[5] === 16, 'маркер і co-op снапшот передають фазу підземелля та всіх 16 ворогів', JSON.stringify(state));
  assert(state.coopApplied.phase === 'dungeon' && state.coopApplied.left === 16 && state.coopApplied.guestOpenCalls === 1 && state.coopApplied.guestDestroyCalls === 1, 'co-op гість відкриває ґрати й отримує 16 ворогів зі снапшота', JSON.stringify(state));

  state = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    p.health = 100; p.armor = 0; p.helmetMult = 1; p.gadgetShield = 0; p.buffs.bubble = 0; p.stunT = 0;
    const stone = g.level.missions.delegate.get('castle').dungeonStones[0];
    g.level.zombies._hurt(p, stone.stats.dmg, stone.x, stone.z, stone.stats.hitStun);
    const stunT = p.stunT;
    p.vel.set(0, 0, 0);
    g.test.key('KeyW', true);
    const beforeStun = p.pos.clone();
    p.update(0.1, g.input, true);
    const stunnedMove = p.pos.distanceTo(beforeStun);
    p.stunT = 0; p.vel.set(0, 0, 0);
    const beforeFree = p.pos.clone();
    p.update(0.1, g.input, true);
    g.test.key('KeyW', false);
    return { health: p.health, stunT, stunnedMove, freeMove: p.pos.distanceTo(beforeFree) };
  });
  assert(state.health === 90 && state.stunT === 0.5 && state.stunnedMove < 0.02 && state.freeMove > 0.1, 'удар камʼяного зомбі забирає рівно 10 HP і блокує керування на 0.5 секунди', JSON.stringify(state));

  await page.evaluate(() => {
    const g = window.__game;
    const dungeon = g.level.world.castleDungeon;
    g.test.teleport(dungeon.tunnelStartX + 0.75, dungeon.entranceZ);
    g.level.player.yaw = -Math.PI / 2;
    g.level.player.pitch = -0.28;
    g.hud.clearBanners();
    g.hud.el.toasts.replaceChildren();
    g.hud.el.hud.style.visibility = 'hidden';
    g.__hiddenDungeonRigs = g.level.zombies.list
      .filter((z) => z.zone === 'castle-dungeon')
      .map((z) => z.rig.group);
    for (const group of g.__hiddenDungeonRigs) group.visible = false;
    for (const arm of Object.values(g.level.player.fpArms)) arm.group.visible = false;
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/poland-castle-dungeon.png' });
  await page.evaluate(() => {
    const g = window.__game;
    g.hud.el.hud.style.visibility = '';
    for (const group of g.__hiddenDungeonRigs) group.visible = true;
    g.level.player._applyView();
  });

  await page.evaluate(() => {
    const g = window.__game;
    const stone = g.level.missions.delegate.get('castle').dungeonStones[0];
    g.test.teleport(stone.x - 3, stone.z);
    g.level.player.yaw = -Math.PI / 2;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/poland-castle-stone-zombie.png' });

  state = await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    const dungeon = g.level.world.castleDungeon;
    g.test.teleport(dungeon.x, dungeon.z);
    castle.rescueProgress = 0.99;
    g.test.key('KeyE', true);
    g.level.missions.update(0.1, g.input, true);
    g.test.key('KeyE', false);
    return {
      phase: castle.phase,
      rescueProgress: castle.rescueProgress,
      civilians: g.level.missions.civilians.length,
      storyState: g.level.missions.get('pol-castle').state,
      bossUnlocked: g.level.missions.bossUnlocked,
      prompt: g.level.missions.delegate.prompt?.text || '',
    };
  });
  assert(state.phase === 'dungeon' && state.rescueProgress === 0.99 && state.civilians === 0 && state.storyState === 'active' && !state.bossUnlocked, 'людей не можна звільнити, поки вороги підземелля живі', JSON.stringify(state));
  assert(/залишилося: 16/.test(state.prompt), 'біля полонених HUD показує всіх 16 ворогів', JSON.stringify(state));
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/poland-castle-chamber.png' });

  state = await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    for (const wizard of castle.dungeonWizards.slice(0, 4)) {
      wizard.shieldHp = 0;
      wizard.damage(99999, null, false);
    }
    g.level.missions.update(0.016, g.input, true);
    return {
      phase: castle.phase,
      title: castle.title,
      marker: g.level.missions.getMarkers().find((marker) => marker.icon === '🧙'),
    };
  });
  assert(state.phase === 'dungeon' && /4\/5/.test(state.title) && state.marker, 'після 4 чаклунів вороги ще блокують порятунок і лишаються на мапі', JSON.stringify(state));

  state = await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    const wizard = castle.dungeonWizards[4];
    wizard.shieldHp = 0;
    wizard.damage(99999, null, false);
    g.level.missions.update(0.016, g.input, true);
    return {
      phase: castle.phase,
      title: castle.title,
      marker: g.level.missions.getMarkers().find((marker) => marker.icon === '🆘'),
    };
  });
  assert(state.phase === 'dungeon' && /5\/5/.test(state.title) && !state.marker, 'після 5 чаклунів камʼяні зомбі ще блокують порятунок', JSON.stringify(state));

  state = await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    for (const stone of castle.dungeonStones.slice(0, 10)) stone.damage(99999, null, false);
    g.level.missions.update(0.016, g.input, true);
    return { phase: castle.phase, title: castle.title };
  });
  assert(state.phase === 'dungeon' && /10\/11/.test(state.title), 'після 10 камʼяних зомбі останній ще блокує порятунок', JSON.stringify(state));

  state = await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
    castle.dungeonStones[10].damage(99999, null, false);
    g.level.missions.update(0.016, g.input, true);
    return {
      phase: castle.phase,
      title: castle.title,
      marker: g.level.missions.getMarkers().find((marker) => marker.icon === '🆘'),
    };
  });
  assert(state.phase === 'rescue' && /кінця підземелля/i.test(state.title) && state.marker, 'останній камʼяний зомбі відкриває порятунок і перемикає мапу на 🆘', JSON.stringify(state));

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
