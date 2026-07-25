export const COMMUNITY_SCHEMA_VERSION = 1;

export const CUSTOM_MAP_TYPES = Object.freeze([
  'house', 'tree', 'lake', 'zombie', 'rock', 'task', 'airdrop', 'church', 'largehouse',
]);
export const CUSTOM_MAP_QUESTS = Object.freeze([
  'rescue', 'collect', 'repair', 'lights', 'elites', 'warehouse', 'rebuild',
]);
export const CUSTOM_MAP_ZOMBIES = Object.freeze([
  'walker', 'runner', 'tank', 'spitter', 'shield', 'moonbrute',
]);
export const COMMUNITY_REACTIONS = Object.freeze(['fun', 'challenging', 'beautiful']);
export const COMMUNITY_REPORTS = Object.freeze(['inappropriate', 'broken', 'spam']);

export const CUSTOM_MAP_RADII = Object.freeze({
  house: 4.5,
  tree: 0.8,
  lake: 6.5,
  zombie: 1,
  rock: 1.5,
  task: 8,
  airdrop: 2.5,
  church: 7,
  largehouse: 8,
});
export const CUSTOM_MAP_TYPE_LIMITS = Object.freeze({ task: 3, airdrop: 2, church: 1, largehouse: 5 });
export const CUSTOM_MAP_PLUS_OBJECTS = Object.freeze(['airdrop', 'church']);
export const CUSTOM_MAP_LIMITS = Object.freeze({
  baseObjects: 120,
  plusObjects: 140,
  placementBound: 170,
  spawnX: 0,
  spawnZ: 55,
  spawnClearRadius: 10,
  overlapGap: 0.5,
});

export const MAP_SIZE_MODES = Object.freeze(['small', 'standard', 'large', 'huge']);
export const MAP_SIZE_METERS = Object.freeze({ small: 500, standard: 750, large: 950, huge: 1250 });
export const MAP_STYLE_MODES = Object.freeze(['classic', 'forest', 'lakes', 'stone']);

const TYPE_SET = new Set(CUSTOM_MAP_TYPES);
const QUEST_SET = new Set(CUSTOM_MAP_QUESTS);
const ZOMBIE_SET = new Set(CUSTOM_MAP_ZOMBIES);
const PLUS_OBJECT_SET = new Set(CUSTOM_MAP_PLUS_OBJECTS);
const PROFILE_SET = new Set(['draft', 'publication', 'community']);
const ROOT_KEYS = Object.freeze(['biome', 'objects']);
const BASE_OBJECT_KEYS = Object.freeze(['type', 'x', 'z', 'ry']);
export const COMMUNITY_MAP_ID_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const MAX_LOCAL_COORD = CUSTOM_MAP_LIMITS.placementBound
  * MAP_SIZE_METERS.huge / MAP_SIZE_METERS.standard;

function ok(value) {
  return { ok: true, value };
}

