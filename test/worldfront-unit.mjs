import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventsSource = readFileSync(new URL('../src/worldevents.js', import.meta.url), 'utf8');
const eventsUrl = 'data:text/javascript;base64,' + Buffer.from(eventsSource).toString('base64');
const runbuildSource = readFileSync(new URL('../src/runbuild.js', import.meta.url), 'utf8');
const runbuildUrl = 'data:text/javascript;base64,' + Buffer.from(runbuildSource).toString('base64');
const source = readFileSync(new URL('../src/worldfront.js', import.meta.url), 'utf8')
  .replace("'./worldevents.js'", JSON.stringify(eventsUrl))
  .replace("'./runbuild.js'", JSON.stringify(runbuildUrl));
const domain = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const {
  FRONT_TEMPLATES,
  FRONT_VERSION,
  applyFrontEvent,
  createFront,
  frontCountryState,
  frontStageConfig,
  frontViewModel,
  sanitizeFront,
} = domain;

const reduce = (front, event) => applyFrontEvent(front, event);

function winAndClaim(front, operationId, specialist = 'dispatcher') {
  let result = reduce(front, { type: 'START_OPERATION', operationId, specialist });
  front = result.front;
  for (let stage = 0; stage < 3; stage++) {
    front = reduce(front, { type: 'START_STAGE' }).front;
    result = reduce(front, { type: 'COMPLETE_STAGE', build: [['dmg25', 'spd12', 'armor'][stage]] });
    front = result.front;
  }
  result = reduce(front, { type: 'CLAIM_OPERATION' });
  return result;
}

function saveCountry(front, country) {
  const effects = [];
  while ((front.restored[country] || 0) < 3
    || front.world.countries[country].damage > 0
    || front.board.some((row) => row.country === country && row.status !== 'claimed')) {
    const operation = front.board.find((row) => row.country === country && row.status === 'available');
    assert.ok(operation, `available recovery operation for ${country}`);
    const expectedCoins = 200 + operation.threat * 50 + (operation.counterattack ? 100 : 0);
    const expectedCrystals = 1 + operation.threat;
    const result = winAndClaim(front, operation.id);
    const grant = result.effects.find((effect) => effect.type === 'grant' && effect.rewardId.endsWith(':operation'));
    assert.equal(grant.coins, expectedCoins);
    assert.equal(grant.crystals, expectedCrystals);
    front = result.front;
    effects.push(...result.effects);
  }
  return { front, effects };
}

test('unlock creates deterministic guided and full boards', () => {
  assert.equal(createFront({ seed: 500, liberated: [] }), null);
  const guided = createFront({ seed: 500, liberated: { UKR: true, POL: true } });
  assert.equal(guided.v, FRONT_VERSION);
  assert.equal(guided.board.length, 1);
  assert.equal(guided.board[0].country, 'UKR');
  assert.equal(guided.board[0].template, 'evacuation');
  assert.deepEqual(guided, createFront({ seed: 500, liberated: ['UKR', 'POL'] }));

  const full = createFront({ seed: 501, liberated: ['UKR', 'POL', 'DEU', 'FRA'] });
  assert.equal(full.board.length, 3);
  assert.equal(new Set(full.board.map((operation) => operation.country)).size, 3);
  assert.ok(full.board.every((operation) => FRONT_TEMPLATES[operation.template] && operation.threat >= 1 && operation.threat <= 3));
  assert.deepEqual(full, createFront({ seed: 501, liberated: ['UKR', 'POL', 'DEU', 'FRA'] }));
});

