import { mkdir } from 'node:fs/promises';
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

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  await page.evaluate(() => window.__game.startLevel('POL'));
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.countryId === 'POL', null, { timeout: 30000 });

  let state = await page.evaluate(() => {
    const g = window.__game;
    const story = g.level.missions;
    const castle = story.delegate.get('castle');
    g.test.completeStoryObjective('pol-castle');
    return {
      radius: castle.site.r,
      phase: castle.phase,
      castleState: castle.state,
      storyState: story.get('pol-castle').state,
      gateVisible: g.level.world.castleGate.group.visible,
      gateCollider: g.level.world.colliders.includes(g.level.world.castleGate.collider),
      dungeonCollider: g.level.world.colliders.includes(g.level.world.castleDungeon.collider),
    };
  });
  assert(state.radius >= 34, 'замок справді великий', JSON.stringify(state));
  assert(state.phase === 'find' && state.castleState === 'locked' && state.storyState === 'locked', 'замкнена сюжетна ціль не виконується завчасно', JSON.stringify(state));
  assert(state.gateVisible && state.gateCollider && state.dungeonCollider, 'ворота й підземелля активні лише для castle mission');

  await page.evaluate(() => {
    const g = window.__game;
    g.test.completeStoryObjective('pol-bonfires');
    g.test.completeStoryObjective('pol-train');
    g.test.finishHorde();
    const castle = g.level.missions.delegate.get('castle');
    g.test.teleport(castle.explosive.x, castle.explosive.z);
    g.test.key('KeyE', true);
    g.level.missions.update(0.016, g.input, true);
    g.test.key('KeyE', false);
  });
  state = await page.evaluate(() => {
    const story = window.__game.level.missions;
    const castle = story.delegate.get('castle');
    return { phase: castle.phase, title: story.currentStoryObjective(), marker: story.getMarkers()[0] };
  });
  assert(state.phase === 'carry' && /воріт/i.test(state.title), 'ящик підбирається і HUD переходить до воріт', JSON.stringify(state));

  await page.evaluate(() => {
    const g = window.__game;
    const gate = g.level.world.castleGate;
    g.test.teleport(gate.x, gate.z + 4);
    g.level.missions.update(0.016, g.input, true);
    g.level.player.yaw = 0;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/poland-castle-gate.png' });

  await page.evaluate(() => {
    const g = window.__game;
    const castle = g.level.missions.delegate.get('castle');
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
    return { afterChest, afterHelmet, afterBreak, afterBody, phase: castle.phase };
  });
  assert(state.afterChest.join(',') === '150,400,250', 'постріл у тіло пошкоджує нагрудник, не HP', JSON.stringify(state));
  assert(state.afterHelmet.join(',') === '150,400,150', 'постріл у голову пошкоджує шолом, не HP', JSON.stringify(state));
  assert(state.afterBreak[0] === 150 && state.afterBreak[1] === 0 && state.afterBreak[2] === false, 'зламаний нагрудник зникає');
  assert(state.afterBody.join(',') === '120,0' && state.phase === 'rescue', 'після броні шкода йде в тіло, а зачистка відкриває порятунок', JSON.stringify(state));

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
