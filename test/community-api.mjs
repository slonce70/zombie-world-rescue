import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { MemoryCommunity } from '../worker/community.mjs';
import { spawnRelay } from './_relay.mjs';

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const PORT = await freePort();
const API = `http://127.0.0.1:${PORT}`;
const ADMIN_KEY = 'community-test-admin';
const oldAdmin = process.env.ADMIN_KEY;
const oldCooldown = process.env.COMMUNITY_PUBLISH_COOLDOWN_MS;
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.COMMUNITY_PUBLISH_COOLDOWN_MS = '0';

const [communitySource, relaySource, wranglerSource, schemaSource] = await Promise.all([
  readFile(new URL('../worker/community.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../worker/relay-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../worker/wrangler.toml', import.meta.url), 'utf8'),
  readFile(new URL('../worker/community-schema.mjs', import.meta.url), 'utf8'),
]);
for (const table of ['maps', 'revisions', 'revision_stats', 'runs', 'completions', 'reactions',
  'reports', 'weekly_entries', 'weekly_claims']) {
  assert.match(communitySource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
}
assert.match(communitySource, /transactionSync/);
assert.match(communitySource, /crypto\.subtle\.digest\('SHA-256'/);
assert.match(communitySource, /revisions_immutable_update/);
const sqlSchema = communitySource.match(/const SCHEMA_SQL = `([\s\S]*?)`;\n/)?.[1] || '';
assert.ok(sqlSchema && !/\bcid\b/i.test(sqlSchema), 'production Community SQL must not store raw cid');
const listSerializer = communitySource.match(/function listItem\([\s\S]*?\n}\n/)?.[0] || '';
assert.ok(listSerializer && !/\b(?:cid|ownerHash|data|map)\s*:/.test(listSerializer),
  'production catalog serializer must omit identity and map payload');
assert.match(relaySource, /env\.COMMUNITY\.idFromName\('community'\)/);
assert.match(relaySource, /const COMMUNITY_CORS = SAVE_CORS/);
assert.match(relaySource, /const SAVE_MAX_BYTES = 64 \* 1024/);
assert.match(relaySource, /const SAVE_BODY_BYTES = 96 \* 1024/);
assert.match(relaySource, /request\.arrayBuffer\(\)/);
assert.match(wranglerSource, /name = "COMMUNITY"\s+class_name = "Community"/);
assert.match(wranglerSource, /tag = "v6"\s+new_sqlite_classes = \["Community"\]/);
assert.match(schemaSource, /export const COMMUNITY_MAP_ID_RE = /);

const owner = 'owner-cid-0001';
const viewer = 'viewer-cid-001';
const baseMap = (quest = 'rescue') => ({
  biome: 'summer',
  objects: [
    { type: 'task', x: -60, z: -60, ry: 0, quest },
    { type: 'tree', x: 20, z: -60, ry: 0 },
  ],
});

async function memoryPost(api, path, body) {
  const response = await api.fetch(new Request(`http://memory${path}`, {
    method: 'POST', body: JSON.stringify(body),
  }));
  const text = await response.text();
  assert.equal(response.status, 200, `${path}: ${text}`);
  return JSON.parse(text);
}

const realNow = Date.now;
try {
  const api = new MemoryCommunity({ cooldownMs: 0 });
  Date.now = () => Date.UTC(2026, 6, 20, 12);
  const published = await memoryPost(api, '/community/publish', {
    cid: 'week-replay-owner', slot: 0, map: baseMap(), mapSize: 'standard', mapStyle: 'classic',
  });
  await memoryPost(api, '/community/list', { cid: 'week-replay-player', tab: 'weekly' });
  const run = {
    cid: 'week-replay-player', mapId: published.mapId, revision: published.revision,
    runId: 'week-replay-run', coop: false,
  };
  await memoryPost(api, '/community/run/start', run);
  const firstWeek = await memoryPost(api, '/community/complete', run);
  assert.equal(firstWeek.reward?.crystals, 25);
  Date.now = () => Date.UTC(2026, 6, 27, 12);
  await memoryPost(api, '/community/list', { cid: 'week-replay-player', tab: 'weekly' });
  const replay = await memoryPost(api, '/community/complete', run);
  assert.equal(replay.reward, null, 'old run must not mint a reward in a later week');
} finally {
  Date.now = realNow;
}

async function request(path, body, method = 'POST') {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: body == null ? undefined : { 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function post(path, body, status = 200) {
  const result = await request(path, body);
  assert.equal(result.status, status, `${path}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function publish(cid, slot = 0, map = baseMap()) {
  return post('/community/publish', { cid, slot, map, mapSize: 'standard', mapStyle: 'classic' });
}

async function runAndComplete(cid, item, runId, coop = false) {
  await post('/community/run/start', {
    cid, mapId: item.mapId, revision: item.revision, runId, coop,
  });
  return post('/community/complete', {
    cid, mapId: item.mapId, revision: item.revision, runId, coop,
  });
}

const relay = await spawnRelay(PORT, { quiet: true });
try {
  const health = await request('/community/health', null, 'GET');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true, schema: 1 });
  const queryIdentity = await request(`/community/list?cid=${owner}`, null, 'GET');
  assert.equal(queryIdentity.status, 405);
  const hugePublish = await fetch(`${API}/community/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(33 * 1024) }),
  });
  assert.equal(hugePublish.status, 413);
  const hugeList = await fetch(`${API}/community/list`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid: owner, tab: 'new', padding: 'x'.repeat(5 * 1024) }),
  });
  assert.equal(hugeList.status, 413);

  await post('/community/publish', {
    cid: owner, slot: 0, map: { ...baseMap(), extra: true }, mapSize: 'standard', mapStyle: 'classic',
  }, 400);
  await post('/community/publish', {
    cid: owner, slot: 2, map: baseMap(), mapSize: 'standard', mapStyle: 'classic',
  }, 400);

  const first = await publish(owner);
  assert.match(first.mapId, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(first.revision, 1);
  assert.equal(first.share, `?community=${first.mapId}&r=1`);

  const second = await publish(owner, 0, baseMap('repair'));
  assert.equal(second.mapId, first.mapId);
  assert.equal(second.revision, 2);
  const exactFirst = await post('/community/map', { cid: viewer, mapId: first.mapId, revision: 1 });
  assert.equal(exactFirst.cm.data.objects[0].quest, 'rescue');
  const exactSecond = await post('/community/map', { cid: viewer, mapId: first.mapId, revision: 2 });
  assert.equal(exactSecond.cm.data.objects[0].quest, 'repair');

  const slotTwo = await publish(owner, 1, baseMap('collect'));
  assert.notEqual(slotTwo.mapId, first.mapId);
  assert.equal(slotTwo.revision, 1);

  const publicList = await post('/community/list', { cid: viewer, tab: 'new' });
  assert.ok(publicList.items.length <= 20);
  const publicJson = JSON.stringify(publicList);
  assert.ok(!publicJson.includes(owner));
  assert.ok(!publicJson.includes(createHash('sha256').update(owner).digest('hex')));
  for (const item of publicList.items) {
    assert.ok(!Object.hasOwn(item, 'cid'));
    assert.ok(!Object.hasOwn(item, 'ownerHash'));
    assert.ok(!Object.hasOwn(item, 'map'));
    assert.ok(!Object.hasOwn(item, 'data'));
  }

  await post('/community/unpublish', { cid: owner, mapId: first.mapId });
  await post('/community/map', { cid: viewer, mapId: first.mapId, revision: 1 }, 404);
  const third = await publish(owner, 0, baseMap('lights'));
  assert.equal(third.mapId, first.mapId);
  assert.equal(third.revision, 3);
  await post('/community/map', { cid: viewer, mapId: first.mapId, revision: 1 }, 404);
  const current = await post('/community/map', { cid: viewer, mapId: first.mapId });
  assert.equal(current.cm.revision, 3);
  assert.equal(current.cm.data.objects[0].quest, 'lights');

  await post('/community/react', {
    cid: viewer, mapId: first.mapId, revision: 3, reaction: 'fun',
  }, 403);
  const run = { mapId: first.mapId, revision: 3 };
  await post('/community/run/start', { cid: viewer, ...run, runId: 'viewer-run-0001', coop: false });
  await post('/community/run/start', { cid: viewer, ...run, runId: 'viewer-run-0001', coop: false });
  const complete = await post('/community/complete', {
    cid: viewer, ...run, runId: 'viewer-run-0001', coop: false,
  });
  assert.equal(complete.first, true);
  const completeAgain = await post('/community/complete', {
    cid: viewer, ...run, runId: 'viewer-run-0001', coop: false,
  });
  assert.equal(completeAgain.first, false);

  let reacted = await post('/community/react', { cid: viewer, ...run, reaction: 'fun' });
  assert.deepEqual(reacted.reactions, { fun: 1, challenging: 0, beautiful: 0 });
  reacted = await post('/community/react', { cid: viewer, ...run, reaction: 'challenging' });
  assert.deepEqual(reacted.reactions, { fun: 0, challenging: 1, beautiful: 0 });
  reacted = await post('/community/react', { cid: viewer, ...run, reaction: null });
  assert.deepEqual(reacted.reactions, { fun: 0, challenging: 0, beautiful: 0 });

  const myStats = await post('/community/list', { cid: owner, tab: 'my' });
  const mine = myStats.items.find((item) => item.mapId === first.mapId);
  assert.equal(mine.externalRuns, 1);
  assert.equal(mine.externalCompletions, 1);

  const reporters = ['reporter-cid-01', 'reporter-cid-02', 'reporter-cid-03'];
  await post('/community/report', { cid: reporters[0], ...run, reason: 'broken' });
  const duplicateReport = await post('/community/report', { cid: reporters[0], ...run, reason: 'spam' });
  assert.equal(duplicateReport.quarantined, false);
  const secondReport = await post('/community/report', { cid: reporters[1], ...run, reason: 'spam' });
  assert.equal(secondReport.quarantined, false);
  const thirdReport = await post('/community/report', { cid: reporters[2], ...run, reason: 'inappropriate' });
  assert.equal(thirdReport.quarantined, true);
  await post('/community/report', { cid: reporters[2], ...run, reason: 'inappropriate' });
  await post('/community/map', { cid: viewer, mapId: first.mapId, revision: 3 }, 404);
  const ownerQuarantineView = await post('/community/map', { cid: owner, mapId: first.mapId, revision: 3 });
  assert.equal(ownerQuarantineView.status, 'quarantined');
  const blockedPublish = await request('/community/publish', {
    cid: owner, slot: 0, map: baseMap('warehouse'), mapSize: 'standard', mapStyle: 'classic',
  });
  assert.equal(blockedPublish.status, 409);

  await post('/community/admin/status', { key: 'wrong', mapId: first.mapId, status: 'restore' }, 403);
  await post('/community/admin/status', { key: ADMIN_KEY, mapId: first.mapId, status: 'disable' });
  await post('/community/admin/status', { key: ADMIN_KEY, mapId: first.mapId, status: 'restore' });
  await post('/community/map', { cid: viewer, mapId: first.mapId, revision: 3 });
  const afterRestoreReport = await post('/community/report', {
    cid: reporters[2], ...run, reason: 'inappropriate',
  });
  assert.equal(afterRestoreReport.quarantined, false);
  await post('/community/admin/status', { key: ADMIN_KEY, mapId: first.mapId, status: 'disable' });
  await post('/community/map', { cid: viewer, mapId: first.mapId, revision: 3 }, 404);
  await post('/community/admin/status', { key: ADMIN_KEY, mapId: first.mapId, status: 'restore' });
  await post('/community/unpublish', { cid: owner, mapId: slotTwo.mapId });
  await post('/community/admin/status', { key: ADMIN_KEY, mapId: slotTwo.mapId, status: 'disable' }, 409);

  const ownersByMap = new Map([[first.mapId, owner], [slotTwo.mapId, owner]]);
  for (let index = 0; index < 6; index++) {
    const cid = `weekly-owner-${String(index).padStart(2, '0')}`;
    const item = await publish(cid, 0, baseMap(index % 2 ? 'rescue' : 'repair'));
    ownersByMap.set(item.mapId, cid);
  }
  const weekly = await post('/community/list', { cid: viewer, tab: 'weekly' });
  assert.ok(weekly.items.length <= 6);
  assert.equal(new Set(weekly.items.map((item) => ownersByMap.get(item.mapId))).size, weekly.items.length);
  const frozen = weekly.items.map((item) => `${item.mapId}:${item.revision}`);

  for (let index = 0; index < 13; index++) {
    const cid = `late-owner-${String(index).padStart(2, '0')}`;
    const item = await publish(cid, 0, baseMap('rebuild'));
    ownersByMap.set(item.mapId, cid);
  }
  const frozenAgain = await post('/community/list', { cid: viewer, tab: 'weekly' });
  assert.deepEqual(frozenAgain.items.map((item) => `${item.mapId}:${item.revision}`), frozen);
  const catalog = await post('/community/list', { cid: viewer, tab: 'new' });
  assert.equal(catalog.items.length, 20);

  const weeklyItem = weekly.items[0];
  const rewardPlayer = 'weekly-player-01';
  const reward = await runAndComplete(rewardPlayer, weeklyItem, 'weekly-run-0001');
  assert.deepEqual(reward.reward, { weekId: weekly.weekId, crystals: 25 });
  const rewardRetry = await post('/community/complete', {
    cid: rewardPlayer, mapId: weeklyItem.mapId, revision: weeklyItem.revision,
    runId: 'weekly-run-0001', coop: false,
  });
  assert.deepEqual(rewardRetry.reward, reward.reward);
  if (weekly.items[1]) {
    const noSecondReward = await runAndComplete(rewardPlayer, weekly.items[1], 'weekly-run-0002');
    assert.equal(noSecondReward.reward, null);
  }

  const itemOwner = ownersByMap.get(weeklyItem.mapId);
  const ownReward = await runAndComplete(itemOwner, weeklyItem, 'weekly-own-0001');
  assert.equal(ownReward.external, false);
  assert.equal(ownReward.reward, null);

  const myAfterReports = await post('/community/list', { cid: owner, tab: 'my' });
  assert.ok(myAfterReports.items.every((item) => !Object.hasOwn(item, 'ownerHash')));

  let lobby = await post('/lobby/ping', {
    cid: 'lobby-front-01', nick: 'Front',
    room: { code: 'FRONT01', mode: 'front', country: 'CUSTOM', n: 2, state: 'lobby', build: 700 },
  });
  assert.equal(lobby.rooms.find((room) => room.code === 'FRONT01')?.mode, 'front');
  lobby = await post('/lobby/ping', {
    cid: 'lobby-community-01', nick: 'Community',
    room: { code: 'CMAP0001', mode: 'community-map', country: 'CUSTOM', n: 2, state: 'lobby', build: 700, cm: { secret: true } },
  });
  const communityRoom = lobby.rooms.find((room) => room.code === 'CMAP0001');
  assert.equal(communityRoom?.mode, 'community-map');
  assert.ok(!Object.hasOwn(communityRoom, 'cid') && !Object.hasOwn(communityRoom, 'cm'));

  console.log('✅ Community API: revisions, privacy, stats, moderation, frozen weekly, reward');
} finally {
  relay.kill();
  if (oldAdmin == null) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = oldAdmin;
  if (oldCooldown == null) delete process.env.COMMUNITY_PUBLISH_COOLDOWN_MS;
  else process.env.COMMUNITY_PUBLISH_COOLDOWN_MS = oldCooldown;
}