test('sanitizer clamps and whitelists persisted state without trusting unknown version', () => {
  const front = createFront({ seed: 502, liberated: ['UKR'] });
  front.v = 999;
  assert.equal(sanitizeFront(front), null);

  const dirty = createFront({ seed: 503, liberated: ['UKR', 'POL', 'DEU'] });
  dirty.projects = { medbay: 99, workshop: -2, radio: '2', forged: 3 };
  dirty.projectProgress = 99;
  dirty.restored = { UKR: 9, __proto__: 3, LOST: 3 };
  dirty.claims = [42, 'ok', 'ok', ...Array.from({ length: 200 }, (_, index) => `c${index}`)];
  dirty.board[0].threat = 999;
  dirty.board[0].status = 'forged';
  dirty.active = {
    operationId: dirty.board[0].id,
    stage: 99,
    specialist: 'UKR',
    build: ['dmg25', 'nades2', 'dmgnade', 'dmg40', 'nades4', 'dmg60', 'boombag',
      'nades6', 'dmgvamp', 'spd12', 'spdheal', 'spd18', 'forged', 7],
    status: 'active',
    renderer: { forged: true },
  };
  const clean = sanitizeFront(dirty, { rescuedFriends: [] });
  assert.deepEqual(clean.projects, { medbay: 3, workshop: 0, radio: 2 });
  assert.equal(clean.projectProgress, 2);
  assert.deepEqual(clean.restored, { UKR: 3 });
  assert.equal(clean.claims.length, 128);
  assert.equal(clean.board[0].threat, 3);
  assert.equal(clean.board[0].status, 'active');
  assert.equal(clean.active.stage, 2);
  assert.equal(clean.active.specialist, 'dispatcher');
  assert.equal(clean.active.build.length, 12);
  assert.equal('renderer' in clean.active, false);
  assert.equal('forged' in clean.projects, false);
});

test('reducer supports retry, abandon, resume and visible deterministic stage config', () => {
  let front = createFront({ seed: 504, liberated: ['UKR'], rescuedFriends: ['UKR'] });
  const operationId = front.board[0].id;
  let result = reduce(front, { type: 'START_OPERATION', operationId, specialist: 'UKR', rescuedFriends: ['UKR'] });
  front = result.front;
  assert.equal(front.active.specialist, 'UKR');
  assert.equal(front.active.status, 'ready');
  const config = frontStageConfig(front);
  assert.equal(config.operation.operationId, operationId);
  assert.deepEqual(config.encounterPlan.phases.map((phase) => phase.id), ['quiet', 'pressure', 'spike', 'reward']);
  assert.deepEqual(config, frontStageConfig(JSON.parse(JSON.stringify(front))));

  front = reduce(front, { type: 'START_STAGE' }).front;
  front = reduce(front, { type: 'FAIL_STAGE' }).front;
  assert.equal(front.active.status, 'ready');
  front = reduce(front, { type: 'ABANDON_OPERATION' }).front;
  assert.equal(front.active, null);
  assert.equal(front.board[0].status, 'available');
});

test('evacuation becomes a country-specific rebirth operation', () => {
  const cases = [
    ['UKR', 'rebuild-center'],
    ['POL', 'rescue-train'],
    ['TUR', 'rescue-ship'],
  ];
  for (const [country, firstStage] of cases) {
    let front = createFront({ seed: 900, liberated: [country] });
    front = reduce(front, { type: 'START_OPERATION', operationId: front.board[0].id }).front;
    assert.equal(frontStageConfig(front).missionPreset, firstStage);
    front = reduce(reduce(front, { type: 'START_STAGE' }).front, { type: 'COMPLETE_STAGE' }).front;
    const night = frontStageConfig(front);
    assert.equal(night.missionPreset, 'night-evacuation');
    assert.deepEqual(night.modeOpts, { defense: 'zone' });
    front.projects.radio = 2;
    assert.deepEqual(frontViewModel(front).board[0].stages, [firstStage, 'night-evacuation', 'commander-pursuer']);
  }
});

const CAMPAIGN_COUNTRIES = ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN'];

// Дошка операцій обіцяє чотири різні операції — стільки ж різних ланцюжків має і грати.
function stagesFor(country, template) {
  const front = createFront({ seed: 920, liberated: [country] });
  front.board[0].template = template;
  return frontViewModel(front).board[0].stages;
}

