import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

try {
  await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60_000 });
  await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30_000 });

  const result = await page.evaluate(() => {
    const g = window.__game;
    const level = g.level;
    const Z = level.zombies;
    const world = level.world;
    const clearZombies = () => {
      for (const zombie of Z.list) {
        zombie.gone = true;
        Z.scene.remove(zombie.rig.group);
        Z.byNidMap.delete(zombie.nid);
      }
      Z.list = [];
    };

    clearZombies();
    const hitZombie = g.test.spawnZombie('walker', 18, 18);
    const hitOrigin = hitZombie.rig.group.position.clone().set(
      hitZombie.x,
      hitZombie.y + hitZombie.rig.height * 0.88,
      hitZombie.z + 6,
    );
    const hitDir = hitZombie.rig.group.position.clone().set(
      hitZombie.x,
      hitZombie.y + hitZombie.rig.height * 0.88,
      hitZombie.z,
    ).sub(hitOrigin).normalize();
    const hit = Z.hitTest(hitOrigin, hitDir, 10);
    const hpBefore = hitZombie.hp;
    hitZombie.damage(10, hitDir, false, {
      weaponId: 'magnum', hitZone: 'body', impactForce: 5, staggerTime: 0.35,
    });
    const shot = {
      hit: !!hit,
      hitZone: hit?.hitZone,
      impactSide: hit?.impactSide,
      damaged: hitZombie.hp < hpBefore,
      state: hitZombie.state,
      staggerT: hitZombie.staggerT,
      flinchSide: hitZombie.rig.anim.flinchSide,
    };

    clearZombies();
    const attacker = g.test.spawnZombie('walker', 28, 28);
    const player = level.player;
    player.pos.set(attacker.x, attacker.y + 2.5, attacker.z - 1);
    player.health = player.maxHealth;
    player.armor = 0;
    player.respawnProtect = 0;
    attacker.state = 'attack';
    attacker.aggroed = true;
    attacker.attackT = 0.44;
    attacker.didHit = false;
    attacker.rig.group.rotation.y = 0;
    const healthBefore = player.health;
    Z.update(0.1);
    const floorAttack = { healthBefore, healthAfter: player.health };

    clearZombies();
    const stuck = g.test.spawnZombie('walker', 42, 42);
    stuck.state = 'chase';
    stuck.aggroed = true;
    stuck.flankLane = 0;
    const originalSide = stuck.avoidSide;
    const originalCollide = world.collide;
    const blockedAt = { x: stuck.x, z: stuck.z };
    world.collide = () => blockedAt;
    Z._buildSepGrid();
    const target = { x: stuck.x, y: stuck.y, z: stuck.z - 12 };
    for (let i = 0; i < 7; i++) Z._moveAndAnimateZombie(stuck, 0.1, 12, 0, -12, target);
    const beforeThreshold = stuck.avoidT || 0;
    for (let i = 0; i < 2; i++) Z._moveAndAnimateZombie(stuck, 0.1, 12, 0, -12, target);
    const sideStep = stuck.avoidT || 0;
    for (let i = 0; i < 11; i++) Z._moveAndAnimateZombie(stuck, 0.1, 12, 0, -12, target);
    world.collide = originalCollide;
    const recovery = {
      beforeThreshold,
      sideStep,
      originalSide,
      side: stuck.avoidSide,
      flankLane: stuck.flankLane,
    };

    const door = world.destructibles.find((item) => item.type === 'door' && item.collider);
    const colliderBefore = !!door && world.colliders.includes(door.collider);
    const destroyedNow = !!door && world.damageDestructible(door, door.hp);
    const destruction = {
      exists: !!door,
      colliderBefore,
      destroyedNow,
      destroyed: !!door?.destroyed,
      colliderAfter: !!door && world.colliders.includes(door.collider),
    };

    return { shot, floorAttack, recovery, destruction };
  });

  console.log('COMBAT REBORN:', JSON.stringify(result));
  check(result.shot.hit && result.shot.hitZone === 'head', 'математичний head hit-zone працює');
  check(['front', 'back', 'left', 'right'].includes(result.shot.impactSide), 'напрямок удару визначено');
  check(result.shot.damaged && result.shot.state === 'stagger' && result.shot.staggerT > 0,
    'Magnum завдає шкоди й перериває звичайного зомбі');
  check(!!result.shot.flinchSide, 'анімація реакції отримує напрямок удару');
  check(result.floorAttack.healthAfter === result.floorAttack.healthBefore, 'зомбі не бʼє через поверх');
  check(result.recovery.beforeThreshold === 0 && result.recovery.sideStep > 0,
    'застряглий зомбі починає обхід після 0.8 с');
  check(result.recovery.side !== result.recovery.originalSide && result.recovery.flankLane !== 0,
    'після 1.8 с зомбі змінює бік і локальний маршрут');
  check(result.destruction.exists && result.destruction.colliderBefore,
    'двері зареєстровані як руйнівний обʼєкт із колайдером');
  check(result.destruction.destroyedNow && result.destruction.destroyed && !result.destruction.colliderAfter,
    'зруйновані двері одразу прибирають колайдер');
  check(errors.length === 0, 'без JS-помилок', JSON.stringify(errors));
} finally {
  await closeTest();
}

console.log(failed === 0 ? '\n✅ COMBAT REBORN GATE PASSED' : `\n❌ COMBAT REBORN GATE FAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
