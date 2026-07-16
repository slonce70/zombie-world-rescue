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
    return { result, stopped: { moving: stopped._netMoving, anim: stopped.rig.anim.mode } };
  });
  if (!movement.result.every((z) => z.moving && Math.abs(z.yaw + Math.PI / 2) < 0.2)) {
    throw new Error(`зомбі не дивляться за фактичним рухом: ${JSON.stringify(movement.result)}`);
  }
  if (movement.stopped.moving || movement.stopped.anim !== 'idle') {
    throw new Error(`заблокований зомбі продовжує йти: ${JSON.stringify(movement.stopped)}`);
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

  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/zombie-movement-direction.png' });
  console.log('✅ Зомбі дивляться за фактичним рухом, заблоковані не ковзають, лучники лишаються на баштах');
} finally {
  await closeTest();
}