test('every country plays four different stage chains for the four templates', () => {
  const templates = Object.keys(FRONT_TEMPLATES);
  assert.equal(templates.length, 4);
  for (const country of CAMPAIGN_COUNTRIES) {
    const chains = templates.map((template) => stagesFor(country, template));
    assert.ok(chains.every((stages) => stages.length === 3), `${country}: three stages per operation`);
    const unique = new Set(chains.map((stages) => stages.join('>')));
    assert.equal(unique.size, 4, `${country}: four templates give four different chains`);
  }
});

test('country story chains ride the hunt template and stay reachable on the board', () => {
  assert.deepEqual(stagesFor('POL', 'hunt'), ['pol-light-bonfires', 'pol-rescue-train', 'pol-defeat-pursuer']);
  assert.deepEqual(stagesFor('DEU', 'hunt'), ['deu-rescue-mechanics', 'deu-start-convoy', 'deu-defeat-baron']);
  // сюжет не з'їдає інші шаблони: облога Польщі лишається типовою облогою
  assert.deepEqual(stagesFor('POL', 'siege'), FRONT_TEMPLATES.siege.stages);
  assert.deepEqual(stagesFor('DEU', 'outbreak'), FRONT_TEMPLATES.outbreak.stages);

  // ланцюжок країни справді випадає на згенерованій дошці, а не лише в тесті
  const reachable = new Set();
  for (let seed = 0; seed < 200; seed++) {
    for (const operation of createFront({ seed, liberated: CAMPAIGN_COUNTRIES }).board) {
      if (operation.template === 'hunt' && ['POL', 'DEU'].includes(operation.country)) reachable.add(operation.country);
    }
  }
  assert.deepEqual([...reachable].sort(), ['DEU', 'POL']);
});

test('a Polish hunt plays its story stages from the first to the last', () => {
  let front = createFront({ seed: 921, liberated: ['POL'] });
  front.board[0].template = 'hunt';
  front = sanitizeFront(front);
  front = reduce(front, { type: 'START_OPERATION', operationId: front.board[0].id }).front;
  const presets = [];
  for (let stage = 0; stage < 3; stage++) {
    presets.push(frontStageConfig(front).missionPreset);
    if (stage < 2) {
      front = reduce(front, { type: 'START_STAGE' }).front;
      front = reduce(front, { type: 'COMPLETE_STAGE', build: [] }).front;
    }
  }
  assert.deepEqual(presets, ['pol-light-bonfires', 'pol-rescue-train', 'pol-defeat-pursuer']);
});

test('destroyed Spain gets its dedicated recovery stages without changing normal Spain', () => {
  let front = createFront({ seed: 901, liberated: ['ESP'] });
  const normalStages = frontViewModel(front).board[0].stages;
  assert.deepEqual(normalStages, FRONT_TEMPLATES[front.board[0].template].stages);

  front.world.countries.ESP.damage = 3;
  front = reduce(front, { type: 'START_OPERATION', operationId: front.board[0].id }).front;
  const presets = [];
  for (let stage = 0; stage < 3; stage++) {
    presets.push(frontStageConfig(front).missionPreset);
    if (stage < 2) {
      front = reduce(front, { type: 'START_STAGE' }).front;
      front = reduce(front, { type: 'COMPLETE_STAGE', build: [] }).front;
    }
  }
  assert.deepEqual(presets, [
    'spain-rebuild-center',
    'spain-clear-village',
    'spain-defend-fireworks',
  ]);
});

test('operation and cycle rewards are canonical, stable and idempotent', () => {
  let front = createFront({ seed: 505, liberated: ['UKR', 'POL', 'DEU'] });
  const countries = [...new Set(front.board.map((row) => row.country))];
  const allEffects = [];
  for (const country of countries) {
    const result = saveCountry(front, country);
    front = result.front;
    allEffects.push(...result.effects);
  }
  const operationGrants = allEffects.filter((effect) => effect.type === 'grant' && effect.rewardId.endsWith(':operation'));
  assert.equal(operationGrants.length, 9);
  assert.equal(allEffects.filter((effect) => effect.key === 'front.cycleComplete').length, 1);
  assert.equal(front.projects.medbay, 3);
  assert.equal(front.projectProgress, 0);
  assert.equal(front.active, null);
  assert.equal(front.board.every((operation) => operation.status === 'claimed'), true);

  const duplicate = reduce(front, { type: 'CLAIM_OPERATION' });
  assert.deepEqual(duplicate.effects, []);
  assert.deepEqual(duplicate.front, front);

  const advanced = reduce(front, { type: 'ADVANCE_GENERATION', liberated: ['UKR', 'POL', 'DEU', 'FRA'] }).front;
  assert.equal(advanced.generation, 1);
  assert.equal(advanced.board.length, 3);
  assert.equal(new Set(advanced.board.map((operation) => operation.country)).size, 3);
});

