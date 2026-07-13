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

test('operation and cycle rewards are canonical, stable and idempotent', () => {
  let front = createFront({ seed: 505, liberated: ['UKR', 'POL', 'DEU'] });
  for (let index = 0; index < 3; index++) {
    const operation = front.board.find((entry) => entry.status === 'available');
    const expectedCoins = 200 + operation.threat * 50;
    const result = winAndClaim(front, operation.id);
    const operationGrant = result.effects.find((effect) => effect.type === 'grant' && effect.rewardId.endsWith(':operation'));
    assert.equal(operationGrant.coins, expectedCoins);
    assert.equal(operationGrant.crystals, 1 + operation.threat);
    front = result.front;
    if (index < 2) assert.equal(result.effects.some((effect) => effect.eggs === 1), false);
    else assert.ok(result.effects.some((effect) => effect.eggs === 1 && effect.crystals === 10));
  }
  assert.equal(front.projects.medbay, 1);
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
  assert.equal(country.state, 'restoring');
  assert.equal(country.outpostLevel, 1);
  view = frontViewModel(front);
  assert.equal(view.completedOperations, 1);
  assert.equal(view.canSelectProject, false);
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
