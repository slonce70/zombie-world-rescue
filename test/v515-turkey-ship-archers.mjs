import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base, close } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await mkdir('test-results', { recursive: true });

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
    const river = g.level.world.rivers[0];
    const routeClearances = Array.from({ length: 11 }, (_, i) => {
      const t = i / 10;
      const x = m.dock.x + (m.shore.x - m.dock.x) * t;
      const z = m.dock.z + (m.shore.z - m.dock.z) * t;
      return m.waterY - g.level.world.groundH(x, z);
    });
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
      riverCount: g.level.world.rivers.length,
      waterMatchesRiver: m.waterY === river.level,
      minRouteClearance: Math.min(...routeClearances),
      noFakeWater: !('water' in m),
      peopleOnShore: m.people.every((rig) => Math.abs(rig.group.position.x - river.pts[0][0]) > river.width * 0.82),
    };
  });
  assert(ship.objective === 'shiprescue', 'у Туреччині є окреме завдання порятунку кораблем', JSON.stringify(ship));
  assert(ship.halfway === 0.5, 'ремонт корабля триває рівно 30 секунд', JSON.stringify(ship));
  assert(ship.people === 3 && ship.state === 'done' && ship.phases.join(',') === 'find,carry,repair,board,sailing,rescue,return-board,returning,unload,done', 'повний шлях: дошки → ремонт → плавання → люди → висадка', JSON.stringify(ship));
  assert(ship.targets.join(',') === 'shore,shore,dock', 'маяк веде до правильного берега в обидва боки', JSON.stringify(ship));
  assert(ship.riverCount === 1 && ship.waterMatchesRiver && ship.noFakeWater, 'корабель використовує справжній Босфор карти без окремої декоративної смуги', JSON.stringify(ship));
  assert(ship.minRouteClearance > 0.25, 'усі 148 метрів маршруту проходять над дном русла, а не крізь землю', JSON.stringify(ship));
  assert(ship.peopleOnShore, 'врятовані люди стоять на березі за межами води', JSON.stringify(ship));

  await page.evaluate(() => {
    const g = window.__game;
    const delegate = g.level.missions.delegate;
    const m = delegate.get('shiprescue');
    m.state = 'active'; m.phase = 'sailing'; m.sailT = 0.5;
    delegate._setShipPosition(m, 0.5, false, false);
    const z = (m.dock.z + m.shore.z) / 2;
    const px = m.dock.x + 21, pz = z + 14;
    g.level.player.pos.set(px, g.level.world.groundH(px, pz), pz);
    g.level.player.yaw = Math.atan2(px - m.ship.position.x, pz - m.ship.position.z);
    g.level.player.pitch = 0.02;
    g.hud.clearBanners();
    g.hud.el.toasts.replaceChildren();
    g.hud.el.hud.style.visibility = 'hidden';
    for (const arm of Object.values(g.level.player.fpArms)) arm.group.visible = false;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/turkey-ship-bosphorus.png' });

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