test('one terminal victory event claims and rewards exactly once', () => {
  let front = createFront({ seed: 515, liberated: ['UKR'] });
  front = reduce(front, { type: 'START_OPERATION', operationId: front.board[0].id }).front;
  for (let stage = 0; stage < 2; stage++) {
    front = reduce(front, { type: 'START_STAGE' }).front;
    front = reduce(front, { type: 'COMPLETE_STAGE', build: [] }).front;
  }
  front = reduce(front, { type: 'START_STAGE' }).front;
  const terminal = reduce(front, { type: 'COMPLETE_OPERATION', build: ['armor'] });
  assert.equal(terminal.front.active, null);
  assert.equal(terminal.front.restored.UKR, 1);
  assert.equal(terminal.effects.filter((effect) => effect.type === 'grant').length, 1);
  const duplicate = reduce(terminal.front, { type: 'COMPLETE_OPERATION', build: ['armor'] });
  assert.deepEqual(duplicate.front, terminal.front);
  assert.deepEqual(duplicate.effects, []);
});

test('view model exposes recommendation, specialists, projects and country consequences', () => {
  let front = createFront({ seed: 506, liberated: ['UKR', 'POL', 'DEU'] });
  front.projects.radio = 3;
  let view = frontViewModel(front, { friends: { UKR: true, DEU: true } });
  assert.equal(view.board.filter((operation) => operation.recommended).length, 1);
  assert.ok(view.board.every((operation) => operation.commander && operation.stages.length === 3 && operation.reward));
  assert.equal(view.specialists.find((item) => item.id === 'UKR').available, true);
  assert.equal(view.specialists.find((item) => item.id === 'POL').available, false);
  assert.equal(view.canSelectProject, true);
  assert.equal(view.canAdvance, true);

  const operation = front.board[0];
  front = winAndClaim(front, operation.id).front;
  const country = frontCountryState(front, operation.country);
  assert.equal(country.state, 'rebuilding');
  assert.equal(country.outpostLevel, 1);
  view = frontViewModel(front);
  assert.equal(view.completedOperations, 0);
  assert.equal(view.canSelectProject, false);
});

test('country states use the approved five-name lifecycle', () => {
  const front = createFront({ seed: 915, liberated: ['UKR', 'POL', 'DEU', 'FRA'] });
  const attacked = front.board[0].country;
  const peaceful = ['UKR', 'POL', 'DEU', 'FRA'].find((country) => !front.board.some((operation) => operation.country === country));
  assert.equal(frontCountryState(front, attacked).state, 'attacked');
  assert.equal(frontCountryState(front, peaceful).state, 'peaceful');
  front.world.countries[attacked].damage = 3;
  assert.equal(frontCountryState(front, attacked).state, 'destroyed');
  front.world.countries[attacked].damage = 0;
  front.restored[attacked] = 1;
  assert.equal(frontCountryState(front, attacked).state, 'rebuilding');
  front.restored[attacked] = 3;
  assert.equal(frontCountryState(front, attacked).state, 'saved');
});

test('INIT owns local counters and rejects unavailable specialists', () => {
  let result = reduce(null, { type: 'INIT', seed: 507, liberated: ['UKR'], rescuedFriends: [], opened: true, day: '2026-07-13' });
  let front = result.front;
  assert.equal(front.stats.opens, 1);
  assert.equal(front.stats.firstSeenDay, '2026-07-13');
  result = reduce(front, {
    type: 'START_OPERATION',
    operationId: front.board[0].id,
    specialist: 'UKR',
    rescuedFriends: [],
  });
  assert.equal(result.front.active.specialist, 'dispatcher');
});

