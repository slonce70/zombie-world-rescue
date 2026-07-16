import { openBrowserTest } from './_browser.mjs';

const { BASE: base, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader', '--no-sandbox'] }, context: { viewport: { width: 1280, height: 800 } }, captureErrors: false });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

const check = (ok, message, details = '') => {
  if (!ok) throw new Error(`${message}${details ? `: ${details}` : ''}`);
  console.log(`  ✅ ${message}`);
};

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  await page.evaluate(() => window.__game.startLevel('TUR'));
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.countryId === 'TUR', null, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const { rollMissionSet } = await import('/src/missionpool.js');
    const game = window.__game;
    const level = game.level;
    const missions = level.missions.delegate;
    const ship = missions.get('shiprescue');
    const emptyInput = {
      justPressed: new Set(),
      pressed: () => false,
      down: () => false,
    };
    const pressedInput = {
      justPressed: new Set(['KeyE']),
      pressed: (key) => key === 'KeyE',
      down: () => false,
    };
    const remote = { pid: 2, health: 100, holdE: false, pos: level.player.pos.clone() };
    const atRemote = (point) => remote.pos.set(point.x, level.world.groundH(point.x, point.z), point.z);
    const nearRemote = (x, z, radius) => Math.hypot(remote.pos.x - x, remote.pos.z - z) < radius;

    // Гість-дзеркало: intent і mid-join стан.
    const sent = [];
    const oldNet = level.net;
    const oldMirror = level.mirror;
    missions.mirror = true;
    level.mirror = true;
    level.net = {
      holdE: false,
      myPid: () => 2,
      remotes: new Map(),
      sendUse: (kind, extra) => sent.push([kind, extra?.a]),
    };
    ship.state = 'active'; ship.phase = 'find'; ship.carrierPid = 0; ship.sailT = 0;
    missions._syncShipVisual(ship);
    level.player.pos.set(ship.boards.x, level.world.groundH(ship.boards.x, ship.boards.z), ship.boards.z);
    missions._updateMirror(0.016, pressedInput, true);

    ship.phase = 'returning'; ship.sailT = 0.5; ship.repairProgress = 1;
    ship.rescueProgress = 1; ship.unloadProgress = 0.25; ship.carrierPid = 2;
    ship.riderMask = 1 << 2;
    const snapshot = missions.netState();
    ship.phase = 'find'; ship.sailT = 0; ship.carrierPid = 0;
    missions.applyNet(snapshot);
    missions._updateMirror(0.016, emptyInput, true);
    const midX = (ship.dock.x + ship.shore.x) / 2;
    const midZ = (ship.dock.z + ship.shore.z) / 2;
    const restored = {
      phase: ship.phase,
      sailT: ship.sailT,
      unload: ship.unloadProgress,
      carrier: ship.carrierPid,
      riderMask: ship.riderMask,
      shipDistance: Math.hypot(ship.ship.position.x - midX, ship.ship.position.z - midZ),
      playerDistance: Math.hypot(level.player.pos.x - midX, level.player.pos.z - midZ),
      tupleSize: snapshot.s[ship.slotIndex].length,
    };

    // Хост-авторитет: увесь шлях виконує віддалений гість.
    missions.mirror = false;
    level.mirror = oldMirror;
    level.net = oldNet;
    level.players = [remote];
    ship.state = 'active'; ship.phase = 'find'; ship.carrierPid = 0; ship.sailT = 0;
    ship.repairProgress = 0; ship.rescueProgress = 0; ship.unloadProgress = 0;
    missions._syncShipVisual(ship);
    level.player.pos.set(ship.boards.x + 30, level.world.groundH(ship.boards.x + 30, ship.boards.z), ship.boards.z);
    atRemote(ship.boards);
    missions.useShip(2, 'pickup', nearRemote);
    const phases = [ship.phase];
    atRemote(ship.dock);
    missions._up_shiprescue(ship, 0.016, emptyInput, true); phases.push(ship.phase);
    remote.holdE = true;
    missions._up_shiprescue(ship, 30, emptyInput, true); phases.push(ship.phase);
    remote.holdE = false;
    missions.useShip(2, 'board', nearRemote); phases.push(ship.phase);
    missions._up_shiprescue(ship, 8, emptyInput, true); phases.push(ship.phase);
    atRemote(ship.shore); remote.holdE = true;
    missions._up_shiprescue(ship, 2, emptyInput, true); phases.push(ship.phase);
    remote.holdE = false;
    missions.useShip(2, 'return', nearRemote); phases.push(ship.phase);
    missions._up_shiprescue(ship, 8, emptyInput, true); phases.push(ship.phase);
    atRemote(ship.dock); remote.holdE = true;
    missions._up_shiprescue(ship, 2, emptyInput, true); phases.push(ship.state);

    return {
      coopSet: rollMissionSet('TUR', level.country.seed, 0),
      sent,
      restored,
      phases,
      peopleAtDock: ship.people.every((rig) => Math.hypot(rig.group.position.x - ship.dock.x, rig.group.position.z - ship.dock.z) < 9),
    };
  });

  check(result.coopSet[3] === 'shiprescue', 'турецький корабель створюється у звичайному co-op наборі', JSON.stringify(result.coopSet));
  check(result.sent.some(([kind, action]) => kind === 'ship' && action === 'pickup'), 'гість надсилає intent підняти ящик', JSON.stringify(result.sent));
  check(result.restored.phase === 'returning' && result.restored.sailT === 0.5 && result.restored.unload === 0.25 && result.restored.carrier === 2 && result.restored.riderMask === 4, 'mid-join відновлює фазу, прогрес, власника ящика та пасажирів', JSON.stringify(result.restored));
  check(result.restored.tupleSize === 8 && result.restored.shipDistance < 0.1 && result.restored.playerDistance < 0.1, 'корабель і гість відновлюються посеред плавання', JSON.stringify(result.restored));
  check(result.phases.join(',') === 'carry,repair,board,sailing,rescue,return-board,returning,unload,done', 'гість проходить увесь ланцюжок корабельної місії', JSON.stringify(result.phases));
  check(result.peopleAtDock, 'врятовані люди висаджені біля причалу');
  check(errors.length === 0, 'у браузері немає помилок', errors.join('\n'));
  console.log('🎉 TURKEY SHIP CO-OP ПРОЙДЕНО');
} finally {
  await closeTest();
}
