import {
  COMMUNITY_MAP_ID_RE,
  COMMUNITY_REACTIONS,
  COMMUNITY_REPORTS,
  COMMUNITY_SCHEMA_VERSION,
  MAP_STYLE_MODES,
  communityWeekId,
  sanitizeCommunitySnapshot,
  validateCustomMap,
} from './community-schema.mjs';

export const COMMUNITY_CID_RE = /^[A-Za-z0-9_-]{8,40}$/;
export { COMMUNITY_MAP_ID_RE };
export const COMMUNITY_BODY_BYTES = 4 * 1024;
export const COMMUNITY_PUBLISH_BODY_BYTES = 32 * 1024;
export const COMMUNITY_SNAPSHOT_BYTES = 64 * 1024;
export const COMMUNITY_PUBLISH_COOLDOWN_MS = 30_000;
export const COMMUNITY_PUBLISH_DAY_MAX = 10;
export const COMMUNITY_RUN_DAY_MAX = 60;
export const COMMUNITY_CATALOG_MAX = 20;
export const COMMUNITY_WEEKLY_MAX = 6;
export const COMMUNITY_WEEKLY_REWARD = 25;

const COMMUNITY_ORIGIN = 'https://slonce70.github.io';
const MAP_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAB_SET = new Set(['weekly', 'new', 'popular', 'my']);
const MUTATION_PATHS = new Set([
  '/community/publish', '/community/unpublish', '/community/run/start', '/community/complete',
  '/community/react', '/community/report', '/community/admin/status',
]);
const REACTION_SET = new Set(COMMUNITY_REACTIONS);
const REPORT_SET = new Set(COMMUNITY_REPORTS);
const RUN_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const RUN_RETENTION_MS = 30 * 86400000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class ApiError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...keys].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function positiveInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function cid(value) {
  return typeof value === 'string' && COMMUNITY_CID_RE.test(value) ? value : null;
}

function mapId(value) {
  return typeof value === 'string' && COMMUNITY_MAP_ID_RE.test(value) ? value : null;
}

function runId(value) {
  return typeof value === 'string' && RUN_ID_RE.test(value) ? value : null;
}

function randomMapId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += MAP_ID_ALPHABET[byte & 31];
  return out;
}

function utcDayStart(now) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function primaryQuest(map) {
  return map.objects.find((item) => item.type === 'task')?.quest || 'rescue';
}

function canonicalMap(checked) {
  return { biome: checked.biome, objects: checked.objects };
}

function snapshotBytes(snapshot) {
  return encoder.encode(JSON.stringify(snapshot)).byteLength;
}

