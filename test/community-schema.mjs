import assert from 'node:assert/strict';
import {
  COMMUNITY_SCHEMA_VERSION,
  COMMUNITY_REACTIONS,
  COMMUNITY_REPORTS,
  CUSTOM_MAP_LIMITS,
  CUSTOM_MAP_RADII,
  MAP_SIZE_MODES,
  mapSizeScale,
  sanitizeCustomMap,
  validateCustomMap,
  validateCustomPlacement,
  deriveCustomMapTier,
  sanitizeCommunitySnapshot,
  communityWeekId,
} from '../worker/community-schema.mjs';

const tree = (x, z, extra = {}) => ({ type: 'tree', x, z, ry: 0, ...extra });
const task = (x, z, quest = 'rescue') => ({ type: 'task', x, z, ry: 0, quest });
const zombie = (x, z, zombieType = 'walker') => ({ type: 'zombie', x, z, ry: 0, zombieType });
const map = (objects, biome = 'summer') => ({ biome, objects });

function packedMap(count) {
  const objects = [task(-250, -250)];
  for (let z = -220; objects.length < count; z += 5) {
    for (let x = -220; x <= 220 && objects.length < count; x += 5) objects.push(tree(x, z));
  }
  return map(objects);
}

assert.equal(COMMUNITY_SCHEMA_VERSION, 1);
assert.deepEqual(COMMUNITY_REACTIONS, ['fun', 'challenging', 'beautiful']);
assert.deepEqual(COMMUNITY_REPORTS, ['inappropriate', 'broken', 'spam']);

const soft = sanitizeCustomMap({
  biome: 'bad',
  ignored: true,
  objects: [
    { type: 'tree', x: '220', z: '-12', ry: '0.5', ignored: true },
    { type: 'task', x: 10, z: 10, ry: 0, quest: 'bad' },
    { type: 'zombie', x: 20, z: 20, ry: null, zombieType: 'bad' },
    { type: 'bad', x: 0, z: 0, ry: 0 },
  ],
});
assert.equal(soft.biome, 'summer');
assert.deepEqual(soft.objects[0], { type: 'tree', x: 220, z: -12, ry: 0.5 });
assert.equal(soft.objects[1].quest, 'rescue');
assert.equal(soft.objects[2].zombieType, 'walker');
assert.equal(soft.objects.length, 3);
assert.doesNotThrow(() => sanitizeCustomMap(null));

const limited = sanitizeCustomMap(map([
  ...Array.from({ length: 4 }, (_, index) => task(-120 + index * 30, -120)),
  ...Array.from({ length: 3 }, (_, index) => ({ type: 'airdrop', x: -100 + index * 30, z: 0, ry: 0 })),
  ...Array.from({ length: 2 }, (_, index) => ({ type: 'church', x: -80 + index * 40, z: 80, ry: 0 })),
  ...Array.from({ length: 6 }, (_, index) => ({ type: 'largehouse', x: -120 + index * 40, z: 130, ry: 0 })),
]));
assert.equal(limited.objects.filter((item) => item.type === 'task').length, 3);
assert.equal(limited.objects.filter((item) => item.type === 'airdrop').length, 2);
assert.equal(limited.objects.filter((item) => item.type === 'church').length, 1);
assert.equal(limited.objects.filter((item) => item.type === 'largehouse').length, 5);

const draft = validateCustomMap(map([]), { profile: 'draft', mapSize: 'standard' });
assert.equal(draft.ok, true);
assert.equal(validateCustomMap(map([]), { profile: 'publication', mapSize: 'standard' }).code, 'task_required');
assert.equal(validateCustomMap({ ...map([]), extra: true }, { profile: 'draft', mapSize: 'standard' }).code, 'map_keys');
assert.equal(validateCustomMap(map([{ type: 'tree', x: '1', z: 0, ry: 0 }]), { profile: 'draft', mapSize: 'standard' }).code, 'number');
assert.equal(validateCustomMap(map([{ type: 'tree', x: 1, z: 0, ry: Infinity }]), { profile: 'draft', mapSize: 'standard' }).code, 'number');
assert.equal(validateCustomMap(map([{ type: 'tree', x: 1, z: 0, ry: Math.PI + 0.01 }]), { profile: 'draft', mapSize: 'standard' }).code, 'rotation');
assert.equal(validateCustomMap(map([tree(0, 0, { extra: true })]), { profile: 'draft', mapSize: 'standard' }).code, 'object_keys');
assert.equal(validateCustomMap(map([]), { profile: 'draft', mapSize: 'bad' }).code, 'map_size');

