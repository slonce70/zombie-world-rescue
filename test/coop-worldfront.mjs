// v500 World Front network contract: host-only state/results, compact starts,
// canonical reconnect snapshots and stable reward ids.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, extra);
  if (!ok) failed++;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

  const out = await page.evaluate(async () => {
    const { PROTO_VERSION } = await import('/src/net/protocol.js');
    const sync = await import('/src/net/frontsync.js');
    const { CoopSession } = await import('/src/net/coop.js');
    const { HostNet } = await import('/src/net/host.js');
    const { GuestNet } = await import('/src/net/client.js');
    const { applyFrontEvent } = await import('/src/worldfront.js');

    const front = {
      v: 1, seed: 123, generation: 7,
      board: [
        { id: 'g7-UKR-evacuation', country: 'UKR', template: 'evacuation', threat: 2, status: 'active', junk: true },
        { id: 'g7-POL-hunt', country: 'POL', template: 'hunt', threat: 1, status: 'available' },
        { id: 'g7-DEU-siege', country: 'DEU', template: 'siege', threat: 3, status: 'available' },
      ],
      active: { operationId: 'g7-UKR-evacuation', stage: 1, specialist: 'UKR', build: ['dmg25', 'dmg25', 'armor'], status: 'active', timer: 999 },
      projects: { medbay: 2, workshop: 99, radio: -4 }, activeProject: 'medbay', projectProgress: 2,
      restored: { UKR: 2, BAD_KEY: 9 }, claims: ['front:123:g7-UKR-evacuation:operation', 'front:123:g7-UKR-evacuation:operation', '<script>'],
      stats: { opens: 99 }, renderer: { nope: true },
    };

    const wire = sync.sanitizeFrontSnapshot(front);
    const compact = sync.frontSpecFromState(front);
    const expanded = sync.expandFrontSpec(compact);
    const badVersion = sync.sanitizeFrontSnapshot({ ...front, v: 99 });

    const broadcasts = [];
    let started = null;
    const hostGame = {
      seed: 555,
      save: { front },
      startLevel: (countryId, opts) => { started = { countryId, opts }; },
      hud: { toast() {} }, audio: { click() {} },
    };
    const host = new CoopSession(hostGame);
    host.role = 'host'; host.myPid = 1; host.state = 'lobby';
    host.transport.broadcast = (msg) => broadcasts.push(structuredClone(msg));
    host.startFrontStage('UKR', { portal: true }, front.active);
    host.syncFront(front, [{ type: 'grant', rewardId: 'front:123:g7-UKR-evacuation:operation', coins: 300, crystals: 3, eggs: 0 }, { type: 'toast', key: 'nope' }]);

    let netSawForged = 0;
    host.net = { onMessage: () => { netSawForged++; return false; } };
    const beforeForged = broadcasts.length;
    host._onMessage(2, { t: 'frun', run: { v: 1 } });
    host._onMessage(2, { t: 'frresult', won: true });
    host._onMessage(2, { t: 'frreward', coins: 999999 });

    const completedFront = structuredClone(front);
    completedFront.claims = [];
    completedFront.board[0].status = 'completed';
    completedFront.active.stage = 2;
    completedFront.active.status = 'completed';
    const claimedFront = applyFrontEvent(completedFront, { type: 'CLAIM_OPERATION' }).front;
    const personalFront = { marker: 'guest-personal-front' };
    const applied = [];
    const guestGame = {
      save: { front: personalFront }, state: 'globe',
      startLevel: (countryId, opts) => applied.push({ kind: 'start', countryId, operation: opts.operation, spec: opts.coop.spec }),
      applyFrontNetworkRewards: (rewards) => applied.push({ kind: 'reward', rewards }),
    };
    const guest = new CoopSession(guestGame);
    guest.role = 'guest'; guest.myPid = 2;
    guest._onMessage(1, { t: 'welcome', pid: 2, roster: [], frun: completedFront });
    guest._onMessage(1, { t: 'frun', run: claimedFront, rw: [['front:evil', 99999, 9999, 99]] });
    guest._onMessage(3, { t: 'frun', run: { ...front, generation: 999 } });
    guest._onMessage(1, { t: 'start', countryId: 'UKR', portal: true, fr: compact });
    const appliedBeforeBadStart = applied.length;
    guest.state = 'lobby'; guestGame.state = 'globe';
    guest._onMessage(1, { t: 'start', countryId: 'UKR', fr: { o: '<bad>' } });

    // Full level-state reconnect also carries frun and routes it through the
    // same main-owned apply hook.
    const reconnectApplied = [];
    const reconnectSession = {
      game: { _spawnSuperMirror() {} }, myPid: 2,
      applyFrontSnapshot: (run) => reconnectApplied.push(run),
      transport: { send() {} }, roster: new Map(),
    };
    const reconnectLevel = {
      player: {}, stats: {},
      zombies: { clearAllPuppets() {}, spawnPuppet() {} },
      effects: { clearNetItems() {}, spawnNetItem() {}, netBarrelGone() {} },
      world: { openBarn() {}, openCrate() {}, setTowerFixed() {} },
      gadgets: { netWall() {}, netTramp() {}, netTurret() {} },
      vehicles: { list: [] }, missions: null, superPickup: null,
    };
    const guestNet = new GuestNet(reconnectSession, reconnectLevel, {});
    guestNet._applyState({ t: 'state', zoms: [], items: [], world: { walls: [], tramps: [], turrets: [], scooters: [], barrelsGone: [] }, tm: 4, frun: wire });

    // Host captureState embeds the current canonical run for mid-join/reconnect.
    const hostLevel = {
      player: { pos: { x: 0, y: 0, z: 0 }, health: 100 }, stats: { time: 4 },
      zombies: { list: [] },
      effects: { coins: [], barrels: [], airdrop: null },
      world: { barnOpened: false, crateOpened: false, towerFixed: false },
      gadgets: { walls: [], tramps: [], turrets: [] }, vehicles: { list: [] },
      missions: null, megabox: null, superPickup: null,
    };
    const hostNet = new HostNet({ game: { input: { down: () => false } }, nick: 'Host', roster: new Map(), frontSnapshot: () => wire }, hostLevel);
    hostNet.spec = { fr: compact };
    const captured = hostNet.captureState();

    // The network path must also be reachable from the room UI. Only the host
    // sees the Front entry; guests wait for the canonical host start.
    const realGame = window.__game;
    realGame.save.liberated = { UKR: true, POL: true, FRA: true };
    realGame._ensureFront();
    const roomUi = realGame.coop;
    roomUi.session.state = 'lobby';
    roomUi.session.role = 'host';
    roomUi.session.myPid = 1;
    roomUi.session.room = 'TEST';
    roomUi.session.roster = new Map([[1, { nick: 'Host', skin: 'default', role: null }]]);
    roomUi._renderLobby();
    const hostFrontButton = !document.getElementById('btn-lobby-front').hidden;
    roomUi.session.role = 'guest';
    roomUi._renderLobby();
    const guestFrontButton = !document.getElementById('btn-lobby-front').hidden;

    const previousLevel = realGame.level;
    const previousVictory = realGame.victoryShown;
    const previousShowVictory = realGame._showVictory;
    let remoteVictoryAccepted = false;
    realGame.level = {
      operation: { stage: 2 }, bossDefeated: false,
      net: { authority: false },
      frontDirector: { phaseIndex: 0, plan: { phases: [{ id: 'quiet' }, { id: 'pressure' }, { id: 'spike' }, { id: 'reward' }] } },
    };
    realGame.victoryShown = false;
    realGame._showVictory = () => { remoteVictoryAccepted = realGame._frontCanComplete(realGame.level); };
    realGame.netVictory();
    const remoteCompleteFlag = realGame.level.frontRemoteComplete;

    let modeVictoryBroadcasts = 0;
    let modeStageFinished = false;
    const previousFinishFrontStage = realGame._finishFrontStage;
    realGame.level = {
      operation: { stage: 0 }, bossDefeated: false, frontObjectiveComplete: true,
      net: { authority: true }, netEv: (type) => { if (type === 'vict') modeVictoryBroadcasts++; },
      frontDirector: { phaseIndex: 1, plan: { phases: [{ id: 'quiet' }, { id: 'pressure' }, { id: 'spike' }, { id: 'reward' }] } },
      stats: { kills: 0 },
    };
    realGame.victoryShown = false;
    realGame._finishFrontStage = (won) => { modeStageFinished = won; };
    realGame._showFrontModeResult(realGame.level, true, '🛡️', 'Оборона', 'OK');
    realGame._hideOverlay('overlay-arena-end');

    realGame._showVictory = previousShowVictory;
    realGame._finishFrontStage = previousFinishFrontStage;
    realGame.level = previousLevel;
    realGame.victoryShown = previousVictory;

    return {
      proto: PROTO_VERSION, wire, compact, expanded, badVersion,
      broadcasts, started,
      forged: { netSawForged, added: broadcasts.length - beforeForged },
      applied, appliedBeforeBadStart, reconnectApplied, captured: captured.frun,
      guestPersonalFront: guestGame.save.front,
      hostFrontButton, guestFrontButton,
      remoteVictoryAccepted, remoteCompleteFlag, modeVictoryBroadcasts, modeStageFinished,
    };
  });

  check(out.proto === 16, 'protocol bumped to v16', String(out.proto));
  check(out.compact.g === 7 && out.compact.o === 'g7-UKR-evacuation' && out.compact.s === 1
    && out.compact.p === 'UKR' && out.compact.b.join(',') === 'dmg25,armor',
  'compact fr keeps generation/operation/stage/specialist/build', JSON.stringify(out.compact));
  check(out.expanded.operationId === out.compact.o && out.expanded.stage === 1, 'fr expands for startLevel operation adapter');
  check(out.wire.projects.workshop === 3 && out.wire.projects.radio === 0
    && out.wire.stats == null && out.wire.renderer == null && out.wire.restored.BAD_KEY == null,
  'frun clamps and strips local/runtime fields', JSON.stringify(out.wire));
  check(out.badVersion === null, 'unknown Front snapshot version fails closed');

  const starts = out.broadcasts.filter((m) => m.t === 'start');
  const runs = out.broadcasts.filter((m) => m.t === 'frun');
  check(starts.length === 1 && starts[0].fr && starts[0].fr.o === out.compact.o, 'host start sends compact fr');
  check(out.started && out.started.opts.operation.operationId === out.compact.o, 'host starts same canonical operation locally');
  check(runs.length >= 2 && runs.every((message) => message.rw == null),
    'host frun never sends reward amounts');
  check(out.forged.netSawForged === 0 && out.forged.added === 0, 'forged guest state/result/reward is rejected before level net');

  const rewards = out.applied.filter((x) => x.kind === 'reward');
  const guestStart = out.applied.find((x) => x.kind === 'start');
  check(rewards.length === 1 && rewards[0].rewards.length === 1
    && rewards[0].rewards[0].rewardId === 'front:123:g7-UKR-evacuation:operation'
    && rewards[0].rewards[0].coins === 300 && rewards[0].rewards[0].crystals === 3,
  'guest derives canonical reward locally and ignores wire amounts');
  check(out.guestPersonalFront.marker === 'guest-personal-front',
    'host snapshot never replaces guest personal Front progress');
  check(guestStart && guestStart.operation.generation === 7 && guestStart.operation.build.length === 2,
    'guest start restores generation/operation/stage/specialist/build', JSON.stringify(guestStart && guestStart.operation));
  check(out.applied.length === out.appliedBeforeBadStart, 'malformed Front start is rejected');
  check(out.reconnectApplied.length === 1 && out.reconnectApplied[0].generation === 7,
    'full reconnect state reapplies canonical frun');
  check(out.captured && out.captured.active.operationId === 'g7-UKR-evacuation',
    'host captureState includes canonical frun');
  check(out.hostFrontButton && !out.guestFrontButton,
    'room exposes Front entry to the host only');
  check(out.remoteCompleteFlag && out.remoteVictoryAccepted,
    'trusted host victory bypasses the guest-only Director clock');
  check(out.modeVictoryBroadcasts === 1 && out.modeStageFinished,
    'host Front defense/portal result broadcasts victory before finishing locally');

  const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_|favicon/i.test(e));
  check(realErrors.length === 0, 'no browser JS errors', realErrors.join(' | '));
} catch (e) {
  failed++;
  console.error('  ❌ coop-worldfront crashed:', e.stack || e.message);
} finally {
  await browser.close();
  if (closeServer) await closeServer();
}

if (failed) process.exit(1);
console.log('\n✅ coop-worldfront: all checks passed');