function fail(code, path = '') {
  return { ok: false, code, path };
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function expectedObjectKeys(type) {
  if (type === 'task') return [...BASE_OBJECT_KEYS, 'quest'];
  if (type === 'zombie') return [...BASE_OBJECT_KEYS, 'zombieType'];
  return BASE_OBJECT_KEYS;
}

function canonicalObject(item) {
  const clean = { type: item.type, x: item.x, z: item.z, ry: item.ry };
  if (item.type === 'task') clean.quest = item.quest;
  if (item.type === 'zombie') clean.zombieType = item.zombieType;
  return clean;
}

function validateObject(item, path) {
  if (!isRecord(item)) return fail('object_type', path);
  if (!TYPE_SET.has(item.type)) return fail('object_kind', `${path}.type`);
  if (!exactKeys(item, expectedObjectKeys(item.type))) return fail('object_keys', path);
  for (const key of ['x', 'z', 'ry']) {
    if (typeof item[key] !== 'number' || !Number.isFinite(item[key])) {
      return fail('number', `${path}.${key}`);
    }
  }
  if (item.ry < -Math.PI || item.ry > Math.PI) return fail('rotation', `${path}.ry`);
  if (item.type === 'task' && !QUEST_SET.has(item.quest)) return fail('quest', `${path}.quest`);
  if (item.type === 'zombie' && !ZOMBIE_SET.has(item.zombieType)) {
    return fail('zombie_type', `${path}.zombieType`);
  }
  return ok(canonicalObject(item));
}

function geometryError(objects, candidate, mapSize, candidateIndex = objects.length) {
  const scale = mapSizeScale(mapSize);
  const radius = CUSTOM_MAP_RADII[candidate.type];
  const bound = CUSTOM_MAP_LIMITS.placementBound * scale;
  if (Math.abs(candidate.x) > bound - radius || Math.abs(candidate.z) > bound - radius) {
    return fail('edge', `objects[${candidateIndex}]`);
  }
  const spawnX = CUSTOM_MAP_LIMITS.spawnX * scale;
  const spawnZ = CUSTOM_MAP_LIMITS.spawnZ * scale;
  if (Math.hypot(candidate.x - spawnX, candidate.z - spawnZ)
      < CUSTOM_MAP_LIMITS.spawnClearRadius + radius) {
    return fail('spawn', `objects[${candidateIndex}]`);
  }
  for (let index = 0; index < objects.length; index++) {
    const item = objects[index];
    const otherRadius = CUSTOM_MAP_RADII[item.type];
    if (Math.hypot(candidate.x - item.x, candidate.z - item.z)
        < radius + otherRadius + CUSTOM_MAP_LIMITS.overlapGap) {
      return fail('overlap', `objects[${candidateIndex}]`);
    }
  }
  return null;
}

export function sanitizeMapSize(value) {
  return MAP_SIZE_MODES.includes(value) ? value : 'standard';
}

export function sanitizeMapStyle(value) {
  return MAP_STYLE_MODES.includes(value) ? value : 'classic';
}

export function mapSizeScale(value) {
  return MAP_SIZE_METERS[sanitizeMapSize(value)] / MAP_SIZE_METERS.standard;
}

export function sanitizeCustomMap(raw) {
  const source = Array.isArray(raw?.objects) ? raw.objects : [];
  const objects = [];
  const counts = Object.create(null);
  let taskIndex = 0;

  for (const item of source) {
    if (objects.length >= CUSTOM_MAP_LIMITS.plusObjects) break;
    if (!isRecord(item) || !TYPE_SET.has(item.type)) continue;
    const typeLimit = CUSTOM_MAP_TYPE_LIMITS[item.type];
    if (typeLimit && (counts[item.type] || 0) >= typeLimit) continue;

    const x = Number(item.x);
    const z = Number(item.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const rawRotation = Number(item.ry);
    const clean = {
      type: item.type,
      x: clamp(x, -MAX_LOCAL_COORD, MAX_LOCAL_COORD),
      z: clamp(z, -MAX_LOCAL_COORD, MAX_LOCAL_COORD),
      ry: clamp(Number.isFinite(rawRotation) ? rawRotation : 0, -Math.PI, Math.PI),
    };
    if (item.type === 'task') {
      clean.quest = QUEST_SET.has(item.quest)
        ? item.quest
        : CUSTOM_MAP_QUESTS[taskIndex % CUSTOM_MAP_QUESTS.length];
      taskIndex++;
    }
    if (item.type === 'zombie') {
      clean.zombieType = ZOMBIE_SET.has(item.zombieType) ? item.zombieType : 'walker';
    }
    counts[item.type] = (counts[item.type] || 0) + 1;
    objects.push(clean);
  }

  return { biome: raw?.biome === 'snow' ? 'snow' : 'summer', objects };
}

export function deriveCustomMapTier(map) {
  if (!isRecord(map) || !Array.isArray(map.objects)) return 'base';
  if (map.biome === 'snow' || map.objects.length > CUSTOM_MAP_LIMITS.baseObjects) return 'plus';
  for (const item of map.objects) {
    if (PLUS_OBJECT_SET.has(item?.type)) return 'plus';
    if (item?.type === 'task' && item.quest === 'rebuild') return 'plus';
    if (item?.type === 'zombie' && item.zombieType !== 'walker') return 'plus';
  }
  return 'base';
}

export function validateCustomMap(raw, { profile = 'draft', mapSize } = {}) {
  if (!PROFILE_SET.has(profile)) return fail('profile', 'profile');
  if (!MAP_SIZE_MODES.includes(mapSize)) return fail('map_size', 'mapSize');
  if (!isRecord(raw) || !exactKeys(raw, ROOT_KEYS)) return fail('map_keys');
  if (raw.biome !== 'summer' && raw.biome !== 'snow') return fail('biome', 'biome');
  if (!Array.isArray(raw.objects)) return fail('objects', 'objects');
  if (raw.objects.length > CUSTOM_MAP_LIMITS.plusObjects) return fail('object_limit', 'objects');

  const objects = [];
  const counts = Object.create(null);
  for (let index = 0; index < raw.objects.length; index++) {
    const checked = validateObject(raw.objects[index], `objects[${index}]`);
    if (!checked.ok) return checked;
    const item = checked.value;
    const typeLimit = CUSTOM_MAP_TYPE_LIMITS[item.type];
    counts[item.type] = (counts[item.type] || 0) + 1;
    if (typeLimit && counts[item.type] > typeLimit) {
      return fail(item.type === 'task' ? 'task_limit' : 'type_limit', `objects[${index}]`);
    }
    const geometry = geometryError(objects, item, mapSize, index);
    if (geometry) return geometry;
    objects.push(item);
  }

  if (profile !== 'draft' && !(counts.task > 0)) return fail('task_required', 'objects');
  const value = { biome: raw.biome, objects };
  return ok({ ...value, tier: deriveCustomMapTier(value) });
}

export function validateCustomPlacement(map, candidate, { plus = false, mapSize } = {}) {
  if (!MAP_SIZE_MODES.includes(mapSize)) return fail('map_size', 'mapSize');
  if (!isRecord(map) || !Array.isArray(map.objects)) return fail('objects', 'objects');
  const checked = validateObject(candidate, `objects[${map.objects.length}]`);
  if (!checked.ok) return checked;
  const item = checked.value;
  const needsPlus = PLUS_OBJECT_SET.has(item.type)
    || (item.type === 'task' && item.quest === 'rebuild')
    || (item.type === 'zombie' && item.zombieType !== 'walker');
  if (needsPlus && !plus) return fail('plus_required', `objects[${map.objects.length}]`);
  const maxObjects = plus ? CUSTOM_MAP_LIMITS.plusObjects : CUSTOM_MAP_LIMITS.baseObjects;
  if (map.objects.length >= maxObjects) return fail('object_limit', 'objects');
  const typeLimit = CUSTOM_MAP_TYPE_LIMITS[item.type];
  if (typeLimit && map.objects.filter((other) => other?.type === item.type).length >= typeLimit) {
    return fail(item.type === 'task' ? 'task_limit' : 'type_limit', `objects[${map.objects.length}]`);
  }
  const geometry = geometryError(map.objects, item, mapSize);
  return geometry || ok(item);
}

export function sanitizeCommunitySnapshot(raw) {
  if (!isRecord(raw) || !exactKeys(raw, ['v', 'id', 'revision', 'tier', 'mapSize', 'mapStyle', 'data'])) {
    return null;
  }
  if (raw.v !== COMMUNITY_SCHEMA_VERSION || !COMMUNITY_MAP_ID_RE.test(raw.id)) return null;
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 1) return null;
  if (raw.tier !== 'base' && raw.tier !== 'plus') return null;
  if (!MAP_SIZE_MODES.includes(raw.mapSize) || !MAP_STYLE_MODES.includes(raw.mapStyle)) return null;
  const checked = validateCustomMap(raw.data, { profile: 'community', mapSize: raw.mapSize });
  if (!checked.ok || checked.value.tier !== raw.tier) return null;
  return {
    v: COMMUNITY_SCHEMA_VERSION,
    id: raw.id,
    revision: raw.revision,
    tier: raw.tier,
    mapSize: raw.mapSize,
    mapStyle: raw.mapStyle,
    data: { biome: checked.value.biome, objects: checked.value.objects },
  };
}

export function communityWeekId(timestamp = Date.now()) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil((((date.getTime() - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
