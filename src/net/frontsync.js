// Wire boundary for World Front co-op. The host owns every transition; guests
// only receive a compact level spec (`fr`) and canonical snapshots (`frun`).
// Reward amounts never travel over the wire: clients derive them by replaying
// the one canonical CLAIM_OPERATION transition they just observed.
import { applyFrontEvent } from '../worldfront.js';
import { CARD_POOL } from '../runbuild.js';

const FRONT_VERSION = 1;
const TEMPLATES = new Set(['evacuation', 'outbreak', 'siege', 'hunt']);
const BOARD_STATUS = new Set(['available', 'active', 'completed', 'claimed']);
const ACTIVE_STATUS = new Set(['ready', 'active', 'completed']);
const COUNTRY_STATE = new Set(['peaceful', 'attacked', 'destroyed', 'rebuilding', 'saved']);
const PROJECTS = new Set(['medbay', 'workshop', 'radio']);
const BUILD_IDS = new Set(CARD_POOL.map((card) => card.id));

const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : lo));
const id = (v, max = 64) => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) ? v.slice(0, max) : '';
const rewardId = (v) => typeof v === 'string' && /^[A-Za-z0-9_:-]+$/.test(v) ? v.slice(0, 96) : '';
const country = (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : '';

function buildIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => id(x, 40)).filter((x) => BUILD_IDS.has(x)))].slice(0, 12);
}

// Compact start-level field. Short keys are deliberate: this travels with the
// existing start spec and is repeated for mid-join.
export function sanitizeFrontSpec(value) {
  const src = object(value);
  const operationId = id(src.o ?? src.operationId ?? src.id);
  if (!operationId) return null;
  return {
    g: int(src.g ?? src.generation, 0, 999999),
    o: operationId,
    s: int(src.s ?? src.stage, 0, 2),
    p: id(src.p ?? src.specialist, 24) || 'dispatcher',
    b: buildIds(src.b ?? src.build),
  };
}

export function frontSpecFromState(front, operation = null) {
  const src = object(front);
  const active = object(operation || src.active);
  return sanitizeFrontSpec({ ...active, generation: active.generation ?? src.generation });
}

export function expandFrontSpec(value) {
  const fr = sanitizeFrontSpec(value);
  return fr ? {
    generation: fr.g,
    operationId: fr.o,
    stage: fr.s,
    specialist: fr.p,
    build: [...fr.b],
  } : null;
}

// Snapshot deliberately excludes local-only stats and any renderer/timer data.
// It is a protocol sanitizer, not a replacement for worldfront.js validation.
export function sanitizeFrontSnapshot(value) {
  const src = object(value);
  if (src.v !== FRONT_VERSION) return null;

  const board = [];
  for (const raw of Array.isArray(src.board) ? src.board.slice(0, 3) : []) {
    const row = object(raw);
    const rowId = id(row.id);
    const rowCountry = country(row.country);
    if (!rowId || !rowCountry || !TEMPLATES.has(row.template)) continue;
    board.push({
      id: rowId,
      country: rowCountry,
      template: row.template,
      threat: int(row.threat, 1, 3),
      counterattack: row.counterattack === true,
      status: BOARD_STATUS.has(row.status) ? row.status : 'available',
    });
  }

  let active = null;
  const wireActive = frontSpecFromState(src);
  if (wireActive && board.some((row) => row.id === wireActive.o)) {
    const raw = object(src.active);
    active = {
      operationId: wireActive.o,
      stage: wireActive.s,
      specialist: wireActive.p,
      build: [...wireActive.b],
      status: ACTIVE_STATUS.has(raw.status) ? raw.status : 'active',
    };
  }

  const rawProjects = object(src.projects);
  const projects = {
    medbay: int(rawProjects.medbay, 0, 3),
    workshop: int(rawProjects.workshop, 0, 3),
    radio: int(rawProjects.radio, 0, 3),
  };
  const activeProject = PROJECTS.has(src.activeProject) ? src.activeProject : 'medbay';

  const restored = {};
  for (const [key, value] of Object.entries(object(src.restored)).slice(0, 32)) {
    const cid = country(key);
    if (cid) restored[cid] = int(value, 0, 3);
  }

  const claims = [...new Set((Array.isArray(src.claims) ? src.claims : [])
    .map(rewardId).filter(Boolean))].slice(-128);

  const rawWorld = object(src.world);
  const countries = {};
  for (const [key, value] of Object.entries(object(rawWorld.countries)).slice(0, 32)) {
    const cid = country(key);
    if (!cid) continue;
    const row = object(value);
    countries[cid] = { damage: int(row.damage, 0, 3), population: int(row.population, 20, 100) };
  }
  const world = {
    day: typeof rawWorld.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawWorld.day) ? rawWorld.day : '',
    countries,
  };

  return {
    v: FRONT_VERSION,
    seed: int(src.seed, 0, 0x7fffffff),
    generation: int(src.generation, 0, 999999),
    board,
    active,
    projects,
    activeProject,
    projectProgress: int(src.projectProgress, 0, 3),
    restored,
    world,
    claims,
  };
}

function resultState(value) {
  const src = object(value);
  return {
    state: COUNTRY_STATE.has(src.state) ? src.state : 'peaceful',
    damage: int(src.damage, 0, 3),
    population: int(src.population, 20, 100),
    restored: int(src.restored, 0, 3),
  };
}

export function sanitizeFrontResult(value) {
  const src = object(value);
  const rid = rewardId(src.id);
  const cid = country(src.countryId);
  if (!rid || !cid || typeof src.won !== 'boolean') return null;
  return {
    id: rid,
    countryId: cid,
    won: src.won,
    terminal: src.terminal === true,
    before: resultState(src.before),
    after: resultState(src.after),
  };
}

export function sanitizeFrontRewards(effects) {
  const rewards = [];
  for (const raw of Array.isArray(effects) ? effects : []) {
    const row = object(raw);
    if (row.type && row.type !== 'grant') continue;
    const rid = rewardId(row.rewardId ?? row.id);
    if (!rid) continue;
    rewards.push([
      rid,
      int(row.coins, 0, 100000),
      int(row.crystals, 0, 10000),
      int(row.eggs, 0, 100),
    ]);
  }
  return rewards.slice(0, 4);
}

export function expandFrontRewards(value) {
  return (Array.isArray(value) ? value : []).map((row) => ({
    type: 'grant', rewardId: row[0], coins: row[1], crystals: row[2], eggs: row[3],
  }));
}

export function canonicalFrontRewards(previousValue, nextValue) {
  const previous = sanitizeFrontSnapshot(previousValue);
  const next = sanitizeFrontSnapshot(nextValue);
  if (!previous || !next) return [];
  const candidates = [applyFrontEvent(previous, { type: 'CLAIM_OPERATION' })];
  candidates.push(applyFrontEvent(previous, { type: 'COMPLETE_OPERATION', build: [] }));
  const completed = applyFrontEvent(previous, { type: 'COMPLETE_STAGE', build: [] });
  candidates.push(applyFrontEvent(completed.front, { type: 'CLAIM_OPERATION' }));
  const transition = candidates.find((candidate) => {
    const expected = sanitizeFrontSnapshot(candidate && candidate.front);
    return expected && JSON.stringify(expected) === JSON.stringify(next);
  });
  return transition ? expandFrontRewards(sanitizeFrontRewards(transition.effects)) : [];
}

export const FRONT_GUEST_FORBIDDEN = new Set([
  'frun', 'frresult', 'frreward', 'front-result', 'front-reward', 'grant',
]);
