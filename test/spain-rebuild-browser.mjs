import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { makeCheck } from './_browser.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
let failed = 0;
const check = makeCheck(() => failed++);
page.on('pageerror', (error) => errors.push(error.message));

async function startDestroyedSpainStage(stage) {
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30_000 });
  await page.evaluate(async (stageIndex) => {
    const game = window.__game;
    const { createFront } = await import('/src/worldfront.js');
    game.save.liberated = { ESP: true };
    game.save.front = createFront({ seed: 601, liberated: ['ESP'] });
    game.save.front.world.countries.ESP.damage = 3;
    const operationId = game.save.front.board[0].id;
    game._applyFrontTransition({ type: 'START_OPERATION', operationId });
    for (let i = 0; i < stageIndex; i++) {
      game._applyFrontTransition({ type: 'START_STAGE' });
      game._applyFrontTransition({ type: 'COMPLETE_STAGE', build: [] });
    }
    await game.startFrontOperation(operationId);
  }, stage);
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game?.level?.missions, null, { timeout: 30_000 });
  return page.evaluate(() => {
    const mission = window.__game.level.missions.missions[0];
    return {
      type: mission.type,
      phases: mission.phases,
      required: mission.required,
      buildSeconds: mission.buildSeconds,
      attackSides: mission.attackSides,
      siteId: mission.siteId,
    };
  });
}

try {
  const rebuild = await startDestroyedSpainStage(0);
  check(rebuild.type === 'rebuild', 'зруйнована Іспанія починає з відбудови музичного центру', JSON.stringify(rebuild));
  check(rebuild.phases?.join(',') === 'musicians,tools,resources,build,done', 'етап має точну послідовність цілей');
  check(rebuild.required?.iron === 50 && rebuild.required?.stone === 100 && rebuild.required?.wood === 55,
    'ресурси рівно 50 заліза, 100 каменю і 55 дерева', JSON.stringify(rebuild.required));
  check(rebuild.buildSeconds === 30 && new Set(rebuild.attackSides || []).size === 4,
    'музичний центр будується 30 секунд під атакою з чотирьох сторін');
  const played = await page.evaluate(() => {
    const game = window.__game;
    const level = game.level;
    const engine = level.missions;
    const mission = engine.missions[0];
    const pressed = { pressed: (key) => key === 'KeyE', down: () => false, justPressed: new Set(['KeyE']) };
    const idle = { pressed: () => false, down: () => false, justPressed: new Set() };
    const hold = { pressed: () => false, down: (key) => key === 'KeyE', justPressed: new Set() };
    const door = level.world.barnDoorCollider;
    game.test.teleport(door.x, door.z - 1);
    engine._up_rebuild(mission, 0.1, pressed, true);
    engine._up_rebuild(mission, 2.1, idle, true);
    const afterMusicians = mission.phase;
    for (const tool of mission.tools) {
      game.test.teleport(tool.x, tool.z);
      engine._up_rebuild(mission, 0.1, pressed, true);
    }
    const afterTools = mission.phase;
    for (const node of mission.points) {
      const tool = node.kind === 'wood' ? 'axe' : 'pickaxe';
      for (let hit = 0; hit < 4; hit++) engine.damageResource(node, node.mesh.position.clone(), tool);
    }
    const resources = { phase: mission.phase, iron: mission.iron, stone: mission.stone, wood: mission.wood };
    game.test.teleport(mission.dest.x, mission.dest.z);
    engine._up_rebuild(mission, 30, hold, true);
    const attackers = level.zombies.list.filter((zombie) => zombie.rebuildAttack);
    const sides = new Set(attackers.map((zombie) => {
      const dx = zombie.x - mission.dest.x;
      const dz = zombie.z - mission.dest.z;
      return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'south' : 'north');
    }));
    return {
      afterMusicians,
      afterTools,
      resources,
      state: mission.state,
      phase: mission.phase,
      attackers: attackers.length,
      sides: [...sides],
      rebuilt: mission.rebuilt?.userData?.kind,
    };
  });
  check(played.afterMusicians === 'tools' && played.afterTools === 'resources', 'порятунок музикантів відкриває інструменти, потім ресурси', JSON.stringify(played));
  check(played.resources.phase === 'build' && played.resources.iron === 50 && played.resources.stone === 100 && played.resources.wood === 55,
    'реальний збір точних ресурсів відкриває будівництво', JSON.stringify(played.resources));
  check(played.state === 'done' && played.phase === 'done' && played.attackers === 8 && played.sides.length === 4 && played.rebuilt === 'music-center',
    '30 секунд завершують музичний центр і створюють атаку з чотирьох сторін', JSON.stringify(played));

  const village = await startDestroyedSpainStage(1);
  check(village.type === 'villageclear' && village.siteId === 'village', 'другий етап зачищає село', JSON.stringify(village));
  const villagePlayed = await page.evaluate(() => {
    const engine = window.__game.level.missions;
    const mission = engine.missions[0];
    const count = mission.targets.length;
    for (const zombie of mission.targets) zombie.damage(99999, null, false);
    engine._up_villageclear(mission);
    return { count, state: mission.state, crateReady: engine.crateReady };
  });
  check(villagePlayed.count === 12 && villagePlayed.state === 'done' && !villagePlayed.crateReady,
    'зачистка завершується після окремої групи села без ящика зброї', JSON.stringify(villagePlayed));

  const fireworks = await startDestroyedSpainStage(2);
  check(fireworks.type === 'fireworks' && fireworks.siteId === 'fireworks', 'третій етап обороняє феєрверки', JSON.stringify(fireworks));
  const fireworksPlayed = await page.evaluate(() => {
    const game = window.__game;
    const engine = game.level.missions;
    const mission = engine.missions[0];
    game.test.teleport(mission.zone.x, mission.zone.z);
    engine._up_fireworks(mission, 0);
    engine._up_fireworks(mission, 30);
    return { duration: mission.duration, state: mission.state };
  });
  check(fireworksPlayed.duration === 30 && fireworksPlayed.state === 'done', 'феєрверки обороняються рівно 30 секунд', JSON.stringify(fireworksPlayed));

  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30_000 });
  await page.evaluate(() => window.__game.startLevel('ESP'));
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game?.level?.missions, null, { timeout: 30_000 });
  const normal = await page.evaluate(() => ({
    ids: window.__game.level.missions.objectives.map((objective) => objective.id),
    special: window.__game.level.missions.delegate.missions.some((mission) => ['villageclear', 'fireworks'].includes(mission.type)),
  }));
  check(normal.ids[0] === 'esp-band' && !normal.special, 'звичайна кампанія Іспанії не змінена', JSON.stringify(normal));
  check(errors.length === 0, 'немає JavaScript-помилок', errors.join(' | '));
} finally {
  await browser.close();
  closeServer();
}

if (failed) process.exit(1);
console.log('\n🎉 СЦЕНАРІЙ ВІДБУДОВИ ІСПАНІЇ ПРОЙДЕНО');
