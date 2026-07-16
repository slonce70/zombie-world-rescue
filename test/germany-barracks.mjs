import { mkdir } from 'node:fs/promises';
import { openBrowserTest } from './_browser.mjs';

const { BASE: base, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader', '--no-sandbox'] }, context: { viewport: { width: 1440, height: 900 } }, captureErrors: false });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await mkdir('test-results', { recursive: true });

const assert = (value, message, details = '') => {
  if (!value) throw new Error(`${message}${details ? `: ${details}` : ''}`);
  console.log(`  ✅ ${message}`);
};

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe');
  await page.evaluate(() => window.__game.startLevel('DEU'));
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.countryId === 'DEU');

  let state = await page.evaluate(() => {
    const g = window.__game;
    const story = g.level.missions;
    const mission = story.delegate.get('barracks');
    const gateObjective = story.objectives.find((o) => o.id === 'deu-gate');
    const gateMission = story._delegateMissionForObjective(gateObjective);
    const gateSite = g.level.country.map.storySites.cityGate;
    const before = g.level.zombies.list.filter((z) => z.barracksSpawn).length;
    story.delegate.update(20, g.input, true);
    return {
      ids: story.objectives.map((o) => o.id),
      state: mission.state,
      hp: mission.hp,
      after: g.level.zombies.list.filter((z) => z.barracksSpawn).length,
      collider: g.level.world.colliders.includes(mission.barracks.collider),
      occluder: g.level.world.occluders.includes(mission.barracks.occluder),
      before,
      gateType: gateMission.type,
      gateAtSite: gateMission.zone.x === gateSite.x && gateMission.zone.z === gateSite.z,
    };
  });
  assert(state.ids.join(',') === 'deu-workshop,deu-convoy,deu-gate,deu-barracks', 'казарма є четвертим сюжетним завданням Німеччини', JSON.stringify(state));
  assert(state.state === 'locked' && state.hp === 2500, 'казарма має 2500 HP і спочатку заблокована', JSON.stringify(state));
  assert(state.before === 0 && state.after === 0, 'заблокована казарма не випускає зомбі');
  assert(state.collider && state.occluder, 'казарма має фізичну й кульову перешкоду');
  assert(state.gateType === 'defense' && state.gateAtSite, 'штурм брами запускає оборону саме біля міської брами', JSON.stringify(state));

  state = await page.evaluate(() => {
    const g = window.__game;
    const story = g.level.missions;
    for (const id of ['deu-workshop', 'deu-convoy']) g.test.completeStoryObjective(id);
    const gate = story.delegate.get('defense');
    g.test.teleport(gate.zone.x, gate.zone.z);
    story.update(0.01, g.input, true);
    gate.timer = 0.01;
    story.update(0.02, g.input, true);
    const mission = story.delegate.get('barracks');
    mission.spawnFastT = 2;
    mission.spawnGiantT = 7;
    const before = g.level.zombies.list.length;
    story.delegate._up_barracks(mission, 7.01);
    const spawned = g.level.zombies.list.slice(before).filter((z) => z.barracksSpawn);
    return {
      objectiveState: story.get('deu-barracks').state,
      missionState: mission.state,
      title: story.currentStoryObjective(),
      fast: spawned.filter((z) => z.type === 'runner' || z.type === 'walker').length,
      giants: spawned.filter((z) => z.type === 'tank').length,
      types: spawned.map((z) => z.type),
      gateState: story.get('deu-gate').state,
    };
  });
  assert(state.gateState === 'done', '45 секунд оборони завершують сюжетне завдання брами', JSON.stringify(state));
  assert(state.objectiveState === 'active' && state.missionState === 'active', 'після трьох завдань казарма стає активною', JSON.stringify(state));
  assert(state.fast === 3 && state.giants === 1, 'за 7 секунд виходять 3 бігуни/волоцюги та 1 велетень', JSON.stringify(state));
  assert(/2500/.test(state.title), 'HUD показує живі HP казарми', state.title);

  await page.evaluate(() => {
    const g = window.__game;
    const mission = g.level.missions.delegate.get('barracks');
    g.test.teleport(mission.site.x, mission.site.z + 18);
    g.level.player.yaw = 0;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/germany-barracks.png' });

  state = await page.evaluate(async () => {
    const { Vector3 } = await import('/vendor/three.module.js');
    const g = window.__game;
    const engine = g.level.missions.delegate;
    const mission = engine.get('barracks');
    const ray = engine.barracksHitTest(
      new Vector3(mission.site.x, mission.barracks.y + 3.7, mission.site.z + 18),
      new Vector3(0, 0, -1),
      30,
    );
    engine.damageBarracks(500, ray && ray.point);
    const afterHit = { hp: mission.hp, title: g.level.missions.currentStoryObjective() };
    const beforeDestroyCount = g.level.zombies.list.filter((z) => z.barracksSpawn).length;
    engine.damageBarracks(1000, ray && ray.point);
    engine.damageBarracks(1000, ray && ray.point);
    g.level.missions.update(0.016, g.input, true);
    engine._up_barracks(mission, 30);
    return {
      ray: !!ray,
      afterHit,
      hp: mission.hp,
      destroyed: mission.destroyed,
      missionState: mission.state,
      objectiveState: g.level.missions.get('deu-barracks').state,
      bossUnlocked: g.level.missions.bossUnlocked,
      groupGone: !mission.barracks.group.parent,
      colliderGone: !g.level.world.colliders.includes(mission.barracks.collider),
      occluderGone: !g.level.world.occluders.includes(mission.barracks.occluder),
      spawnStopped: g.level.zombies.list.filter((z) => z.barracksSpawn).length === beforeDestroyCount,
    };
  });
  assert(state.ray && state.afterHit.hp === 2000 && /2000/.test(state.afterHit.title), 'постріл знімає HP і відразу оновлює HUD', JSON.stringify(state));
  assert(state.hp === 0 && state.destroyed && state.missionState === 'done' && state.objectiveState === 'done', '0 HP руйнує казарму й завершує завдання', JSON.stringify(state));
  assert(state.bossUnlocked, 'після четвертого завдання відкривається бос', JSON.stringify(state));
  assert(state.groupGone && state.colliderGone && state.occluderGone, 'після руйнування зникають модель і всі перешкоди');
  assert(state.spawnStopped, 'після руйнування нові зомбі не виходять');
  assert(errors.length === 0, 'у браузері немає помилок', errors.join('\n'));
  console.log('✅ Germany barracks mission pass');
} finally {
  await closeTest();
}
