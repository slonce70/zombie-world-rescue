import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest({
  context: { viewport: { width: 1440, height: 900 } },
});
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=ESP`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'level' && window.__game?.level?.countryId === 'ESP', null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const g = window.__game;
  const manor = g.level.world.zombieManor;
  g.test.teleport(manor.entrance.x - 18, manor.entrance.z);
  g.level.player.yaw = -Math.PI / 2;
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/zombie-world-rescue-spain-manor.png' });
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const g = window.__game;
  const manor = g.level.world.zombieManor;
  g.test.teleport(manor.entrance.x + 12, manor.entrance.z);
  g.level.player.yaw = -Math.PI / 2;
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/zombie-world-rescue-spain-manor-interior.png' });
await page.evaluate(() => {
  const g = window.__game;
  const rescue = g.level.missions.delegate.get('rescue');
  const door = g.level.world.barnDoorCollider;
  const press = { pressed: (key) => key === 'KeyE', down: () => false, justPressed: new Set(['KeyE']) };
  g.level.player.pos.set(door.x, g.level.world.groundH(door.x, door.z), door.z - 1);
  g.level.missions.delegate._up_rescue(rescue, 0.1, press, true);
  for (const zombie of g.level.zombies.list) zombie.rig.group.visible = false;
  g.test.teleport(door.x, door.z - 5);
  g.level.player.yaw = Math.PI;
});
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/zombie-world-rescue-spain-musicians.png' });

const result = await page.evaluate(() => {
  const g = window.__game;
  const story = g.level.missions;
  const mission = story.delegate.get('manor');
  const manor = g.level.world.zombieManor;
  const idle = { pressed: () => false, down: () => false, justPressed: new Set() };
  const press = { pressed: (key) => key === 'KeyE', down: () => false, justPressed: new Set(['KeyE']) };
  const hold = { pressed: () => false, down: (key) => key === 'KeyE', justPressed: new Set() };

  const band = story.delegate.civilians.map((civilian) => ({ kind: civilian.rig.civKind, instrument: civilian.rig.instrument }));
  for (const civilian of story.delegate.civilians) g.level.scene.remove(civilian.rig.group);
  story.delegate.civilians.length = 0;

  const initial = {
    ids: story.objectives.map((o) => o.id),
    estateMeters: manor.estateMeters,
    site: { w: manor.w, d: manor.d },
    building: manor.building,
    hostageY: manor.hostage.y,
    zombies: mission.manorZombies.length,
    chests: mission.chests.length,
    state: mission.state,
    started: mission.started,
    phase: mission.phase,
  };

  // Реальний ланцюжок опор: 12 сходинок підіймають героя на другий поверх.
  let y = g.level.world.groundH(manor.stairs.startX, manor.stairs.z);
  const stairHeights = [];
  for (let i = 0; i < manor.stairs.steps; i++) {
    const x = manor.stairs.startX + i * manor.stairs.stepD;
    y = Math.max(y, g.level.world.floorAt(x, manor.stairs.z, y));
    stairHeights.push(y);
  }
  const secondFloor = g.level.world.floorAt(manor.hostage.x, manor.hostage.z, y);
  const openingX = (manor.ceilingOpening.x1 + manor.ceilingOpening.x2) / 2;
  const openingZ = manor.ceilingOpening.z2 - 0.2;
  const openingFloor = g.level.world.floorAt(openingX, openingZ, manor.hostage.y);

  for (const id of ['esp-band', 'esp-bells', 'esp-fireworks']) story._completeObjective(id);
  story.delegate._up_manor(mission, 0.1, idle, true);
  const active = {
    state: mission.state,
    started: mission.started,
    zombies: mission.manorZombies.length,
    chests: mission.chests.length,
    floors: mission.manorZombies.reduce((out, zombie) => ({ ...out, [zombie.manorFloor]: (out[zombie.manorFloor] || 0) + 1 }), {}),
    types: mission.manorZombies.reduce((out, z) => ({ ...out, [z.type]: (out[z.type] || 0) + 1 }), {}),
    rewards: mission.chests.map((chest) => chest.reward),
  };

  const firstFloorZombie = mission.manorZombies.find((zombie) => zombie.manorFloor === 0);
  const hpBeforeVerticalHit = g.level.player.health;
  g.level.player.pos.set(firstFloorZombie.x, manor.hostage.y, firstFloorZombie.z);
  const verticalHit = g.level.zombies._hurt(g.level.player, 10, firstFloorZombie.x, firstFloorZombie.z, 0, firstFloorZombie.y);

  const grants = [];
  for (const chest of mission.chests) {
    const before = { coins: g.save.coins, crystals: g.save.crystals, xp: g.save.xp, buffs: { ...g.level.player.buffs } };
    g.level.player.pos.set(chest.x, chest.y, chest.z);
    story.delegate._up_manor(mission, 0.1, press, true);
    grants.push({
      reward: chest.reward,
      before,
      after: { coins: g.save.coins, crystals: g.save.crystals, xp: g.save.xp, buffs: { ...g.level.player.buffs } },
    });
  }

  for (const zombie of mission.manorZombies) zombie.state = 'dead';
  story.delegate._up_manor(mission, 0.1, idle, true);
  g.level.player.pos.set(manor.hostage.x, manor.hostage.y, manor.hostage.z);
  story.delegate._up_manor(mission, 3.1, hold, true);
  story._syncObjectiveStates();

  return {
    initial,
    band,
    active,
    stairHeights,
    secondFloor,
    openingFloor,
    verticalMelee: { hit: verticalHit, hpBefore: hpBeforeVerticalHit, hpAfter: g.level.player.health },
    chests: { opened: mission.chests.filter((chest) => chest.opened).length, grants },
    final: {
      phase: mission.phase,
      state: mission.state,
      killed: mission.killed,
      civilians: story.delegate.civilians.length,
      objectives: story.objectives.map((o) => o.state),
      bossUnlocked: story.bossUnlocked,
    },
  };
});

check(result.initial.ids.join(',') === 'esp-band,esp-bells,esp-fireworks,esp-manor',
  'маєток є четвертим сюжетним завданням Іспанії', JSON.stringify(result.initial.ids));
check(result.band.map((member) => member.instrument).join(',') === 'trumpet,guitar,drum'
  && result.band.every((member) => member.kind.startsWith('musician-')),
  'після порятунку з хліва виходять троє музикантів з інструментами', JSON.stringify(result.band));
check(result.initial.building.meters.w === 350 && result.initial.building.meters.d === 350
  && result.initial.building.w === result.initial.site.w && result.initial.building.d === result.initial.site.d
  && result.initial.building.floors === 2 && result.initial.building.rooms === 16 && result.initial.building.corridors === 2,
  'сам маєток 350×350 м, має два поверхи, 16 кімнат і коридори', JSON.stringify(result.initial.building));
check(result.initial.state === 'locked' && !result.initial.started && result.initial.zombies === 0 && result.initial.chests === 0,
  'до четвертого завдання маєток порожній', JSON.stringify(result.initial));
check(result.active.state === 'active' && result.active.started && result.active.zombies === 120 && result.active.chests === 5
  && result.active.types.walker === 96 && result.active.types.runner === 18 && result.active.types.tank === 6
  && result.active.floors[0] === 80 && result.active.floors[1] === 40
  && ['coins', 'crystals', 'xp', 'buff'].every((reward) => result.active.rewards.includes(reward)),
  'на четвертому завданні зʼявляються 120 зомбі та 5 скринь', JSON.stringify(result.active));
check(result.stairHeights.every((height, i, list) => i === 0 || height >= list[i - 1])
  && result.stairHeights.at(-1) - result.stairHeights[0] > 4
  && Math.abs(result.secondFloor - result.initial.hostageY) < 0.01
  && result.openingFloor < result.initial.hostageY - 2,
  'сходи ведуть крізь справжній отвір у перекритті', JSON.stringify({ stairs: result.stairHeights, secondFloor: result.secondFloor, openingFloor: result.openingFloor }));
check(!result.verticalMelee.hit && result.verticalMelee.hpAfter === result.verticalMelee.hpBefore,
  'зомбі з першого поверху не бʼє гравця на другому', JSON.stringify(result.verticalMelee));
check(result.chests.opened === 5
  && result.chests.grants.some((g) => g.reward === 'coins' && g.after.coins >= g.before.coins + 100)
  && result.chests.grants.some((g) => g.reward === 'crystals' && g.after.crystals === g.before.crystals + 3)
  && result.chests.grants.some((g) => g.reward === 'xp' && g.after.xp === g.before.xp + 25)
  && result.chests.grants.some((g) => g.reward === 'buff'
    && Object.keys(g.after.buffs).some((buff) => g.after.buffs[buff] > g.before.buffs[buff])),
  'усі 5 скринь відкриваються та видають 100 монет, 3 кристали, 25 XP або баф', JSON.stringify(result.chests));
check(result.final.killed === 120 && result.final.state === 'done' && result.final.civilians === 5
  && result.final.objectives.every((state) => state === 'done') && result.final.bossUnlocked,
  'після зачистки 120 зомбі гравець звільняє людей і завершує завдання', JSON.stringify(result.final));

for (const error of errors) console.log('  ❌', error);
if (errors.length) failed += errors.length;
await closeTest();
if (failed) process.exit(1);
console.log('🎉 ІСПАНСЬКИЙ ЗОМБІ-МАЄТОК ПРАЦЮЄ');
