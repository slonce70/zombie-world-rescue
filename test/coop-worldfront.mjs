// v500 World Front network contract: host-only state/results, compact starts,
// canonical reconnect snapshots and stable reward ids.
import { makeCheck, openCoopTest } from './_browser.mjs';

const RELAY_PORT = 8776;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, RELAY, A: page, B: guestPage, errors, closeTest } = await openCoopTest({
  relayPort: RELAY_PORT,
  launch: { args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] },
  context: { viewport: { width: 960, height: 720 } },
});
let failed = 0;
const check = makeCheck(() => failed++);

try {
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

  const out = await page.evaluate(async () => {
    const { PROTO_VERSION } = await import('/src/net/protocol.js');
    const sync = await import('/src/net/frontsync.js');
    const { CoopSession } = await import('/src/net/coop.js');
    const { HostNet } = await import('/src/net/host.js');
    const { GuestNet } = await import('/src/net/client.js');
    const { applyFrontEvent, frontCountryState } = await import('/src/worldfront.js');

    const front = {
      v: 1, seed: 123, generation: 7,
      board: [
        { id: 'g7-UKR-evacuation', country: 'UKR', template: 'evacuation', threat: 2, counterattack: true, status: 'active', junk: true },
        { id: 'g7-POL-hunt', country: 'POL', template: 'hunt', threat: 1, status: 'available' },
        { id: 'g7-DEU-siege', country: 'DEU', template: 'siege', threat: 3, status: 'available' },
      ],
      active: { operationId: 'g7-UKR-evacuation', stage: 1, specialist: 'UKR', build: ['dmg25', 'dmg25', 'armor'], status: 'ready', timer: 999 },
      projects: { medbay: 2, workshop: 99, radio: -4 }, activeProject: 'medbay', projectProgress: 2,
      restored: { UKR: 2, BAD_KEY: 9 }, claims: ['front:123:g7-UKR-evacuation:operation', 'front:123:g7-UKR-evacuation:operation', '<script>'],
      world: { day: '2026-07-22', countries: { UKR: { damage: 3, population: 42, junk: true }, BAD_KEY: { damage: 99 } } },
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
    host.mode = 'front';
    host.roster = new Map([
      [1, { pid: 1, nick: 'Host', ready: false }],
      [2, { pid: 2, nick: 'Guest', ready: false }],
    ]);
    host.transport.broadcast = (msg) => broadcasts.push(structuredClone(msg));
    let blockedTransitions = 0;
    hostGame._applyFrontTransition = (event) => {
      blockedTransitions++;
      hostGame.save.front = applyFrontEvent(hostGame.save.front, event).front;
    };
    const blockedStart = host.startFrontStage('UKR', { portal: true }, front.active);
    const blockedTransitionCount = blockedTransitions;
    host.setMyReady(true);
    host._hostSetGuestReady(2, true);
    const readyStart = host.startFrontStage('UKR', { portal: true }, front.active);
    host.syncFront(front, [{ type: 'grant', rewardId: 'front:123:g7-UKR-evacuation:operation', coins: 400, crystals: 3, eggs: 0 }, { type: 'toast', key: 'nope' }]);

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
    const claimedStates = [frontCountryState(completedFront, 'UKR').state, frontCountryState(claimedFront, 'UKR').state];
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
    guest._onMessage(1, broadcasts.find((message) => message.t === 'start'));
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
      // v770: гість щоснапшоту кличе netSquad (напарників Загону веде хост) — макет
      // мусить нести той самий набір мережевих методів, що й справжні Gadgets
      gadgets: { netWall() {}, netTramp() {}, netTurret() {}, netSquad() {} },
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
      // v770: captureState несе гостю напарників Загону (squadNet) — у макеті порожній список
      gadgets: { walls: [], tramps: [], turrets: [], squadNet: () => [] }, vehicles: { list: [] },
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

    let frontEntryOpened = false;
    const previousOpenCoop = roomUi._openCoop;
    roomUi._openCoop = () => { frontEntryOpened = true; };
    roomUi.openForFront();
    const openForFrontQueued = frontEntryOpened && roomUi.frontEntry === true;
    roomUi._openCoop = previousOpenCoop;

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

    // Explicit solo launch stays local even while this browser owns a lobby.
    const soloFront = realGame.save.front;
    const soloOperation = soloFront.board.find((entry) => entry.status === 'available');
    soloFront.active = null;
    soloFront.board.forEach((entry) => { entry.status = 'available'; });
    roomUi.session.role = 'host';
    roomUi.session.state = 'lobby';
    roomUi.session.frontRun = structuredClone(soloFront);
    const lobbyBeforeSolo = JSON.stringify(roomUi.session.frontRun);
    let soloLocalStarts = 0;
    let soloLobbyStarts = 0;
    const previousStartLevel = realGame.startLevel;
    const previousStartFrontStage = roomUi.session.startFrontStage;
    realGame.startLevel = () => { soloLocalStarts++; return true; };
    roomUi.session.startFrontStage = () => { soloLobbyStarts++; return true; };
    realGame.startFrontOperation(soloOperation.id, 'dispatcher', 'solo');
    const soloLobbyUnchanged = JSON.stringify(roomUi.session.frontRun) === lobbyBeforeSolo;
    realGame.startLevel = previousStartLevel;
    roomUi.session.startFrontStage = previousStartFrontStage;

    realGame._showVictory = previousShowVictory;
    realGame._finishFrontStage = previousFinishFrontStage;
    realGame.level = previousLevel;
    realGame.victoryShown = previousVictory;

    return {
      proto: PROTO_VERSION, wire, compact, expanded, badVersion,
      broadcasts, started, blockedStart, blockedTransitionCount, blockedTransitions, readyStart,
      forged: { netSawForged, added: broadcasts.length - beforeForged },
      applied, appliedBeforeBadStart, reconnectApplied, captured: captured.frun,
      guestPersonalFront: guestGame.save.front,
      claimedStates, claimedWorld: claimedFront.world.countries.UKR,
      hostFrontButton, guestFrontButton, openForFrontQueued,
      remoteVictoryAccepted, remoteCompleteFlag, modeVictoryBroadcasts, modeStageFinished,
      soloLocalStarts, soloLobbyStarts, soloLobbyUnchanged,
    };
  });

  // Номер протоколу тут НЕ пінимо: він бампається щоразу, коли міняється формат
  // кооп-повідомлень, і жорстка цифра робить цей тест червоним у кожного такого
  // релізу без жодного звʼязку з Фронтом. Сенс перевірки — що спека Фронту їде
  // разом із живим протоколом, а не з якоюсь своєю копією.
  check(Number.isInteger(out.proto) && out.proto >= 24,
    'co-op protocol is a live integer, Front spec rides along', String(out.proto));
  check(out.compact.g === 7 && out.compact.o === 'g7-UKR-evacuation' && out.compact.s === 1
    && out.compact.p === 'UKR' && out.compact.b.join(',') === 'dmg25,armor',
  'compact fr keeps generation/operation/stage/specialist/build', JSON.stringify(out.compact));
  check(out.expanded.operationId === out.compact.o && out.expanded.stage === 1, 'fr expands for startLevel operation adapter');
  check(out.wire.projects.workshop === 3 && out.wire.projects.radio === 0
    && out.wire.stats == null && out.wire.renderer == null && out.wire.restored.BAD_KEY == null
    && out.wire.board[0].counterattack === true && out.wire.world.day === '2026-07-22'
    && out.wire.world.countries.UKR.damage === 3 && out.wire.world.countries.UKR.population === 42
    && out.wire.world.countries.BAD_KEY == null,
  'frun clamps and strips local/runtime fields', JSON.stringify(out.wire));
  check(out.badVersion === null, 'unknown Front snapshot version fails closed');

  const starts = out.broadcasts.filter((m) => m.t === 'start');
  const runs = out.broadcasts.filter((m) => m.t === 'frun');
  check(out.blockedStart === false && out.blockedTransitionCount === 0 && out.blockedTransitions === 1
    && out.readyStart === true && starts.length === 1,
    'host waits until every current roster entry is ready');
  check(starts[0].fr && starts[0].fr.o === out.compact.o, 'host start sends compact fr');
  check(out.started && out.started.opts.operation.operationId === out.compact.o, 'host starts same canonical operation locally');
  check(JSON.stringify(out.started.opts.coop.spec.fr) === JSON.stringify(out.applied.find((x) => x.kind === 'start')?.spec.fr),
    'host and guest receive the same compact fr start spec');
  check(runs.length >= 1 && runs.every((message) => message.rw == null),
    'host frun never sends reward amounts');
  check(out.forged.netSawForged === 0 && out.forged.added === 0, 'forged guest state/result/reward is rejected before level net');

  const rewards = out.applied.filter((x) => x.kind === 'reward');
  const guestStart = out.applied.find((x) => x.kind === 'start');
  check(rewards.length === 1 && rewards[0].rewards.length === 1
    && rewards[0].rewards[0].rewardId === 'front:123:g7-UKR-evacuation:r2:operation'
    && rewards[0].rewards[0].coins === 400 && rewards[0].rewards[0].crystals === 3,
  'guest derives canonical reward locally and ignores wire amounts', JSON.stringify(rewards));
  check(out.guestPersonalFront.marker === 'guest-personal-front',
    'host snapshot never replaces guest personal Front progress');
  check(out.claimedStates.join(',') === 'destroyed,rebuilding'
    && out.claimedWorld.damage === 2 && out.claimedWorld.population === 54,
  'counterattack claim preserves destroyed-to-rebuilding world consequences', JSON.stringify(out.claimedWorld));
  check(guestStart && guestStart.operation.generation === 7 && guestStart.operation.build.length === 2,
    'guest start restores generation/operation/stage/specialist/build', JSON.stringify(guestStart && guestStart.operation));
  check(out.applied.length === out.appliedBeforeBadStart, 'malformed Front start is rejected');
  check(out.reconnectApplied.length === 1 && out.reconnectApplied[0].generation === 7,
    'full reconnect state reapplies canonical frun');
  check(out.captured && out.captured.active.operationId === 'g7-UKR-evacuation',
    'host captureState includes canonical frun');
  check(out.hostFrontButton && !out.guestFrontButton,
    'room exposes Front entry to the host only');
  check(out.openForFrontQueued, 'prepared Front opens the co-op entry flow');
  check(out.remoteCompleteFlag && out.remoteVictoryAccepted,
    'trusted host victory bypasses the guest-only Director clock');
  check(out.modeVictoryBroadcasts === 0 && out.modeStageFinished,
    'Front result uses the canonical snapshot path without a duplicate victory event');
  check(out.soloLocalStarts === 1 && out.soloLobbyStarts === 0 && out.soloLobbyUnchanged,
    'explicit Play Solo stays local and does not start or mutate the lobby');

  // Real room path: an already prepared host Front becomes authoritative for
  // an ordinary room, survives a guest disconnect + checkpoint, and resumes
  // the same pid directly into the current phase without touching personal Front.
  await page.goto(`${BASE}/?test&fresh&relay=${encodeURIComponent(RELAY)}`);
  await guestPage.goto(`${BASE}/?test&fresh&lang=en&relay=${encodeURIComponent(RELAY)}`);
  await Promise.all([
    page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW }),
    guestPage.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW }),
  ]);
  const prepared = await page.evaluate(() => {
    const game = window.__game;
    game.save.liberated = { UKR: true, POL: true, FRA: true };
    game._ensureFront();
    const operation = game.save.front.board[0];
    game._applyFrontTransition({ type: 'START_OPERATION', operationId: operation.id, specialist: 'dispatcher' });
    return { operationId: operation.id, country: operation.country };
  });
  const room = await page.evaluate(() => window.__game.test.coopCreate('Host'));
  const guestPersonalBefore = await guestPage.evaluate(() => {
    const game = window.__game;
    game.save.liberated = { UKR: true, POL: true, FRA: true };
    game._ensureFront();
    game.save.front.marker = 'guest-personal-front';
    return JSON.stringify(game.save.front);
  });
  await guestPage.evaluate((code) => window.__game.test.coopJoin(code, 'Guest'), room);
  await Promise.all([
    page.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW }),
    guestPage.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW }),
  ]);
  await guestPage.evaluate(() => {
    const session = window.__game.coop.session;
    const render = session.onCfg;
    session.onCfg = (...args) => {
      render(...args);
      window.__frontCfgProbe = {
        snapshot: session.frontSnapshot(),
        hidden: document.getElementById('lobby-front-summary').hidden,
        text: document.getElementById('lobby-front-summary').textContent,
      };
    };
  });
  await page.evaluate(({ operationId }) => window.__game.prepareFrontTogether(operationId, 'dispatcher'), prepared);
  await guestPage.waitForFunction(() => window.__game.coop.session.mode === 'front'
    && window.__game.coop.session.frontRun?.active
    && !document.getElementById('lobby-front-summary').hidden, null, { timeout: 20000 * SLOW });
  const authoritativeLobby = await guestPage.evaluate(async () => {
    const { frontStageConfig } = await import('/src/worldfront.js');
    const { frontStageLabel } = await import('/src/ui/frontui.js');
    const { t } = await import('/src/i18n.js');
    const session = window.__game.coop.session;
    const config = frontStageConfig(session.frontRun);
    const rawObjective = frontStageLabel(config.missionPreset);
    return {
      cfgProbe: window.__frontCfgProbe,
      text: document.getElementById('lobby-front-summary').textContent,
      operationId: session.frontRun.active.operationId,
      expectedObjective: t(rawObjective),
      rawObjective,
    };
  });
  check(authoritativeLobby.cfgProbe?.snapshot === null && authoritativeLobby.cfgProbe.hidden,
    'cfg never renders guest personal Front as the host world', JSON.stringify(authoritativeLobby.cfgProbe));
  check(authoritativeLobby.operationId === prepared.operationId && authoritativeLobby.text.includes('Host'),
    'frun rerenders the lobby with the authoritative host operation', authoritativeLobby.text);
  check(authoritativeLobby.expectedObjective !== authoritativeLobby.rawObjective
    && authoritativeLobby.text.includes(authoritativeLobby.expectedObjective),
  'co-op objective label is translated like FrontUI', JSON.stringify(authoritativeLobby));

  await page.evaluate(() => window.__game.coop.session.setMyReady(true));
  await guestPage.evaluate(() => window.__game.coop.session.setMyReady(true));
  await page.waitForFunction(() => [...window.__game.coop.session.roster.values()].every((entry) => entry.ready), null, { timeout: 15000 * SLOW });
  const guestPid = await guestPage.evaluate(() => window.__game.coop.session.myPid);
  await page.evaluate(() => document.getElementById('btn-lobby-start').click());
  await Promise.all([
    page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net && window.__game.level?.operation?.stage === 0, null, { timeout: 50000 * SLOW }),
    guestPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net && window.__game.level?.operation?.stage === 0, null, { timeout: 50000 * SLOW }),
  ]);
  const campaignDowned = await guestPage.evaluate(() => {
    const game = window.__game;
    game.level.player.health = 0;
    game._onPlayerDied();
    return {
      deathT: game.deathT,
      death: document.getElementById('overlay-death').classList.contains('show'),
      result: document.getElementById('overlay-front-result').classList.contains('show'),
      active: game.coop.session.frontRun.active.status,
      defense: !!game.level.defense,
      portal: !!game.level.portal,
    };
  });
  check(campaignDowned.deathT > 0 && campaignDowned.death && !campaignDowned.result
    && campaignDowned.active === 'active' && !campaignDowned.defense && !campaignDowned.portal,
  'guest death in a campaign Front stage stays downed without a terminal result', JSON.stringify(campaignDowned));
  await page.evaluate((pid) => window.__game.level.net.sendRevive(pid), guestPid);
  // ⏱️ Єдині два очікування у файлі без власного бюджету — на одному з них CI і
  // падав (`Timeout 30000ms exceeded`). Підняття прилітає повідомленням (миттєво),
  // але побачити його можна лише в опитуванні, а waitForFunction за замовчуванням
  // опитує по requestAnimationFrame: на runner з двома браузерами і софтверним
  // рендером кадр іде секундами, тож 30 с — це одиниці спроб. Опитуємо таймером
  // (як `waitForPage` у `_browser.mjs`) і даємо бюджет, як у сусідів файлу.
  await guestPage.waitForFunction(() => window.__game.deathT < 0 && window.__game.level.player.health > 0
    && !document.getElementById('overlay-death').classList.contains('show'), null, { polling: 200, timeout: 60000 * SLOW });
  check(await guestPage.evaluate(() => !document.getElementById('overlay-front-result').classList.contains('show')),
    'campaign Front guest revive returns to the same active stage');
  await guestPage.evaluate(() => {
    const session = window.__game.coop.session;
    window.__resumeFront = session._tryReconnect.bind(session);
    session._tryReconnect = async () => { window.__frontResumePending = true; };
    session.transport.ws.close();
  });
  await page.waitForFunction(() => window.__game.coop.session.roster.size === 1, null, { timeout: 15000 * SLOW });
  const dropped = await page.evaluate(() => ({
    size: window.__game.coop.session.roster.size,
    started: window.__game.coop.session.frontStartedOperationId,
  }));
  check(dropped.size === 1 && dropped.started === prepared.operationId,
    'peer loss leaves the host operation active and removes the guest quorum', JSON.stringify(dropped));
  const checkpoint = await page.evaluate(() => {
    const game = window.__game;
    game._applyFrontTransition({ type: 'COMPLETE_STAGE', build: [] });
    const stage = game.save.front.active.stage;
    game._frontNextAction = 'continue';
    game.endLevel();
    return stage;
  });
  await page.waitForFunction((stage) => window.__game.state === 'level' && window.__game.level?.net
    && window.__game.level?.operation?.stage === stage, checkpoint, { timeout: 50000 * SLOW });
  check(checkpoint === 1, 'host continues to the next Front checkpoint without a new ready gate', String(checkpoint));
  await guestPage.evaluate(() => window.__resumeFront());
  await Promise.all([
    page.waitForFunction((pid) => window.__game.coop.session.roster.get(pid)?.ready === true, guestPid, { timeout: 30000 * SLOW }),
    guestPage.waitForFunction((stage) => window.__game.coop.session.transport.connected
      && window.__game.coop.session.frontRun?.active?.stage === stage
      && window.__game.level?.operation?.stage === stage
      && window.__game.level?.net?.spec?.fr?.s === stage, checkpoint, { timeout: 50000 * SLOW }),
  ]);
  const resumed = await guestPage.evaluate((before) => ({
    pid: window.__game.coop.session.myPid,
    ready: window.__game.coop.session.roster.get(window.__game.coop.session.myPid)?.ready,
    frontStage: window.__game.coop.session.frontRun.active.stage,
    levelStage: window.__game.level.operation.stage,
    specStage: window.__game.level.net.spec.fr.s,
    personalUnchanged: JSON.stringify(window.__game.save.front) === before,
    personalMarker: window.__game.save.front.marker,
  }), guestPersonalBefore);
  check(resumed.pid === guestPid && resumed.ready === true,
    'same-pid Front resume restores guest readiness', JSON.stringify(resumed));
  check(resumed.frontStage === checkpoint && resumed.levelStage === checkpoint && resumed.specStage === checkpoint,
    'same-pid resume restores authoritative frun and current fr checkpoint', JSON.stringify(resumed));
  check(resumed.personalUnchanged && resumed.personalMarker === 'guest-personal-front',
    'real-room reconnect never overwrites guest personal Front', JSON.stringify(resumed));

  const defenseDowned = await guestPage.evaluate(() => {
    const game = window.__game;
    game.level.player.health = 0;
    game._onPlayerDied();
    return {
      deathT: game.deathT,
      death: document.getElementById('overlay-death').classList.contains('show'),
      result: document.getElementById('overlay-front-result').classList.contains('show'),
      active: game.coop.session.frontRun.active.status,
      defense: !!game.level.defense,
      portal: !!game.level.portal,
    };
  });
  check(defenseDowned.deathT > 0 && defenseDowned.death && !defenseDowned.result
    && defenseDowned.active === 'active' && (defenseDowned.defense || defenseDowned.portal),
  'guest death in a defense/portal Front stage stays downed without a terminal result', JSON.stringify(defenseDowned));
  await page.evaluate((pid) => window.__game.level.net.sendRevive(pid), guestPid);
  // ⏱️ Єдині два очікування у файлі без власного бюджету — на одному з них CI і
  // падав (`Timeout 30000ms exceeded`). Підняття прилітає повідомленням (миттєво),
  // але побачити його можна лише в опитуванні, а waitForFunction за замовчуванням
  // опитує по requestAnimationFrame: на runner з двома браузерами і софтверним
  // рендером кадр іде секундами, тож 30 с — це одиниці спроб. Опитуємо таймером
  // (як `waitForPage` у `_browser.mjs`) і даємо бюджет, як у сусідів файлу.
  await guestPage.waitForFunction(() => window.__game.deathT < 0 && window.__game.level.player.health > 0
    && !document.getElementById('overlay-death').classList.contains('show'), null, { polling: 200, timeout: 60000 * SLOW });
  check(await guestPage.evaluate(() => !document.getElementById('overlay-front-result').classList.contains('show')),
    'defense/portal Front guest revive returns to the same active stage');

  // Host alone reduces terminal outcomes; both browsers receive one canonical
  // result. The guest can only acknowledge it and wait for the host's choice.
  await page.evaluate(() => window.__game._finishFrontStage(false));
  await Promise.all([
    page.waitForSelector('#overlay-front-result.show[data-kind="failed"]', { timeout: 60000 * SLOW }),
    guestPage.waitForSelector('#overlay-front-result.show[data-kind="failed"]', { timeout: 60000 * SLOW }),
  ]);
  const guestFailure = await guestPage.evaluate(() => ({
    action: document.getElementById('btn-front-result-primary').dataset.action,
    endHidden: document.getElementById('btn-front-result-end').hidden,
    waiting: document.getElementById('front-result-summary').textContent,
    actionLabel: document.getElementById('btn-front-result-primary').textContent,
    resultIds: [...window.__game.coop.session.frontResults],
  }));
  check(guestFailure.action === 'wait' && guestFailure.endHidden && /host/i.test(guestFailure.waiting)
    && /wait/i.test(guestFailure.actionLabel),
    'guest failure result is read-only and waits for the host', JSON.stringify(guestFailure));
  await guestPage.click('#btn-front-result-primary');
  await page.click('#btn-front-result-primary');
  await Promise.all([
    page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.operation?.stage === 1, null, { timeout: 50000 * SLOW }),
    guestPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.operation?.stage === 1, null, { timeout: 50000 * SLOW }),
  ]);

  await page.evaluate(() => window.__game._finishFrontStage(false));
  await Promise.all([
    page.waitForSelector('#overlay-front-result.show[data-kind="failed"]', { timeout: 60000 * SLOW }),
    guestPage.waitForSelector('#overlay-front-result.show[data-kind="failed"]', { timeout: 60000 * SLOW }),
  ]);
  const retriedFailureIds = await guestPage.evaluate(() => [...window.__game.coop.session.frontResults]);
  check(retriedFailureIds.length === guestFailure.resultIds.length + 1
    && retriedFailureIds.at(-1) !== guestFailure.resultIds.at(-1),
  'fail → retry → fail produces a second canonical guest result', JSON.stringify(retriedFailureIds));
  await guestPage.click('#btn-front-result-primary');
  await page.click('#btn-front-result-primary');
  await Promise.all([
    page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.operation?.stage === 1, null, { timeout: 50000 * SLOW }),
    guestPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.operation?.stage === 1, null, { timeout: 50000 * SLOW }),
  ]);

  await page.evaluate(() => window.__game._finishFrontStage(true));
  await Promise.all([
    page.waitForSelector('#overlay-front-result.show[data-kind="checkpoint"]', { timeout: 60000 * SLOW }),
    guestPage.waitForSelector('#overlay-front-result.show[data-kind="checkpoint"]', { timeout: 60000 * SLOW }),
  ]);
  await guestPage.click('#btn-front-result-primary');
  await page.click('#btn-front-result-primary');
  await Promise.all([
    page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.operation?.stage === 2, null, { timeout: 50000 * SLOW }),
    guestPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.operation?.stage === 2, null, { timeout: 50000 * SLOW }),
  ]);

  await page.evaluate(() => window.__game._finishFrontStage(true));
  await Promise.all([
    page.waitForSelector('#overlay-front-result.show[data-kind="complete"]', { timeout: 60000 * SLOW }),
    guestPage.waitForSelector('#overlay-front-result.show[data-kind="complete"]', { timeout: 60000 * SLOW }),
  ]);
  const terminal = await Promise.all([
    page.evaluate(() => ({ run: window.__game.coop.session.frontSnapshot(), kind: document.getElementById('overlay-front-result').dataset.kind })),
    guestPage.evaluate((before) => ({
      run: window.__game.coop.session.frontSnapshot(),
      kind: document.getElementById('overlay-front-result').dataset.kind,
      personalUnchanged: JSON.stringify(window.__game.save.front) === before,
      rewardClaims: window.__game.save.frontCoopClaims || [],
    }), guestPersonalBefore),
  ]);
  check(terminal[0].kind === 'complete' && terminal[1].kind === 'complete'
    && JSON.stringify(terminal[0].run) === JSON.stringify(terminal[1].run),
  'host and guest show the same terminal victory from one canonical snapshot', JSON.stringify(terminal));
  const terminalCountry = terminal[0].run.world.countries[prepared.country];
  check(terminalCountry && terminalCountry.population > 0
    && terminal[0].run.restored[prepared.country] === 1,
  'terminal snapshot keeps country population, damage and rebuilding progress', JSON.stringify(terminalCountry));
  check(terminal[1].personalUnchanged && terminal[1].rewardClaims.length === 1,
    'guest earns the canonical claim without replacing personal Front', JSON.stringify(terminal[1]));
  await guestPage.click('#btn-front-result-primary');
  await page.click('#btn-front-result-primary');
  await guestPage.waitForSelector('#overlay-net-wait.show', { timeout: 60000 * SLOW });

  const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_|favicon/i.test(e));
  check(realErrors.length === 0, 'no browser JS errors', realErrors.join(' | '));
} catch (e) {
  failed++;
  console.error('  ❌ coop-worldfront crashed:', e.stack || e.message);
} finally {
  await closeTest();
}

if (failed) process.exit(1);
console.log('\n✅ coop-worldfront: all checks passed');