function command(path, body) {
  if (path === '/community/publish') {
    if (!exactKeys(body, ['cid', 'slot', 'map', 'mapSize', 'mapStyle'])) throw new ApiError('fields');
    const identity = cid(body.cid);
    if (!identity || (body.slot !== 0 && body.slot !== 1) || !MAP_STYLE_MODES.includes(body.mapStyle)) {
      throw new ApiError('bad');
    }
    const checked = validateCustomMap(body.map, { profile: 'publication', mapSize: body.mapSize });
    if (!checked.ok) throw new ApiError(checked.code);
    const map = canonicalMap(checked.value);
    const draft = {
      v: COMMUNITY_SCHEMA_VERSION,
      id: 'ABCDEFGH',
      revision: 1,
      tier: checked.value.tier,
      mapSize: body.mapSize,
      mapStyle: body.mapStyle,
      data: map,
    };
    if (snapshotBytes(draft) > COMMUNITY_SNAPSHOT_BYTES) throw new ApiError('map_big', 413);
    return { identity, slot: body.slot, map, tier: checked.value.tier, mapSize: body.mapSize, mapStyle: body.mapStyle };
  }
  if (path === '/community/unpublish') {
    if (!exactKeys(body, ['cid', 'mapId'])) throw new ApiError('fields');
    const identity = cid(body.cid);
    const id = mapId(body.mapId);
    if (!identity || !id) throw new ApiError('bad');
    return { identity, mapId: id };
  }
  if (path === '/community/list') {
    if (!exactKeys(body, ['cid', 'tab'])) throw new ApiError('fields');
    const identity = cid(body.cid);
    if (!identity || !TAB_SET.has(body.tab)) throw new ApiError('bad');
    return { identity, tab: body.tab };
  }
  if (path === '/community/map') {
    const keys = Object.prototype.hasOwnProperty.call(body || {}, 'revision')
      ? ['cid', 'mapId', 'revision'] : ['cid', 'mapId'];
    if (!exactKeys(body, keys)) throw new ApiError('fields');
    const identity = cid(body.cid);
    const id = mapId(body.mapId);
    if (!identity || !id || (keys.length === 3 && !positiveInt(body.revision))) throw new ApiError('bad');
    return { identity, mapId: id, revision: keys.length === 3 ? body.revision : null };
  }
  if (path === '/community/run/start') {
    if (!exactKeys(body, ['cid', 'mapId', 'revision', 'runId', 'coop'])) throw new ApiError('fields');
    const identity = cid(body.cid);
    const id = mapId(body.mapId);
    const run = runId(body.runId);
    if (!identity || !id || !positiveInt(body.revision) || !run || typeof body.coop !== 'boolean') {
      throw new ApiError('bad');
    }
    return { identity, mapId: id, revision: body.revision, runId: run, coop: body.coop };
  }
  if (path === '/community/complete') {
    if (!exactKeys(body, ['cid', 'mapId', 'revision', 'runId', 'coop'])) throw new ApiError('fields');
    const identity = cid(body.cid);
    const id = mapId(body.mapId);
    const run = runId(body.runId);
    if (!identity || !id || !positiveInt(body.revision) || !run || typeof body.coop !== 'boolean') {
      throw new ApiError('bad');
    }
    return { identity, mapId: id, revision: body.revision, runId: run, coop: body.coop };
  }
  if (path === '/community/react') {
    if (!exactKeys(body, ['cid', 'mapId', 'revision', 'reaction'])) throw new ApiError('fields');
    const identity = cid(body.cid);
    const id = mapId(body.mapId);
    if (!identity || !id || !positiveInt(body.revision)
      || (body.reaction !== null && !REACTION_SET.has(body.reaction))) throw new ApiError('bad');
    return { identity, mapId: id, revision: body.revision, reaction: body.reaction };
  }
  if (path === '/community/report') {
    if (!exactKeys(body, ['cid', 'mapId', 'revision', 'reason'])) throw new ApiError('fields');
    const identity = cid(body.cid);
    const id = mapId(body.mapId);
    if (!identity || !id || !positiveInt(body.revision) || !REPORT_SET.has(body.reason)) {
      throw new ApiError('bad');
    }
    return { identity, mapId: id, revision: body.revision, reason: body.reason };
  }
  if (path === '/community/admin/status') {
    if (!exactKeys(body, ['key', 'mapId', 'status'])) throw new ApiError('fields');
    const id = mapId(body.mapId);
    if (typeof body.key !== 'string' || !id || !['restore', 'disable'].includes(body.status)) {
      throw new ApiError('bad');
    }
    return { key: body.key, mapId: id, action: body.status };
  }
  throw new ApiError('notfound', 404);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function reactions(row) {
  return {
    fun: Number(row.reactionFun || 0),
    challenging: Number(row.reactionChallenging || 0),
    beautiful: Number(row.reactionBeautiful || 0),
  };
}

function listItem(row, ownerHash) {
  return {
    mapId: row.mapId,
    revision: Number(row.revision),
    tier: row.tier,
    mapSize: row.mapSize,
    mapStyle: row.mapStyle,
    biome: row.biome,
    quest: row.quest,
    status: row.status,
    owned: row.ownerHash === ownerHash,
    externalRuns: Number(row.externalRuns || 0),
    externalCompletions: Number(row.externalCompletions || 0),
    reactions: reactions(row),
    publishedAt: Number(row.publishedAt),
  };
}

function responseSnapshot(row) {
  const data = typeof row.mapJson === 'string' ? JSON.parse(row.mapJson) : row.mapJson;
  const snapshot = sanitizeCommunitySnapshot({
    v: COMMUNITY_SCHEMA_VERSION,
    id: row.mapId,
    revision: Number(row.revision),
    tier: row.tier,
    mapSize: row.mapSize,
    mapStyle: row.mapStyle,
    data,
  });
  if (!snapshot) throw new ApiError('corrupt', 500);
  return snapshot;
}

function statsRow() {
  return {
    externalRuns: 0,
    externalCompletions: 0,
    reactionFun: 0,
    reactionChallenging: 0,
    reactionBeautiful: 0,
    reportCount: 0,
  };
}

function reactionField(value) {
  return { fun: 'reactionFun', challenging: 'reactionChallenging', beautiful: 'reactionBeautiful' }[value];
}

class CommunityApi {
  constructor(env = {}, { origin = COMMUNITY_ORIGIN, cooldownMs } = {}) {
    this.env = env || {};
    this.origin = origin;
    const configured = Number(cooldownMs ?? this.env.COMMUNITY_PUBLISH_COOLDOWN_MS);
    this.cooldownMs = Number.isFinite(configured) && configured >= 0
      ? configured : COMMUNITY_PUBLISH_COOLDOWN_MS;
    this.mutationIp = new Map();
    this.publishIp = new Map();
    this.reportIp = new Map();
  }

  _headers() {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': this.origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }

  _json(value, status = 200) {
    return new Response(JSON.stringify(value), { status, headers: this._headers() });
  }

  _ipAllowed(bucket, ip, now, max) {
    let row = bucket.get(ip);
    if (!row || now - row.t0 >= 60_000) row = { n: 0, t0: now };
    row.n++;
    bucket.set(ip, row);
    if (bucket.size > 2000) bucket.clear();
    return row.n <= max;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const requestOrigin = request.headers.get('Origin');
    if (this.origin !== '*' && requestOrigin && requestOrigin !== this.origin) {
      return this._json({ error: 'origin' }, 403);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: this._headers() });
    if (path === '/community/health') {
      if (request.method !== 'GET') return this._json({ error: 'method' }, 405);
      return this._json({ ok: true, schema: COMMUNITY_SCHEMA_VERSION });
    }
    if (!path.startsWith('/community/')) return this._json({ error: 'notfound' }, 404);
    if (request.method !== 'POST') return this._json({ error: 'method' }, 405);

    const limit = path === '/community/publish' ? COMMUNITY_PUBLISH_BODY_BYTES : COMMUNITY_BODY_BYTES;
    const declared = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declared) && declared > limit) return this._json({ error: 'big' }, 413);
    const now = Date.now();
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'x';
    if (MUTATION_PATHS.has(path) && !this._ipAllowed(this.mutationIp, ip, now, 120)) {
      return this._json({ error: 'rate' }, 429);
    }
    if (path === '/community/publish' && !this._ipAllowed(this.publishIp, ip, now, 30)) {
      return this._json({ error: 'rate' }, 429);
    }
    if (path === '/community/report' && !this._ipAllowed(this.reportIp, ip, now, 10)) {
      return this._json({ error: 'rate' }, 429);
    }

    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > limit) throw new ApiError('big', 413);
      let body;
      try { body = JSON.parse(decoder.decode(bytes)); } catch { throw new ApiError('bad'); }
      const parsed = command(path, body);
      if (path === '/community/admin/status') {
        if (!this.env.ADMIN_KEY || parsed.key !== this.env.ADMIN_KEY) throw new ApiError('no', 403);
        return this._json(await this.adminStatus(parsed, now));
      }
      const ownerHash = await sha256(parsed.identity);
      if (path === '/community/publish') return this._json(await this.publish(parsed, ownerHash, now));
      if (path === '/community/unpublish') return this._json(await this.unpublish(parsed, ownerHash, now));
      if (path === '/community/list') return this._json(await this.list(parsed, ownerHash, now));
      if (path === '/community/map') return this._json(await this.map(parsed, ownerHash));
      if (path === '/community/run/start') return this._json(await this.start(parsed, ownerHash, now));
      if (path === '/community/complete') return this._json(await this.complete(parsed, ownerHash, now));
      if (path === '/community/react') return this._json(await this.react(parsed, ownerHash, now));
      if (path === '/community/report') return this._json(await this.report(parsed, ownerHash, now));
      throw new ApiError('notfound', 404);
    } catch (error) {
      if (error instanceof ApiError) return this._json({ error: error.code }, error.status);
      console.error('[community]', error);
      return this._json({ error: 'server' }, 500);
    }
  }
}

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS maps (
  map_id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot IN (0, 1)),
  current_revision INTEGER NOT NULL,
  available_from_revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('active', 'unpublished', 'quarantined', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_published_at INTEGER NOT NULL,
  UNIQUE (owner_hash, slot)
);
CREATE INDEX IF NOT EXISTS maps_owner_idx ON maps (owner_hash);
CREATE INDEX IF NOT EXISTS maps_catalog_idx ON maps (status, updated_at DESC);
CREATE TABLE IF NOT EXISTS revisions (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('base', 'plus')),
  map_size TEXT NOT NULL,
  map_style TEXT NOT NULL,
  biome TEXT NOT NULL,
  quest TEXT NOT NULL,
  map_json TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, revision),
  FOREIGN KEY (map_id) REFERENCES maps(map_id)
);
CREATE TRIGGER IF NOT EXISTS revisions_immutable_update
BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT, 'immutable revision'); END;
CREATE TRIGGER IF NOT EXISTS revisions_immutable_delete
BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT, 'immutable revision'); END;
CREATE TABLE IF NOT EXISTS revision_stats (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  external_runs INTEGER NOT NULL DEFAULT 0,
  external_completions INTEGER NOT NULL DEFAULT 0,
  reaction_fun INTEGER NOT NULL DEFAULT 0,
  reaction_challenging INTEGER NOT NULL DEFAULT 0,
  reaction_beautiful INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (map_id, revision),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
CREATE TABLE IF NOT EXISTS runs (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  coop INTEGER NOT NULL,
  has_external INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, revision, run_id),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
CREATE TABLE IF NOT EXISTS run_participants (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  player_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, revision, run_id, player_hash),
  FOREIGN KEY (map_id, revision, run_id) REFERENCES runs(map_id, revision, run_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS run_participants_player_idx ON run_participants (player_hash, started_at);
CREATE TABLE IF NOT EXISTS completions (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  player_hash TEXT NOT NULL,
  run_id TEXT NOT NULL,
  coop INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, revision, player_hash),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
CREATE TABLE IF NOT EXISTS completion_attempts (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  player_hash TEXT NOT NULL,
  run_id TEXT NOT NULL,
  external INTEGER NOT NULL,
  first_completion INTEGER NOT NULL,
  reward_week_id TEXT,
  reward_crystals INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, revision, player_hash, run_id),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
CREATE TABLE IF NOT EXISTS reactions (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  player_hash TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('fun', 'challenging', 'beautiful')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, revision, player_hash),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
CREATE TABLE IF NOT EXISTS reports (
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  player_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('inappropriate', 'broken', 'spam')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (map_id, revision, player_hash),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
CREATE TABLE IF NOT EXISTS weekly_freezes (
  week_id TEXT PRIMARY KEY,
  frozen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS weekly_entries (
  week_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  PRIMARY KEY (week_id, position),
  UNIQUE (week_id, map_id),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
CREATE TABLE IF NOT EXISTS weekly_claims (
  week_id TEXT NOT NULL,
  player_hash TEXT NOT NULL,
  map_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (week_id, player_hash),
  FOREIGN KEY (map_id, revision) REFERENCES revisions(map_id, revision)
);
`;

const ITEM_SELECT = `
SELECT m.map_id AS mapId, m.owner_hash AS ownerHash, m.status AS status,
  r.revision AS revision, r.tier AS tier, r.map_size AS mapSize, r.map_style AS mapStyle,
  r.biome AS biome, r.quest AS quest, r.published_at AS publishedAt,
  s.external_runs AS externalRuns, s.external_completions AS externalCompletions,
  s.reaction_fun AS reactionFun, s.reaction_challenging AS reactionChallenging,
  s.reaction_beautiful AS reactionBeautiful, s.report_count AS reportCount
FROM maps m
JOIN revisions r ON r.map_id = m.map_id
JOIN revision_stats s ON s.map_id = r.map_id AND s.revision = r.revision`;

export class Community extends CommunityApi {
  constructor(state, env) {
    super(env);
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(SCHEMA_SQL);
  }

  _rows(sql, ...params) {
    return this.sql.exec(sql, ...params).toArray();
  }

  _one(sql, ...params) {
    return this._rows(sql, ...params)[0] || null;
  }

  _transaction(fn) {
    return this.state.storage.transactionSync(fn);
  }

  _mapRow(id) {
    return this._one(`SELECT map_id AS mapId, owner_hash AS ownerHash, slot, current_revision AS currentRevision,
      available_from_revision AS availableFromRevision, status, created_at AS createdAt,
      updated_at AS updatedAt, last_published_at AS lastPublishedAt FROM maps WHERE map_id = ?`, id);
  }

  _revisionRow(id, revision) {
    return this._one(`SELECT map_id AS mapId, revision, tier, map_size AS mapSize, map_style AS mapStyle,
      biome, quest, map_json AS mapJson, published_at AS publishedAt
      FROM revisions WHERE map_id = ? AND revision = ?`, id, revision);
  }

  _accessible(id, revision, ownerHash, { ownerQuarantine = false } = {}) {
    const map = this._mapRow(id);
    if (!map) throw new ApiError('none', 404);
    const owned = map.ownerHash === ownerHash;
    const allowedStatus = map.status === 'active' || (ownerQuarantine && owned && map.status === 'quarantined');
    if (!allowedStatus || revision < Number(map.availableFromRevision)) throw new ApiError('none', 404);
    const row = this._revisionRow(id, revision);
    if (!row) throw new ApiError('none', 404);
    return { map, row, owned };
  }

  publish(d, ownerHash, now) {
    return this._transaction(() => {
      const dayCount = this._one(`SELECT COUNT(*) AS n FROM revisions r JOIN maps m ON m.map_id = r.map_id
        WHERE m.owner_hash = ? AND r.published_at >= ?`, ownerHash, utcDayStart(now));
      if (Number(dayCount?.n || 0) >= COMMUNITY_PUBLISH_DAY_MAX) throw new ApiError('daily', 429);

      let map = this._one(`SELECT map_id AS mapId, current_revision AS currentRevision,
        available_from_revision AS availableFromRevision, status, last_published_at AS lastPublishedAt
        FROM maps WHERE owner_hash = ? AND slot = ?`, ownerHash, d.slot);
      if (map && now - Number(map.lastPublishedAt) < this.cooldownMs) throw new ApiError('slow', 429);
      if (map?.status === 'quarantined') throw new ApiError('quarantined', 409);
      if (map?.status === 'disabled') throw new ApiError('disabled', 409);

      let id = map?.mapId;
      if (!id) {
        for (let attempt = 0; attempt < 8 && !id; attempt++) {
          const candidate = randomMapId();
          if (!this._one('SELECT map_id FROM maps WHERE map_id = ?', candidate)) id = candidate;
        }
        if (!id) throw new ApiError('busy', 503);
        this.sql.exec(`INSERT INTO maps
          (map_id, owner_hash, slot, current_revision, available_from_revision, status, created_at, updated_at, last_published_at)
          VALUES (?, ?, ?, 0, 1, 'unpublished', ?, ?, ?)`, id, ownerHash, d.slot, now, now, 0);
        map = { mapId: id, currentRevision: 0, availableFromRevision: 1, status: 'unpublished', lastPublishedAt: 0 };
      }

      const revision = Number(map.currentRevision) + 1;
      const mapJson = JSON.stringify(d.map);
      this.sql.exec(`INSERT INTO revisions
        (map_id, revision, tier, map_size, map_style, biome, quest, map_json, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, revision, d.tier, d.mapSize, d.mapStyle, d.map.biome, primaryQuest(d.map), mapJson, now);
      this.sql.exec('INSERT INTO revision_stats (map_id, revision) VALUES (?, ?)', id, revision);
      this.sql.exec(`UPDATE maps SET current_revision = ?, status = 'active', updated_at = ?, last_published_at = ?
        WHERE map_id = ?`, revision, now, now, id);
      return { ok: true, mapId: id, revision, tier: d.tier, share: `?community=${id}&r=${revision}` };
    });
  }

  unpublish(d, ownerHash, now) {
    return this._transaction(() => {
      const map = this._mapRow(d.mapId);
      if (!map) throw new ApiError('none', 404);
      if (map.ownerHash !== ownerHash) throw new ApiError('owner', 403);
      if (map.status === 'unpublished') return { ok: true, mapId: d.mapId, status: 'unpublished' };
      if (map.status !== 'active') throw new ApiError(map.status, 409);
      this.sql.exec(`UPDATE maps SET status = 'unpublished', available_from_revision = current_revision + 1,
        updated_at = ? WHERE map_id = ?`, now, d.mapId);
      return { ok: true, mapId: d.mapId, status: 'unpublished' };
    });
  }

  _freezeWeekly(weekId, now) {
    this._transaction(() => {
      if (this._one('SELECT week_id FROM weekly_freezes WHERE week_id = ?', weekId)) return;
      this.sql.exec('INSERT INTO weekly_freezes (week_id, frozen_at) VALUES (?, ?)', weekId, now);
      const candidates = this._rows(`WITH candidates AS (
        SELECT m.map_id AS mapId, m.owner_hash AS ownerHash, m.current_revision AS revision,
          (s.external_completions * 2 + s.reaction_fun + s.reaction_challenging + s.reaction_beautiful) AS score,
          r.published_at AS publishedAt,
          ROW_NUMBER() OVER (PARTITION BY m.owner_hash ORDER BY
            (s.external_completions * 2 + s.reaction_fun + s.reaction_challenging + s.reaction_beautiful) DESC,
            r.published_at DESC, m.map_id ASC) AS ownerRank
        FROM maps m
        JOIN revisions r ON r.map_id = m.map_id AND r.revision = m.current_revision
        JOIN revision_stats s ON s.map_id = r.map_id AND s.revision = r.revision
        WHERE m.status = 'active' AND m.current_revision >= m.available_from_revision
      ) SELECT mapId, ownerHash, revision FROM candidates WHERE ownerRank = 1
        ORDER BY score DESC, publishedAt DESC, mapId ASC LIMIT ?`, COMMUNITY_WEEKLY_MAX);
      candidates.forEach((row, index) => this.sql.exec(
        'INSERT INTO weekly_entries (week_id, position, map_id, revision) VALUES (?, ?, ?, ?)',
        weekId, index + 1, row.mapId, row.revision
      ));
    });
  }

  list(d, ownerHash, now) {
    if (d.tab === 'weekly') {
      const weekId = communityWeekId(now);
      this._freezeWeekly(weekId, now);
      const rows = this._rows(`${ITEM_SELECT}
        JOIN weekly_entries e ON e.map_id = r.map_id AND e.revision = r.revision
        WHERE e.week_id = ? AND m.status = 'active' AND e.revision >= m.available_from_revision
        ORDER BY e.position ASC LIMIT ?`, weekId, COMMUNITY_WEEKLY_MAX);
      return { ok: true, tab: d.tab, weekId, items: rows.map((row) => listItem(row, ownerHash)) };
    }

    const where = d.tab === 'my'
      ? 'WHERE m.owner_hash = ? AND r.revision = m.current_revision'
      : `WHERE m.status = 'active' AND r.revision = m.current_revision
          AND m.current_revision >= m.available_from_revision`;
    const order = d.tab === 'popular'
      ? `ORDER BY (s.external_completions * 2 + s.reaction_fun + s.reaction_challenging
          + s.reaction_beautiful) DESC, r.published_at DESC, m.map_id ASC`
      : 'ORDER BY r.published_at DESC, m.map_id ASC';
    const rows = d.tab === 'my'
      ? this._rows(`${ITEM_SELECT} ${where} ${order} LIMIT ?`, ownerHash, COMMUNITY_CATALOG_MAX)
      : this._rows(`${ITEM_SELECT} ${where} ${order} LIMIT ?`, COMMUNITY_CATALOG_MAX);
    return { ok: true, tab: d.tab, items: rows.map((row) => listItem(row, ownerHash)) };
  }

  map(d, ownerHash) {
    const map = this._mapRow(d.mapId);
    if (!map) throw new ApiError('none', 404);
    const revision = d.revision || Number(map.currentRevision);
    const access = this._accessible(d.mapId, revision, ownerHash, { ownerQuarantine: true });
    return { ok: true, owned: access.owned, status: access.map.status, cm: responseSnapshot(access.row) };
  }

  start(d, ownerHash, now) {
    return this._transaction(() => {
      const cutoff = now - RUN_RETENTION_MS;
      this.sql.exec('DELETE FROM run_participants WHERE started_at < ?', cutoff);
      this.sql.exec('DELETE FROM runs WHERE started_at < ?', cutoff);
      const access = this._accessible(d.mapId, d.revision, ownerHash);
      const participant = this._one(`SELECT player_hash FROM run_participants
        WHERE map_id = ? AND revision = ? AND run_id = ? AND player_hash = ?`,
      d.mapId, d.revision, d.runId, ownerHash);
      if (!participant) {
        const starts = this._one(`SELECT COUNT(*) AS n FROM run_participants
          WHERE player_hash = ? AND started_at >= ?`, ownerHash, utcDayStart(now));
        if (Number(starts?.n || 0) >= COMMUNITY_RUN_DAY_MAX) throw new ApiError('daily', 429);
      }
      let run = this._one(`SELECT coop, has_external AS hasExternal FROM runs
        WHERE map_id = ? AND revision = ? AND run_id = ?`, d.mapId, d.revision, d.runId);
      if (run && Boolean(run.coop) !== d.coop) throw new ApiError('run_conflict', 409);
      if (!run) {
        this.sql.exec(`INSERT INTO runs (map_id, revision, run_id, coop, has_external, started_at)
          VALUES (?, ?, ?, ?, 0, ?)`, d.mapId, d.revision, d.runId, d.coop ? 1 : 0, now);
        run = { coop: d.coop ? 1 : 0, hasExternal: 0 };
      }
      if (!participant) this.sql.exec(`INSERT INTO run_participants
        (map_id, revision, run_id, player_hash, started_at) VALUES (?, ?, ?, ?, ?)`,
      d.mapId, d.revision, d.runId, ownerHash, now);
      const external = !access.owned;
      if (external && !Number(run.hasExternal)) {
        this.sql.exec(`UPDATE runs SET has_external = 1 WHERE map_id = ? AND revision = ? AND run_id = ?`,
          d.mapId, d.revision, d.runId);
        this.sql.exec(`UPDATE revision_stats SET external_runs = external_runs + 1
          WHERE map_id = ? AND revision = ?`, d.mapId, d.revision);
      }
      return { ok: true, external };
    });
  }

  complete(d, ownerHash, now) {
    return this._transaction(() => {
      const access = this._accessible(d.mapId, d.revision, ownerHash);
      const run = this._one(`SELECT coop, has_external AS hasExternal, started_at AS startedAt FROM runs
        WHERE map_id = ? AND revision = ? AND run_id = ?`, d.mapId, d.revision, d.runId);
      if (!run) throw new ApiError('run', 409);
      if (Boolean(run.coop) !== d.coop) throw new ApiError('run_conflict', 409);
      const participant = this._one(`SELECT player_hash FROM run_participants
        WHERE map_id = ? AND revision = ? AND run_id = ? AND player_hash = ?`,
      d.mapId, d.revision, d.runId, ownerHash);
      if (!participant) throw new ApiError('run', 409);
      if (!access.owned && !Number(run.hasExternal)) {
        this.sql.exec(`UPDATE runs SET has_external = 1 WHERE map_id = ? AND revision = ? AND run_id = ?`,
          d.mapId, d.revision, d.runId);
        this.sql.exec(`UPDATE revision_stats SET external_runs = external_runs + 1
          WHERE map_id = ? AND revision = ?`, d.mapId, d.revision);
      }
      const existing = this._one(`SELECT run_id AS runId FROM completions
        WHERE map_id = ? AND revision = ? AND player_hash = ?`, d.mapId, d.revision, ownerHash);
      if (!existing) {
        this.sql.exec(`INSERT INTO completions (map_id, revision, player_hash, run_id, coop, completed_at)
          VALUES (?, ?, ?, ?, ?, ?)`, d.mapId, d.revision, ownerHash, d.runId, d.coop ? 1 : 0, now);
        if (!access.owned) this.sql.exec(`UPDATE revision_stats SET external_completions = external_completions + 1
          WHERE map_id = ? AND revision = ?`, d.mapId, d.revision);
      }

      let reward = null;
      if (!access.owned) {
        const weekId = communityWeekId(now);
        if (communityWeekId(Number(run.startedAt)) === weekId) {
          const weekly = this._one(`SELECT map_id FROM weekly_entries
            WHERE week_id = ? AND map_id = ? AND revision = ?`, weekId, d.mapId, d.revision);
          if (weekly) {
            let claim = this._one(`SELECT map_id AS mapId, revision, run_id AS runId FROM weekly_claims
              WHERE week_id = ? AND player_hash = ?`, weekId, ownerHash);
            if (!claim) {
              this.sql.exec(`INSERT INTO weekly_claims
                (week_id, player_hash, map_id, revision, run_id, claimed_at) VALUES (?, ?, ?, ?, ?, ?)`,
              weekId, ownerHash, d.mapId, d.revision, d.runId, now);
              claim = { mapId: d.mapId, revision: d.revision, runId: d.runId };
            }
            if (claim.mapId === d.mapId && Number(claim.revision) === d.revision && claim.runId === d.runId) {
              reward = { weekId, crystals: COMMUNITY_WEEKLY_REWARD };
            }
          }
        }
      }
      return { ok: true, external: !access.owned, first: !existing, reward };
    });
  }

  react(d, ownerHash, now) {
    return this._transaction(() => {
      const access = this._accessible(d.mapId, d.revision, ownerHash);
      if (access.owned) throw new ApiError('owner', 403);
      const complete = this._one(`SELECT player_hash FROM completions
        WHERE map_id = ? AND revision = ? AND player_hash = ?`, d.mapId, d.revision, ownerHash);
      if (!complete) throw new ApiError('completion', 403);
      const old = this._one(`SELECT reaction FROM reactions
        WHERE map_id = ? AND revision = ? AND player_hash = ?`, d.mapId, d.revision, ownerHash)?.reaction || null;
      if (old !== d.reaction) {
        if (old) {
          const column = { fun: 'reaction_fun', challenging: 'reaction_challenging', beautiful: 'reaction_beautiful' }[old];
          this.sql.exec(`UPDATE revision_stats SET ${column} = MAX(0, ${column} - 1)
            WHERE map_id = ? AND revision = ?`, d.mapId, d.revision);
        }
        if (d.reaction) {
          const column = { fun: 'reaction_fun', challenging: 'reaction_challenging', beautiful: 'reaction_beautiful' }[d.reaction];
          this.sql.exec(`INSERT INTO reactions (map_id, revision, player_hash, reaction, updated_at)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT (map_id, revision, player_hash)
            DO UPDATE SET reaction = excluded.reaction, updated_at = excluded.updated_at`,
          d.mapId, d.revision, ownerHash, d.reaction, now);
          this.sql.exec(`UPDATE revision_stats SET ${column} = ${column} + 1
            WHERE map_id = ? AND revision = ?`, d.mapId, d.revision);
        } else {
          this.sql.exec(`DELETE FROM reactions WHERE map_id = ? AND revision = ? AND player_hash = ?`,
            d.mapId, d.revision, ownerHash);
        }
      }
      const stats = this._one(`SELECT reaction_fun AS reactionFun, reaction_challenging AS reactionChallenging,
        reaction_beautiful AS reactionBeautiful FROM revision_stats WHERE map_id = ? AND revision = ?`,
      d.mapId, d.revision);
      return { ok: true, reaction: d.reaction, reactions: reactions(stats) };
    });
  }

  report(d, ownerHash, now) {
    return this._transaction(() => {
      const map = this._mapRow(d.mapId);
      if (!map) throw new ApiError('none', 404);
      if (map.ownerHash === ownerHash) throw new ApiError('owner', 403);
      if (d.revision < Number(map.availableFromRevision) || !this._revisionRow(d.mapId, d.revision)) {
        throw new ApiError('none', 404);
      }
      const old = this._one(`SELECT reason FROM reports
        WHERE map_id = ? AND revision = ? AND player_hash = ?`, d.mapId, d.revision, ownerHash);
      if (map.status !== 'active') {
        if (map.status === 'quarantined' && old) {
          return { ok: true, reported: true, quarantined: true, status: 'quarantined' };
        }
        throw new ApiError('none', 404);
      }
      if (!old) {
        this.sql.exec(`INSERT INTO reports (map_id, revision, player_hash, reason, created_at)
          VALUES (?, ?, ?, ?, ?)`, d.mapId, d.revision, ownerHash, d.reason, now);
        this.sql.exec(`UPDATE revision_stats SET report_count = report_count + 1
          WHERE map_id = ? AND revision = ?`, d.mapId, d.revision);
      }
      const count = this._one('SELECT COUNT(DISTINCT player_hash) AS n FROM reports WHERE map_id = ?', d.mapId);
      const quarantined = Number(count?.n || 0) >= 3;
      if (quarantined) this.sql.exec(`UPDATE maps SET status = 'quarantined', updated_at = ? WHERE map_id = ?`, now, d.mapId);
      return { ok: true, reported: true, quarantined, status: quarantined ? 'quarantined' : 'active' };
    });
  }

  adminStatus(d, now) {
    return this._transaction(() => {
      const map = this._mapRow(d.mapId);
      if (!map) throw new ApiError('none', 404);
      if (d.action === 'disable') {
        if (map.status === 'unpublished') throw new ApiError('status', 409);
        this.sql.exec(`UPDATE maps SET status = 'disabled', updated_at = ? WHERE map_id = ?`, now, d.mapId);
        return { ok: true, mapId: d.mapId, status: 'disabled' };
      }
      if (!['quarantined', 'disabled'].includes(map.status)) throw new ApiError('status', 409);
      this.sql.exec('DELETE FROM reports WHERE map_id = ?', d.mapId);
      this.sql.exec('UPDATE revision_stats SET report_count = 0 WHERE map_id = ?', d.mapId);
      this.sql.exec(`UPDATE maps SET status = 'active', updated_at = ? WHERE map_id = ?`, now, d.mapId);
      return { ok: true, mapId: d.mapId, status: 'active' };
    });
  }
}

export class MemoryCommunity extends CommunityApi {
  constructor({ adminKey = '', cooldownMs } = {}) {
    super({ ADMIN_KEY: adminKey }, { origin: '*', cooldownMs });
    this.maps = new Map();
    this.ownerSlots = new Map();
    this.revisions = new Map();
    this.stats = new Map();
    this.runs = new Map();
    this.runParticipants = new Map();
    this.completions = new Map();
    this.playerReactions = new Map();
    this.playerReports = new Map();
    this.weeklyFreezes = new Set();
    this.weeklyEntries = new Map();
    this.weeklyClaims = new Map();
  }

  _revisionKey(id, revision) { return `${id}|${revision}`; }
  _runKey(id, revision, run) { return `${id}|${revision}|${run}`; }
  _participantKey(id, revision, run, player) { return `${id}|${revision}|${run}|${player}`; }
  _playerKey(id, revision, player) { return `${id}|${revision}|${player}`; }

  _mapRow(id) { return this.maps.get(id) || null; }
  _revisionRow(id, revision) { return this.revisions.get(this._revisionKey(id, revision)) || null; }

  _accessible(id, revision, ownerHash, { ownerQuarantine = false } = {}) {
    const map = this._mapRow(id);
    if (!map) throw new ApiError('none', 404);
    const owned = map.ownerHash === ownerHash;
    const allowedStatus = map.status === 'active' || (ownerQuarantine && owned && map.status === 'quarantined');
    if (!allowedStatus || revision < map.availableFromRevision) throw new ApiError('none', 404);
    const row = this._revisionRow(id, revision);
    if (!row) throw new ApiError('none', 404);
    return { map, row, owned };
  }

  publish(d, ownerHash, now) {
    let count = 0;
    const dayStart = utcDayStart(now);
    for (const revision of this.revisions.values()) {
      if (this.maps.get(revision.mapId)?.ownerHash === ownerHash && revision.publishedAt >= dayStart) count++;
    }
    if (count >= COMMUNITY_PUBLISH_DAY_MAX) throw new ApiError('daily', 429);

    const slotKey = `${ownerHash}|${d.slot}`;
    let map = this.maps.get(this.ownerSlots.get(slotKey));
    if (map && now - map.lastPublishedAt < this.cooldownMs) throw new ApiError('slow', 429);
    if (map?.status === 'quarantined') throw new ApiError('quarantined', 409);
    if (map?.status === 'disabled') throw new ApiError('disabled', 409);
    if (!map) {
      let id = '';
      for (let attempt = 0; attempt < 8 && !id; attempt++) {
        const candidate = randomMapId();
        if (!this.maps.has(candidate)) id = candidate;
      }
      if (!id) throw new ApiError('busy', 503);
      map = {
        mapId: id, ownerHash, slot: d.slot, currentRevision: 0, availableFromRevision: 1,
        status: 'unpublished', createdAt: now, updatedAt: now, lastPublishedAt: 0,
      };
      this.maps.set(id, map);
      this.ownerSlots.set(slotKey, id);
    }
    const revision = map.currentRevision + 1;
    const row = {
      mapId: map.mapId, revision, tier: d.tier, mapSize: d.mapSize, mapStyle: d.mapStyle,
      biome: d.map.biome, quest: primaryQuest(d.map), mapJson: JSON.stringify(d.map), publishedAt: now,
    };
    this.revisions.set(this._revisionKey(map.mapId, revision), Object.freeze(row));
    this.stats.set(this._revisionKey(map.mapId, revision), statsRow());
    Object.assign(map, { currentRevision: revision, status: 'active', updatedAt: now, lastPublishedAt: now });
    return {
      ok: true, mapId: map.mapId, revision, tier: d.tier,
      share: `?community=${map.mapId}&r=${revision}`,
    };
  }

  unpublish(d, ownerHash, now) {
    const map = this._mapRow(d.mapId);
    if (!map) throw new ApiError('none', 404);
    if (map.ownerHash !== ownerHash) throw new ApiError('owner', 403);
    if (map.status === 'unpublished') return { ok: true, mapId: d.mapId, status: 'unpublished' };
    if (map.status !== 'active') throw new ApiError(map.status, 409);
    Object.assign(map, { status: 'unpublished', availableFromRevision: map.currentRevision + 1, updatedAt: now });
    return { ok: true, mapId: d.mapId, status: 'unpublished' };
  }

  _itemRow(map, revision) {
    const row = this._revisionRow(map.mapId, revision);
    if (!row) return null;
    return { ...row, ...this.stats.get(this._revisionKey(map.mapId, revision)), ownerHash: map.ownerHash, status: map.status };
  }

  _score(row) {
    return row.externalCompletions * 2 + row.reactionFun + row.reactionChallenging + row.reactionBeautiful;
  }

  _freezeWeekly(weekId) {
    if (this.weeklyFreezes.has(weekId)) return;
    this.weeklyFreezes.add(weekId);
    const best = new Map();
    for (const map of this.maps.values()) {
      if (map.status !== 'active' || map.currentRevision < map.availableFromRevision) continue;
      const row = this._itemRow(map, map.currentRevision);
      const previous = best.get(map.ownerHash);
      if (!previous || this._score(row) > this._score(previous)
        || (this._score(row) === this._score(previous) && row.publishedAt > previous.publishedAt)
        || (this._score(row) === this._score(previous) && row.publishedAt === previous.publishedAt && row.mapId < previous.mapId)) {
        best.set(map.ownerHash, row);
      }
    }
    const rows = [...best.values()].sort((a, b) => this._score(b) - this._score(a)
      || b.publishedAt - a.publishedAt || a.mapId.localeCompare(b.mapId)).slice(0, COMMUNITY_WEEKLY_MAX);
    this.weeklyEntries.set(weekId, rows.map((row) => ({ mapId: row.mapId, revision: row.revision })));
  }

  list(d, ownerHash, now) {
    if (d.tab === 'weekly') {
      const weekId = communityWeekId(now);
      this._freezeWeekly(weekId);
      const rows = (this.weeklyEntries.get(weekId) || []).map((entry) => {
        const map = this._mapRow(entry.mapId);
        if (!map || map.status !== 'active' || entry.revision < map.availableFromRevision) return null;
        return this._itemRow(map, entry.revision);
      }).filter(Boolean);
      return { ok: true, tab: d.tab, weekId, items: rows.map((row) => listItem(row, ownerHash)) };
    }
    let rows = [...this.maps.values()]
      .filter((map) => d.tab === 'my'
        ? map.ownerHash === ownerHash
        : map.status === 'active' && map.currentRevision >= map.availableFromRevision)
      .map((map) => this._itemRow(map, map.currentRevision)).filter(Boolean);
    rows.sort(d.tab === 'popular'
      ? (a, b) => this._score(b) - this._score(a) || b.publishedAt - a.publishedAt || a.mapId.localeCompare(b.mapId)
      : (a, b) => b.publishedAt - a.publishedAt || a.mapId.localeCompare(b.mapId));
    rows = rows.slice(0, COMMUNITY_CATALOG_MAX);
    return { ok: true, tab: d.tab, items: rows.map((row) => listItem(row, ownerHash)) };
  }

  map(d, ownerHash) {
    const map = this._mapRow(d.mapId);
    if (!map) throw new ApiError('none', 404);
    const revision = d.revision || map.currentRevision;
    const access = this._accessible(d.mapId, revision, ownerHash, { ownerQuarantine: true });
    return { ok: true, owned: access.owned, status: access.map.status, cm: responseSnapshot(access.row) };
  }

  start(d, ownerHash, now) {
    const cutoff = now - RUN_RETENTION_MS;
    for (const [key, participant] of this.runParticipants) {
      if (participant.startedAt < cutoff) this.runParticipants.delete(key);
    }
    for (const [key, run] of this.runs) {
      if (run.startedAt >= cutoff) continue;
      this.runs.delete(key);
      for (const participantKey of this.runParticipants.keys()) {
        if (participantKey.startsWith(`${key}|`)) this.runParticipants.delete(participantKey);
      }
    }
    const access = this._accessible(d.mapId, d.revision, ownerHash);
    const participantKey = this._participantKey(d.mapId, d.revision, d.runId, ownerHash);
    const participant = this.runParticipants.get(participantKey);
    if (!participant) {
      let starts = 0;
      const dayStart = utcDayStart(now);
      for (const row of this.runParticipants.values()) {
        if (row.playerHash === ownerHash && row.startedAt >= dayStart) starts++;
      }
      if (starts >= COMMUNITY_RUN_DAY_MAX) throw new ApiError('daily', 429);
    }
    const key = this._runKey(d.mapId, d.revision, d.runId);
    let run = this.runs.get(key);
    if (run && run.coop !== d.coop) throw new ApiError('run_conflict', 409);
    if (!run) {
      run = { coop: d.coop, hasExternal: false, startedAt: now };
      this.runs.set(key, run);
    }
    if (!participant) this.runParticipants.set(participantKey, { playerHash: ownerHash, startedAt: now });
    const external = !access.owned;
    if (external && !run.hasExternal) {
      run.hasExternal = true;
      this.stats.get(this._revisionKey(d.mapId, d.revision)).externalRuns++;
    }
    return { ok: true, external };
  }

  complete(d, ownerHash, now) {
    const access = this._accessible(d.mapId, d.revision, ownerHash);
    const run = this.runs.get(this._runKey(d.mapId, d.revision, d.runId));
    if (!run) throw new ApiError('run', 409);
    if (run.coop !== d.coop) throw new ApiError('run_conflict', 409);
    if (!this.runParticipants.has(this._participantKey(d.mapId, d.revision, d.runId, ownerHash))) {
      throw new ApiError('run', 409);
    }
    if (!access.owned && !run.hasExternal) {
      run.hasExternal = true;
      this.stats.get(this._revisionKey(d.mapId, d.revision)).externalRuns++;
    }
    const completionKey = this._playerKey(d.mapId, d.revision, ownerHash);
    const existing = this.completions.get(completionKey);
    if (!existing) {
      this.completions.set(completionKey, { runId: d.runId, coop: d.coop, completedAt: now });
      if (!access.owned) this.stats.get(this._revisionKey(d.mapId, d.revision)).externalCompletions++;
    }
    let reward = null;
    if (!access.owned) {
      const weekId = communityWeekId(now);
      if (communityWeekId(run.startedAt) === weekId) {
        const weekly = (this.weeklyEntries.get(weekId) || [])
          .some((entry) => entry.mapId === d.mapId && entry.revision === d.revision);
        if (weekly) {
          const claimKey = `${weekId}|${ownerHash}`;
          let claim = this.weeklyClaims.get(claimKey);
          if (!claim) {
            claim = { mapId: d.mapId, revision: d.revision, runId: d.runId, claimedAt: now };
            this.weeklyClaims.set(claimKey, claim);
          }
          if (claim.mapId === d.mapId && claim.revision === d.revision && claim.runId === d.runId) {
            reward = { weekId, crystals: COMMUNITY_WEEKLY_REWARD };
          }
        }
      }
    }
    return { ok: true, external: !access.owned, first: !existing, reward };
  }

  react(d, ownerHash, now) {
    const access = this._accessible(d.mapId, d.revision, ownerHash);
    if (access.owned) throw new ApiError('owner', 403);
    if (!this.completions.has(this._playerKey(d.mapId, d.revision, ownerHash))) throw new ApiError('completion', 403);
    const key = this._playerKey(d.mapId, d.revision, ownerHash);
    const old = this.playerReactions.get(key)?.reaction || null;
    const stats = this.stats.get(this._revisionKey(d.mapId, d.revision));
    if (old !== d.reaction) {
      if (old) stats[reactionField(old)] = Math.max(0, stats[reactionField(old)] - 1);
      if (d.reaction) {
        this.playerReactions.set(key, { reaction: d.reaction, updatedAt: now });
        stats[reactionField(d.reaction)]++;
      } else this.playerReactions.delete(key);
    }
    return { ok: true, reaction: d.reaction, reactions: reactions(stats) };
  }

  report(d, ownerHash, now) {
    const map = this._mapRow(d.mapId);
    if (!map) throw new ApiError('none', 404);
    if (map.ownerHash === ownerHash) throw new ApiError('owner', 403);
    if (d.revision < map.availableFromRevision || !this._revisionRow(d.mapId, d.revision)) throw new ApiError('none', 404);
    const key = this._playerKey(d.mapId, d.revision, ownerHash);
    const old = this.playerReports.get(key);
    if (map.status !== 'active') {
      if (map.status === 'quarantined' && old) {
        return { ok: true, reported: true, quarantined: true, status: 'quarantined' };
      }
      throw new ApiError('none', 404);
    }
    if (!old) {
      this.playerReports.set(key, { mapId: d.mapId, revision: d.revision, playerHash: ownerHash, reason: d.reason, createdAt: now });
      this.stats.get(this._revisionKey(d.mapId, d.revision)).reportCount++;
    }
    const reporters = new Set();
    for (const report of this.playerReports.values()) if (report.mapId === d.mapId) reporters.add(report.playerHash);
    const quarantined = reporters.size >= 3;
    if (quarantined) Object.assign(map, { status: 'quarantined', updatedAt: now });
    return { ok: true, reported: true, quarantined, status: quarantined ? 'quarantined' : 'active' };
  }

  adminStatus(d, now) {
    const map = this._mapRow(d.mapId);
    if (!map) throw new ApiError('none', 404);
    if (d.action === 'disable') {
      if (map.status === 'unpublished') throw new ApiError('status', 409);
      Object.assign(map, { status: 'disabled', updatedAt: now });
      return { ok: true, mapId: d.mapId, status: 'disabled' };
    }
    if (!['quarantined', 'disabled'].includes(map.status)) throw new ApiError('status', 409);
    for (const [key, report] of this.playerReports) {
      if (report.mapId === d.mapId) this.playerReports.delete(key);
    }
    for (const [key, stats] of this.stats) {
      if (key.startsWith(`${d.mapId}|`)) stats.reportCount = 0;
    }
    Object.assign(map, { status: 'active', updatedAt: now });
    return { ok: true, mapId: d.mapId, status: 'active' };
  }
}