const base120 = validateCustomMap(packedMap(120), { profile: 'publication', mapSize: 'huge' });
const plus140 = validateCustomMap(packedMap(140), { profile: 'publication', mapSize: 'huge' });
assert.equal(base120.ok && base120.value.tier, 'base');
assert.equal(plus140.ok && plus140.value.tier, 'plus');
assert.equal(validateCustomMap(packedMap(141), { profile: 'publication', mapSize: 'huge' }).code, 'object_limit');

for (const size of MAP_SIZE_MODES) {
  const bound = CUSTOM_MAP_LIMITS.placementBound * mapSizeScale(size);
  const radius = CUSTOM_MAP_RADII.tree;
  assert.equal(validateCustomMap(map([tree(bound - radius, 0)]), { profile: 'draft', mapSize: size }).ok, true, `${size}: точная граница`);
  assert.equal(validateCustomMap(map([tree(bound - radius + 0.001, 0)]), { profile: 'draft', mapSize: size }).code, 'edge', `${size}: за границей`);
  const spawnZ = CUSTOM_MAP_LIMITS.spawnZ * mapSizeScale(size);
  assert.equal(validateCustomMap(map([tree(0, spawnZ)]), { profile: 'draft', mapSize: size }).code, 'spawn', `${size}: spawn clearance`);
}
assert.equal(validateCustomMap(map([tree(-20, 0), tree(-18, 0)]), { profile: 'draft', mapSize: 'standard' }).code, 'overlap');

assert.equal(deriveCustomMapTier(map([task(-30, -30), zombie(30, -30)])), 'base');
assert.equal(deriveCustomMapTier(map([task(-30, -30)], 'snow')), 'plus');
assert.equal(deriveCustomMapTier(packedMap(121)), 'plus');
assert.equal(deriveCustomMapTier(map([task(-30, -30), { type: 'airdrop', x: 30, z: -30, ry: 0 }])), 'plus');
assert.equal(deriveCustomMapTier(map([task(-30, -30), { type: 'church', x: 30, z: -30, ry: 0 }])), 'plus');
assert.equal(deriveCustomMapTier(map([task(-30, -30, 'rebuild')])), 'plus');
assert.equal(deriveCustomMapTier(map([task(-30, -30), zombie(30, -30, 'runner')])), 'plus');
assert.equal(deriveCustomMapTier(map([task(-30, -30), { type: 'largehouse', x: 30, z: -30, ry: 0 }])), 'base');

const baseDraft = map([task(-30, -30)]);
assert.equal(validateCustomPlacement(baseDraft, { type: 'airdrop', x: 30, z: -30, ry: 0 }, { plus: false, mapSize: 'standard' }).code, 'plus_required');
assert.equal(validateCustomPlacement(baseDraft, zombie(30, -30, 'runner'), { plus: false, mapSize: 'standard' }).code, 'plus_required');
assert.equal(validateCustomPlacement(baseDraft, tree(30, -30), { plus: false, mapSize: 'standard' }).ok, true);

const snapshot = sanitizeCommunitySnapshot({
  v: 1,
  id: 'AB7K2MNP',
  revision: 3,
  tier: 'base',
  mapSize: 'standard',
  mapStyle: 'classic',
  data: baseDraft,
});
assert.equal(snapshot?.id, 'AB7K2MNP');
assert.equal(snapshot?.revision, 3);
assert.equal(sanitizeCommunitySnapshot({ ...snapshot, tier: 'plus' }), null);
assert.equal(sanitizeCommunitySnapshot({ ...snapshot, id: 'bad' }), null);
assert.equal(sanitizeCommunitySnapshot({ ...snapshot, extra: true }), null);

assert.equal(communityWeekId(Date.UTC(2026, 6, 19, 23, 59)), '2026-W29');
assert.equal(communityWeekId(Date.UTC(2026, 6, 20, 0, 0)), '2026-W30');
assert.equal(communityWeekId(NaN), null);

console.log('✅ Community schema: sanitizer, strict validation, tier, geometry, snapshot, week');