test('offline days never change a country', () => {
  let front = reduce(null, {
    type: 'INIT', seed: 910, liberated: ['UKR'], day: '2026-07-17',
  }).front;
  front.world.countries.UKR = { damage: 2, population: 64 };
  const before = structuredClone(front.world.countries);
  const result = reduce(front, { type: 'INIT', liberated: ['UKR'], day: '2026-07-24' });
  assert.deepEqual(result.front.world.countries, before);
  assert.equal(result.effects.some((effect) => effect.key === 'front.worldAttacked'), false);
});

test('terminal defeat is explicit, idempotent and rebuilding never regresses', () => {
  let front = createFront({ seed: 913, liberated: ['UKR'] });
  const operationId = front.board[0].id;
  front = reduce(front, { type: 'START_OPERATION', operationId }).front;
  front = reduce(front, { type: 'START_STAGE' }).front;
  front = reduce(front, { type: 'FAIL_STAGE' }).front;
  const failed = reduce(front, { type: 'END_FAILED_OPERATION' });
  assert.equal(failed.front.active, null);
  assert.equal(failed.front.world.countries.UKR.damage, 1);
  assert.deepEqual(reduce(failed.front, { type: 'END_FAILED_OPERATION' }).front, failed.front);

  front = createFront({ seed: 914, liberated: ['UKR'] });
  front.restored.UKR = 1;
  const restoredBefore = structuredClone(front);
  front = reduce(front, { type: 'START_OPERATION', operationId: front.board[0].id }).front;
  front = reduce(front, { type: 'START_STAGE' }).front;
  front = reduce(front, { type: 'FAIL_STAGE' }).front;
  front = reduce(front, { type: 'END_FAILED_OPERATION' }).front;
  assert.equal(front.restored.UKR, restoredBefore.restored.UKR);
});

test('claiming an operation repairs damage and brings people home', () => {
  let front = createFront({ seed: 911, liberated: ['UKR'] });
  front.world.countries.UKR = { damage: 3, population: 40 };
  assert.equal(frontCountryState(front, 'UKR').state, 'destroyed');
  front = winAndClaim(front, front.board[0].id).front;
  assert.equal(front.world.countries.UKR.damage, 2);
  assert.ok(front.world.countries.UKR.population > 40);
});

test('active scout reveals commander intel without a Radio Tower level', () => {
  let front = createFront({ seed: 508, liberated: ['UKR', 'POL', 'DEU'], rescuedFriends: ['POL'] });
  const operationId = front.board[0].id;
  front = reduce(front, {
    type: 'START_OPERATION', operationId, specialist: 'POL', rescuedFriends: ['POL'],
  }).front;
  const view = frontViewModel(front, { friends: { POL: true } });
  assert.ok(view.board.find((operation) => operation.id === operationId).commander);
});

test('a next-cycle counterattack preserves completed rebuilding', () => {
  let front = createFront({ seed: 509, liberated: ['UKR', 'POL', 'DEU', 'FRA'] });
  front.restored = { UKR: 3, POL: 3, DEU: 3, FRA: 3 };
  const protectedCountries = new Set(front.board.map((operation) => operation.country));
  const exposedCountry = ['UKR', 'POL', 'DEU', 'FRA'].find((country) => !protectedCountries.has(country));
  for (const operation of front.board.slice()) front = saveCountry(front, operation.country).front;
  const before = front.restored[exposedCountry];
  const result = reduce(front, { type: 'ADVANCE_GENERATION', liberated: ['UKR', 'POL', 'DEU', 'FRA'] });
  assert.equal(result.front.restored[exposedCountry], before);
  assert.equal(result.front.world.countries[exposedCountry].damage, 1);
  assert.equal(result.front.board.find((operation) => operation.country === exposedCountry).counterattack, true);
});
