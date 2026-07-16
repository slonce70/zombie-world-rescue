import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base, close } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const assert = (ok, message, details = '') => {
  if (!ok) throw new Error(`${message}${details ? `: ${details}` : ''}`);
  console.log(`  ✅ ${message}`);
};

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  await page.evaluate(() => window.__game.startLevel('TUR'));
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.countryId === 'TUR', null, { timeout: 30000 });

  const ship = await page.evaluate(() => {
    const g = window.__game;
    const delegate = g.level.missions.delegate;
    const m = delegate.get('shiprescue');
    const input = (pressed = false, down = false) => ({
      justPressed: new Set(pressed ? ['KeyE'] : []),
      pressed: (key) => pressed && key === 'KeyE',
      down: (key) => down && key === 'KeyE',
    });
    const at = (p) => g.level.player.pos.set(p.x, g.level.world.groundH(p.x, p.z), p.z);
    const phases = [m.phase];
    const targets = [];
    at(m.boards); delegate._up_shiprescue(m, 0.016, input(true), true); phases.push(m.phase);
    at(m.dock); delegate._up_shiprescue(m, 0.016, input(), true); phases.push(m.phase);
    delegate._up_shiprescue(m, 15, input(false, true), true);
    const halfway = m.repairProgress;
    delegate._up_shiprescue(m, 15, input(false, true), true); phases.push(m.phase);
    at(m.dock); delegate._up_shiprescue(m, 0.016, input(true), true); phases.push(m.phase);
    targets.push(delegate._shipTarget(m) === m.shore ? 'shore' : 'dock');
    delegate._up_shiprescue(m, 8, input(), true); phases.push(m.phase);
    at(m.shore); delegate._up_shiprescue(m, 2, input(false, true), true); phases.push(m.phase);
    targets.push(delegate._shipTarget(m) === m.shore ? 'shore' : 'dock');
    at(m.shore); delegate._up_shiprescue(m, 0.016, input(true), true); phases.push(m.phase);
    targets.push(delegate._shipTarget(m) === m.dock ? 'dock' : 'shore');
    delegate._up_shiprescue(m, 8, input(), true); phases.push(m.phase);
    at(m.dock); delegate._up_shiprescue(m, 2, input(false, true), true); phases.push(m.state);
    return {
      objective: g.level.missions.objectives.find((o) => o.id === 'tur-rescue-ship')?.kind,
      halfway,
      phases,
      targets,
      people: m.people.length,
      state: m.state,
    };
  });
  assert(ship.objective === 'shiprescue', 'у Туреччині є окреме завдання порятунку кораблем', JSON.stringify(ship));
  assert(ship.halfway === 0.5, 'ремонт корабля триває рівно 30 секунд', JSON.stringify(ship));
  assert(ship.people === 3 && ship.state === 'done' && ship.phases.join(',') === 'find,carry,repair,board,sailing,rescue,return-board,returning,unload,done', 'повний шлях: дошки → ремонт → плавання → люди → висадка', JSON.stringify(ship));
  assert(ship.targets.join(',') === 'shore,shore,dock', 'маяк веде до правильного берега в обидва боки', JSON.stringify(ship));

  await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('POL'); });
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.countryId === 'POL', null, { timeout: 30000 });
  const castle = await page.evaluate(() => {
    const g = window.__game;
    const m = g.level.missions.delegate.get('castle');
    g.level.missions.delegate._spawnCastleGuards(m);
    return {
      towers: g.level.world.castleTowerSpawns,
      archers: m.archers.map((z) => ({ hp: z.hp, maxHp: z.maxHp, damage: z.ranged?.dmg, helmet: z.helmetHp, helmetMax: z.helmetMax, y: z.y })),
    };
  });
  assert(castle.towers.length === 4 && castle.archers.length === 4, 'на чотирьох баштах стоять чотири лучники', JSON.stringify(castle));
  assert(castle.archers.every((z, i) => z.hp === 120 && z.maxHp === 120 && z.damage === 7 && z.helmet === 125 && z.helmetMax === 125 && z.y === castle.towers[i].y), 'параметри й висота кожного лучника правильні', JSON.stringify(castle.archers));
  assert(errors.length === 0, 'у браузері немає помилок', errors.join('\n'));
  console.log('🎉 TURKEY SHIP + CASTLE ARCHERS ПРОЙДЕНО');
} finally {
  await browser.close();
  close();
}
