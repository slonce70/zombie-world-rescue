import { mkdir } from 'node:fs/promises';
import { openBrowserTest } from './_browser.mjs';

const { BASE: base, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader', '--no-sandbox'] }, context: { viewport: { width: 1280, height: 800 } }, captureErrors: false });

try {
  await page.goto(`${base}/?test&fresh&country=UKR`);
  await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });
  const movement = await page.evaluate(() => {
    const g = window.__game, Z = g.level.zombies, world = g.level.world;
    const originalCollide = world.collide;
    const types = ['walker', 'runner', 'tank', 'shield', 'gladiator'];
    const result = types.map((type, i) => {
      const z = g.test.spawnZombie(type, i * 3, 0);
      z.state = 'chase'; z.aggroed = true; z.rig.group.rotation.y = 0;
      const sx = z.x, sz = z.z;
      world.collide = () => ({ x: sx + 0.5, z: sz });
      Z._moveAndAnimateZombie(z, 0.5, 10, 0, -10, { x: z.x, y: z.y, z: z.z - 10 });
      return { type, yaw: z.rig.group.rotation.y, moving: z._netMoving };
    });
    const stopped = g.test.spawnZombie('walker', 20, 0);
    stopped.state = 'chase'; stopped.aggroed = true;
    const sx = stopped.x, sz = stopped.z;
    world.collide = () => ({ x: sx, z: sz });
    Z._moveAndAnimateZombie(stopped, 0.5, 10, 0, -10, { x: stopped.x, y: stopped.y, z: stopped.z - 10 });
    world.collide = originalCollide;
    return { result, stopped: { moving: stopped._netMoving, anim: stopped.rig.anim.mode, yaw: stopped.rig.group.rotation.y } };
  });
  if (!movement.result.every((z) => z.moving && Math.abs(z.yaw) < 0.2)) {
    throw new Error(`зомбі не дивляться на гравця під час руху: ${JSON.stringify(movement.result)}`);
  }
  if (movement.stopped.moving || movement.stopped.anim !== 'idle' || Math.abs(movement.stopped.yaw || 0) > 0.2) {
    throw new Error(`заблокований зомбі втрачає ціль: ${JSON.stringify(movement.stopped)}`);
  }

  const recovery = await page.evaluate(() => {
    const g = window.__game, Z = g.level.zombies, world = g.level.world;
    const originalCollide = world.collide;
    const z = g.test.spawnZombie('walker', 0, 0);
    z.state = 'chase'; z.aggroed = true; z.flankLane = 0; z.rig.group.rotation.y = 0;
    const target = { x: 0, y: z.y, z: -8 };
    // Кругла перешкода на прямому шляху: її можна обійти зліва або справа.
    world.collide = (x, zz) => {
      const dx = x, dz = zz + 1.5, minD = 1.35;
      const d = Math.hypot(dx, dz);
      if (d >= minD) return { x, z: zz };
      return { x: (dx / Math.max(d, 0.001)) * minD, z: -1.5 + (dz / Math.max(d, 0.001)) * minD };
    };
    for (let i = 0; i < 240; i++) {
      const dx = target.x - z.x, dz = target.z - z.z;
      Z._moveAndAnimateZombie(z, 1 / 60, Math.hypot(dx, dz), dx, dz, target);
    }
    world.collide = originalCollide;
    const dx = target.x - z.x, dz = target.z - z.z, d = Math.hypot(dx, dz);
    const fx = -Math.sin(z.rig.group.rotation.y), fz = -Math.cos(z.rig.group.rotation.y);
    return { x: z.x, z: z.z, distance: d, facing: (fx * dx + fz * dz) / Math.max(0.001, d), avoidSide: z.avoidSide };
  });
  if (!(recovery.z < -1 && recovery.distance < 5 && recovery.facing > 0.9)) {
    throw new Error(`зомбі не обійшов перешкоду: ${JSON.stringify(recovery)}`);
  }

  await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('POL'); });
  await page.waitForFunction(() => window.__game?.level?.countryId === 'POL', null, { timeout: 30000 });
  const towers = await page.evaluate(() => {
    const g = window.__game, m = g.level.missions.delegate.get('castle');
    g.level.missions.delegate._spawnCastleGuards(m);
    const before = m.archers.map((z) => ({ x: z.x, y: z.y, z: z.z }));
    g.level.zombies.update(0.1);
    return m.archers.map((z, i) => ({
      drift: Math.hypot(z.x - before[i].x, z.z - before[i].z),
      y: z.y,
      towerY: g.level.world.castleTowerSpawns[i].y,
    }));
  });
  if (towers.length !== 4 || !towers.every((z) => z.drift < 0.01 && z.y === z.towerY)) {
    throw new Error(`лучники падають із башт: ${JSON.stringify(towers)}`);
  }

  const flank = await page.evaluate(() => {
    const g = window.__game, Z = g.level.zombies, world = g.level.world;
    const originalCollide = world.collide;
    world.collide = (x, z) => ({ x, z });
    const target = { x: 60, y: 0, z: -20 };
    const left = g.test.spawnZombie('walker', 60, 0);
    const right = g.test.spawnZombie('walker', 60, 0);
    left.state = right.state = 'chase';
    left.aggroed = right.aggroed = true;
    left.flankLane = -1; right.flankLane = 1;
    for (const z of [left, right]) Z._moveAndAnimateZombie(z, 0.5, 20, 0, -20, target);
    world.collide = originalCollide;
    return { leftX: left.x, rightX: right.x };
  });
  if (!(flank.leftX < 60 && flank.rightX > 60)) {
    throw new Error(`зграя не розходиться на фланги: ${JSON.stringify(flank)}`);
  }

  await page.evaluate(() => {
    const g = window.__game, p = g.level.player.pos;
    g.test.god();
    g.hud.clearBanners();
    for (const lane of [-1, 0, 1]) {
      const z = g.test.spawnZombie('walker', p.x + lane * 4, p.z - 8);
      z.state = 'chase'; z.aggroed = true; z.flankLane = lane;
    }
  });
  await page.waitForTimeout(900);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/zombie-movement-direction.png' });
  console.log('✅ Зомбі дивляться на гравця, обходять перешкоди, заходять із флангів, а лучники лишаються на баштах');
} finally {
  await closeTest();
}
