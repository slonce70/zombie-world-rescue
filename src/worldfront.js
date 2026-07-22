// Pure domain model for World Front. No DOM, renderer, storage or network access.
import { encounterPlan } from './worldevents.js';
import { CARD_POOL } from './runbuild.js';

export const FRONT_VERSION = 1;
export const FRONT_STAGE_COUNT = 3;

const CAMPAIGN_COUNTRIES = Object.freeze([
  'UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN',
]);

export const FRONT_PROJECTS = Object.freeze(['medbay', 'workshop', 'radio']);

export const SPECIALIST_ROLES = Object.freeze({
  UKR: 'medic', FRA: 'medic', SWE: 'medic',
  DEU: 'engineer', JPN: 'engineer', CHN: 'engineer',
  POL: 'scout', ESP: 'scout', TUR: 'scout',
  PRT: 'supplier', ITA: 'supplier', EGY: 'supplier',
  dispatcher: 'dispatcher',
});

export const FRONT_TEMPLATES = Object.freeze({
  evacuation: Object.freeze({
    commander: 'pursuer',
    stages: Object.freeze(['rescue-group', 'evacuation-zone', 'commander-pursuer']),
  }),
  outbreak: Object.freeze({
    commander: 'broodmother',
    stages: Object.freeze(['destroy-nests', 'close-portals', 'commander-queen']),
  }),
  siege: Object.freeze({
    commander: 'ram',
    stages: Object.freeze(['repair-generator', 'defense-waves', 'commander-ram']),
  }),
  hunt: Object.freeze({
    commander: 'stalker',
    stages: Object.freeze(['activate-beacons', 'elite-squad', 'commander-stalker']),
  }),
});

const EVACUATION_STAGES = Object.freeze({
  UKR: Object.freeze(['rebuild-center', 'night-evacuation', 'commander-pursuer']),
  POL: Object.freeze(['rescue-train', 'night-evacuation', 'commander-pursuer']),
  TUR: Object.freeze(['rescue-ship', 'night-evacuation', 'commander-pursuer']),
});

const SPAIN_REBUILD_STAGES = Object.freeze([
  'spain-rebuild-center',
  'spain-clear-village',
  'spain-defend-fireworks',
]);

function operationStages(front, operation) {
  if (operation.country === 'ESP' && front.world.countries.ESP?.damage >= 3) {
    return SPAIN_REBUILD_STAGES;
  }
  if (operation.template === 'evacuation' && EVACUATION_STAGES[operation.country]) {
    return EVACUATION_STAGES[operation.country];
  }
  return FRONT_TEMPLATES[operation.template].stages;
}

const TEMPLATE_IDS = Object.freeze(Object.keys(FRONT_TEMPLATES));
const PROJECT_SET = new Set(FRONT_PROJECTS);
const COUNTRY_SET = new Set(CAMPAIGN_COUNTRIES);
const SPECIALIST_SET = new Set(Object.keys(SPECIALIST_ROLES));
const OP_STATUSES = new Set(['available', 'active', 'completed', 'claimed']);
const ACTIVE_STATUSES = new Set(['ready', 'active', 'completed']);
const MAX_BUILD_IDS = 12;
const MAX_CLAIMS = 128;
const BUILD_SET = new Set(CARD_POOL.map((card) => card.id));

const int = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const clamp = (value, min, max, fallback = min) => Math.max(min, Math.min(max, int(value, fallback)));

function hash(seed, generation, index, salt = 0) {
  let n = (int(seed) ^ Math.imul(generation + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b) ^ salt) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d) >>> 0;
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
}

function cleanIds(value, allowed = null, max = 64) {
  let source = value;
  if (!Array.isArray(source) && source && typeof source === 'object') {
    source = Object.keys(source).filter((key) => source[key]);
  }
  if (!Array.isArray(source)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    if (typeof raw !== 'string') continue;
    const id = raw.slice(0, 96);
    if (!id || seen.has(id) || (allowed && !allowed.has(id))) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

const cleanCountries = (value) => cleanIds(value, COUNTRY_SET, CAMPAIGN_COUNTRIES.length);
const cleanBuild = (value) => cleanIds(value, BUILD_SET, MAX_BUILD_IDS);
const operationId = (generation, country, template) => `g${generation}-${country}-${template}`;
const operationRewardId = (front, operation) => `front:${front.seed}:${operation.id}:r${front.restored[operation.country] || 0}:operation`;
const cycleRewardId = (front) => `front:${front.seed}:g${front.generation}:cycle`;
const maxProjectRewardId = (front) => `front:${front.seed}:g${front.generation}:projects-max`;

function makeBoard(seed, generation, liberated, counterattackCountry = null) {
  const countries = cleanCountries(liberated);
  if (!countries.length) return [];
  const guided = countries.length < 3;
  let selected = guided
    ? [countries.includes('UKR') ? 'UKR' : countries[0]]
    : countries
      .map((country, index) => ({ country, score: hash(seed, generation, index, 0x51ed270b) }))
      .sort((a, b) => a.score - b.score || a.country.localeCompare(b.country))
      .slice(0, 3)
      .map((entry) => entry.country);
  if (!guided && countries.includes(counterattackCountry)) {
    selected = [counterattackCountry, ...selected.filter((country) => country !== counterattackCountry),
      ...countries.filter((country) => country !== counterattackCountry && !selected.includes(country))].slice(0, 3);
  }
  return selected.map((country, index) => {
    const counterattack = country === counterattackCountry;
    const template = guided ? 'evacuation' : counterattack ? 'siege' : TEMPLATE_IDS[hash(seed, generation, index, 0xa341316c) % TEMPLATE_IDS.length];
    const threat = guided ? 1 : counterattack ? 3 : 1 + (hash(seed, generation, index, 0xc8013ea4) % 3);
    return { id: operationId(generation, country, template), country, template, threat, counterattack, status: 'available' };
  });
}

const operationCoins = (operation) => 200 + operation.threat * 50 + (operation.counterattack ? 100 : 0);

function cleanStats(value) {
  const stats = value && typeof value === 'object' ? value : {};
  const day = typeof stats.firstSeenDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stats.firstSeenDay)
    ? stats.firstSeenDay
    : '';
  return {
    firstSeenDay: day,
    opens: clamp(stats.opens, 0, 1_000_000),
    starts: clamp(stats.starts, 0, 1_000_000),
    completes: clamp(stats.completes, 0, 1_000_000),
    secondStarts: clamp(stats.secondStarts, 0, 1_000_000),
    baseVisits: clamp(stats.baseVisits, 0, 1_000_000),
    sent: cleanIds(stats.sent, null, 32),
  };
}

function cleanProjects(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(FRONT_PROJECTS.map((id) => [id, clamp(source[id], 0, 3)]));
}

function cleanRestored(value) {
  const source = value && typeof value === 'object' ? value : {};
  const restored = {};
  for (const country of CAMPAIGN_COUNTRIES) {
    const level = clamp(source[country], 0, 3);
    if (level) restored[country] = level;
  }
  return restored;
}

function cleanWorld(value, liberated = []) {
  const source = value && typeof value === 'object' ? value : {};
  const rawCountries = source.countries && typeof source.countries === 'object' ? source.countries : {};
  const countries = {};
  for (const country of CAMPAIGN_COUNTRIES) {
    const raw = rawCountries[country];
    if (raw && typeof raw === 'object') {
      countries[country] = {
        damage: clamp(raw.damage, 0, 3),
        population: clamp(raw.population, 20, 100, 100),
      };
    }
  }
  for (const country of cleanCountries(liberated)) {
    if (!countries[country]) countries[country] = { damage: 0, population: 100 };
  }
  return {
    day: typeof source.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.day) ? source.day : '',
    countries,
  };
}

function specialistId(value, rescuedFriends, enforceAvailability) {
  const id = typeof value === 'string' && SPECIALIST_SET.has(value) ? value : 'dispatcher';
  if (id === 'dispatcher' || !enforceAvailability) return id;
  return cleanIds(rescuedFriends, COUNTRY_SET, CAMPAIGN_COUNTRIES.length).includes(id) ? id : 'dispatcher';
}

function stageAdapter(front, operation, stage) {
  const preset = operationStages(front, operation)[stage];
  let modeId = 'campaign';
  let modeOpts = {};
  if (preset === 'evacuation-zone' || preset === 'night-evacuation') {
    modeId = 'defense';
    modeOpts = { defense: 'zone' };
  } else if (preset === 'close-portals') {
    modeId = 'portal';
    modeOpts = { portal: true };
  } else if (preset === 'defense-waves') {
    modeId = 'defense';
    modeOpts = { defense: true };
  }
  return {
    countryId: operation.country,
    modeId,
    modeOpts,
    missionPreset: preset,
    encounterPlan: encounterPlan({
      seed: front.seed + front.generation,
      template: operation.template,
      stage,
      threat: operation.threat,
      teamSize: 1,
    }),
  };
}

export function createFront({ seed = Date.now(), liberated = [], rescuedFriends = [] } = {}) {
  const board = makeBoard(int(seed), 0, liberated);
  if (!board.length) return null;
  return {
    v: FRONT_VERSION,
    seed: int(seed),
    generation: 0,
    board,
    active: null,
    projects: { medbay: 0, workshop: 0, radio: 0 },
    activeProject: 'medbay',
    projectProgress: 0,
    restored: {},
    world: cleanWorld(null, liberated),
    claims: [],
    stats: cleanStats(null),
  };
}

export function sanitizeFront(value, context = {}) {
  if (!value || typeof value !== 'object' || int(value.v, -1) !== FRONT_VERSION) return null;
  const generation = clamp(value.generation, 0, 1_000_000);
  const seed = int(value.seed);
  const rawBoard = Array.isArray(value.board) ? value.board : [];
  const board = [];
  const usedCountries = new Set();
  for (const raw of rawBoard.slice(0, 3)) {
    if (!raw || typeof raw !== 'object') continue;
    const country = COUNTRY_SET.has(raw.country) ? raw.country : null;
    const template = Object.hasOwn(FRONT_TEMPLATES, raw.template) ? raw.template : null;
    if (!country || !template || usedCountries.has(country)) continue;
    usedCountries.add(country);
    board.push({
      id: operationId(generation, country, template),
      country,
      template,
      threat: clamp(raw.threat, 1, 3, 1),
      counterattack: !!raw.counterattack,
      status: OP_STATUSES.has(raw.status) ? raw.status : 'available',
    });
  }
  if (![1, 3].includes(board.length)) return null;

  const hasFriendContext = Object.hasOwn(context, 'rescuedFriends');
  let active = null;
  const rawActive = value.active && typeof value.active === 'object' ? value.active : null;
  if (rawActive) {
    const operation = board.find((entry) => entry.id === rawActive.operationId && entry.status !== 'claimed');
    if (operation) {
      const status = ACTIVE_STATUSES.has(rawActive.status) ? rawActive.status : 'ready';
      active = {
        operationId: operation.id,
        stage: clamp(rawActive.stage, 0, FRONT_STAGE_COUNT - 1),
        specialist: specialistId(rawActive.specialist, context.rescuedFriends, hasFriendContext),
        build: cleanBuild(rawActive.build),
        status,
      };
      operation.status = status === 'completed' ? 'completed' : 'active';
    }
  }
  if (!active) {
    const completed = board.find((entry) => entry.status === 'completed');
    if (completed) {
      active = { operationId: completed.id, stage: 2, specialist: 'dispatcher', build: [], status: 'completed' };
    }
  }
  for (const operation of board) {
    if (['active', 'completed'].includes(operation.status) && (!active || active.operationId !== operation.id)) {
      operation.status = 'available';
    }
  }

  const activeProject = PROJECT_SET.has(value.activeProject) ? value.activeProject : 'medbay';
  return {
    v: FRONT_VERSION,
    seed,
    generation,
    board,
    active,
    projects: cleanProjects(value.projects),
    activeProject,
    projectProgress: clamp(value.projectProgress, 0, 2),
    restored: cleanRestored(value.restored),
    world: cleanWorld(value.world, context.liberated),
    claims: cleanIds(value.claims, null, MAX_CLAIMS),
    stats: cleanStats(value.stats),
  };
}

function unchanged(front) {
  return { front, effects: [] };
}

function changed(front, effects = [], toast = '') {
  const out = effects.slice();
  if (toast) out.push({ type: 'toast', key: toast, params: {} });
  out.push({ type: 'save' });
  return { front, effects: out };
}

function operationById(front, id) {
  return front.board.find((operation) => operation.id === id) || null;
}

function cloneFront(front) {
  return {
    ...front,
    board: front.board.map((operation) => ({ ...operation })),
    active: front.active ? { ...front.active, build: front.active.build.slice() } : null,
    projects: { ...front.projects },
    restored: { ...front.restored },
    world: {
      day: front.world.day,
      countries: Object.fromEntries(Object.entries(front.world.countries).map(([id, state]) => [id, { ...state }])),
    },
    claims: front.claims.slice(),
    stats: { ...front.stats, sent: front.stats.sent.slice() },
  };
}

export function applyFrontEvent(value, event = {}) {
  if (!event || typeof event !== 'object') return unchanged(sanitizeFront(value));
  if (event.type === 'INIT') {
    let front = sanitizeFront(value, event);
    if (!front) front = createFront(event);
    if (!front) return unchanged(null);
    front = cloneFront(front);
    if (event.opened) front.stats.opens++;
    if (event.baseVisited) front.stats.baseVisits++;
    if (!front.stats.firstSeenDay && typeof event.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.day)) {
      front.stats.firstSeenDay = event.day;
    }
    front.world = cleanWorld(front.world, event.liberated);
    if (typeof event.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.day) && event.day >= front.world.day) {
      front.world.day = event.day;
    }
    return changed(front);
  }

  const sanitized = sanitizeFront(value, Object.hasOwn(event, 'rescuedFriends') ? { rescuedFriends: event.rescuedFriends } : {});
  if (!sanitized) return unchanged(null);
  const front = cloneFront(sanitized);

  if (event.type === 'SELECT_PROJECT') {
    const canSelect = !front.active && front.projectProgress === 0 && front.board.every((operation) => operation.status === 'available');
    if (!canSelect || !PROJECT_SET.has(event.projectId) || event.projectId === front.activeProject) return unchanged(sanitized);
    front.activeProject = event.projectId;
    return changed(front, [], 'front.projectSelected');
  }

  if (event.type === 'START_OPERATION') {
    if (front.active) return unchanged(sanitized);
    const operation = operationById(front, event.operationId);
    if (!operation || operation.status !== 'available') return unchanged(sanitized);
    const enforce = Object.hasOwn(event, 'rescuedFriends');
    operation.status = 'active';
    front.active = {
      operationId: operation.id,
      stage: 0,
      specialist: specialistId(event.specialist, event.rescuedFriends, enforce),
      build: cleanBuild(event.build),
      status: 'ready',
    };
    if (front.stats.starts === 1) front.stats.secondStarts++;
    front.stats.starts++;
    return changed(front, [], 'front.operationStarted');
  }

  if (event.type === 'START_STAGE') {
    if (!front.active || front.active.status !== 'ready') return unchanged(sanitized);
    front.active.status = 'active';
    return changed(front);
  }

  if (event.type === 'COMPLETE_STAGE') {
    if (!front.active || front.active.status !== 'active') return unchanged(sanitized);
    front.active.build = cleanBuild([...front.active.build, ...cleanBuild(event.build)]);
    if (front.active.stage < FRONT_STAGE_COUNT - 1) {
      front.active.stage++;
      front.active.status = 'ready';
      return changed(front, [], 'front.stageComplete');
    }
    front.active.status = 'completed';
    const operation = operationById(front, front.active.operationId);
    if (operation) operation.status = 'completed';
    front.stats.completes++;
    return changed(front, [], 'front.operationComplete');
  }

  if (event.type === 'COMPLETE_OPERATION') {
    if (!front.active || front.active.status !== 'active' || front.active.stage !== FRONT_STAGE_COUNT - 1) {
      return unchanged(sanitized);
    }
    const completed = applyFrontEvent(sanitized, { type: 'COMPLETE_STAGE', build: event.build });
    const claimed = applyFrontEvent(completed.front, { type: 'CLAIM_OPERATION' });
    return {
      front: claimed.front,
      effects: [...completed.effects.filter((effect) => effect.type !== 'save'), ...claimed.effects],
    };
  }

  if (event.type === 'FAIL_STAGE') {
    if (!front.active || front.active.status !== 'active') return unchanged(sanitized);
    front.active.status = 'ready';
    return changed(front, [], 'front.stageFailed');
  }

  if (event.type === 'END_FAILED_OPERATION') {
    if (!front.active || front.active.status !== 'ready') return unchanged(sanitized);
    const operation = operationById(front, front.active.operationId);
    if (!operation) return unchanged(sanitized);
    const rebuilding = (front.restored[operation.country] || 0) > 0 && !operation.counterattack;
    if (!rebuilding) {
      const country = front.world.countries[operation.country] || { damage: 0, population: 100 };
      country.damage = Math.min(3, country.damage + 1);
      country.population = Math.max(20, country.population - 4 - operation.threat * 2);
      front.world.countries[operation.country] = country;
    }
    operation.status = 'available';
    front.active = null;
    return changed(front, [], 'front.operationFailed');
  }

  if (event.type === 'ABANDON_OPERATION') {
    if (!front.active || front.active.status === 'completed') return unchanged(sanitized);
    const operation = operationById(front, front.active.operationId);
    if (operation) operation.status = 'available';
    front.active = null;
    return changed(front, [], 'front.operationAbandoned');
  }

  if (event.type === 'CLAIM_OPERATION') {
    if (!front.active || front.active.status !== 'completed') return unchanged(sanitized);
    const operation = operationById(front, front.active.operationId);
    if (!operation || operation.status !== 'completed') return unchanged(sanitized);
    const effects = [];
    const rewardId = operationRewardId(front, operation);
    if (!front.claims.includes(rewardId)) {
      front.claims.push(rewardId);
      effects.push({ type: 'grant', rewardId, coins: operationCoins(operation), crystals: 1 + operation.threat, eggs: 0 });
    }
    const allProjectsMax = FRONT_PROJECTS.every((id) => front.projects[id] >= 3);
    if (!allProjectsMax) {
      front.projectProgress++;
      if (front.projectProgress >= 3) {
        front.projects[front.activeProject] = Math.min(3, front.projects[front.activeProject] + 1);
        front.projectProgress = 0;
      }
    }
    front.restored[operation.country] = Math.min(3, (front.restored[operation.country] || 0) + 1);
    const country = front.world.countries[operation.country] || { damage: 0, population: 100 };
    country.damage = Math.max(0, country.damage - 1);
    country.population = Math.min(100, country.population + 8 + operation.threat * 2);
    front.world.countries[operation.country] = country;
    const saved = country.damage === 0 && front.restored[operation.country] >= 3;
    if (saved) {
      operation.status = 'claimed';
    } else {
      operation.template = country.damage >= 2 ? 'evacuation' : 'siege';
      operation.id = operationId(front.generation, operation.country, operation.template);
      operation.threat = Math.max(1, Math.min(3, country.damage || 1));
      operation.counterattack = false;
      operation.status = 'available';
    }
    front.active = null;

    const cycleComplete = front.board.length === 3 && front.board.every((entry) => entry.status === 'claimed');
    if (cycleComplete) {
      const cycleId = cycleRewardId(front);
      if (!front.claims.includes(cycleId)) {
        front.claims.push(cycleId);
        effects.push({ type: 'grant', rewardId: cycleId, coins: 0, crystals: 10, eggs: 1 });
      }
      if (allProjectsMax) {
        const maxId = maxProjectRewardId(front);
        if (!front.claims.includes(maxId)) {
          front.claims.push(maxId);
          effects.push({ type: 'grant', rewardId: maxId, coins: 300, crystals: 5, eggs: 0 });
        }
      }
    }
    front.claims = front.claims.slice(-MAX_CLAIMS);
    return changed(front, effects, cycleComplete ? 'front.cycleComplete' : 'front.rewardClaimed');
  }

  if (event.type === 'ADVANCE_GENERATION') {
    if (front.active || !front.board.every((operation) => operation.status === 'claimed')) return unchanged(sanitized);
    const liberated = cleanCountries(event.liberated);
    const protectedCountries = new Set(front.board.map((operation) => operation.country));
    const exposed = Object.keys(front.restored).filter((country) => front.restored[country] > 0 && !protectedCountries.has(country));
    const counterattackCountry = exposed
      .map((country, index) => ({ country, score: hash(front.seed, front.generation + 1, index, 0x71c4a11d) }))
      .sort((a, b) => a.score - b.score || a.country.localeCompare(b.country))[0]?.country || null;
    if (counterattackCountry) {
      const country = front.world.countries[counterattackCountry] || { damage: 0, population: 100 };
      country.damage = Math.min(3, country.damage + 1);
      country.population = Math.max(20, country.population - 10);
      front.world.countries[counterattackCountry] = country;
    }
    const nextBoard = makeBoard(front.seed, front.generation + 1,
      liberated.length ? liberated : front.board.map((operation) => operation.country), counterattackCountry);
    if (!nextBoard.length) return unchanged(sanitized);
    front.generation++;
    front.board = nextBoard;
    return changed(front, [], counterattackCountry ? 'front.counterattack' : 'front.generationAdvanced');
  }

  if (event.type === 'RESCUE_CIVILIAN') {
    if (!COUNTRY_SET.has(event.countryId) || !front.world.countries[event.countryId]) return unchanged(sanitized);
    const country = front.world.countries[event.countryId];
    if (country.population >= 100) return unchanged(sanitized);
    country.population = Math.min(100, country.population + 5);
    return changed(front, [], 'front.civilianRescued');
  }

  return unchanged(sanitized);
}

export function frontStageConfig(value) {
  const front = sanitizeFront(value);
  if (!front || !front.active || !['ready', 'active'].includes(front.active.status)) return null;
  const operation = operationById(front, front.active.operationId);
  if (!operation) return null;
  const adapter = stageAdapter(front, operation, front.active.stage);
  return {
    ...adapter,
    operation: {
      generation: front.generation,
      operationId: operation.id,
      stage: front.active.stage,
      specialist: front.active.specialist,
      build: front.active.build.slice(),
    },
  };
}

export function frontCountryState(value, countryId) {
  const front = sanitizeFront(value);
  if (!front || !COUNTRY_SET.has(countryId)) return null;
  const operation = front.board.find((entry) => entry.country === countryId) || null;
  const world = front.world.countries[countryId] || { damage: 0, population: 100 };
  const restored = front.restored[countryId] || 0;
  const activeAttack = !!operation && ['available', 'active'].includes(operation.status)
    && (operation.counterattack || restored === 0);
  let state = 'peaceful';
  if (world.damage >= 3) state = 'destroyed';
  else if (activeAttack) state = 'attacked';
  else if (world.damage === 0 && restored >= 3) state = 'saved';
  else if (restored > 0 || (operation && ['completed', 'claimed'].includes(operation.status))) state = 'rebuilding';
  else if (world.damage > 0 || operation) state = 'attacked';
  return {
    countryId,
    state,
    threat: operation ? operation.threat : 0,
    restored,
    outpostLevel: restored,
    damage: world.damage,
    population: world.population,
    operationId: operation ? operation.id : null,
  };
}

export function frontViewModel(value, save = {}, { previewSpecialist = null } = {}) {
  const context = {};
  if (save && Object.hasOwn(save, 'friends')) context.rescuedFriends = save.friends;
  const front = sanitizeFront(value, context);
  if (!front) return null;
  const rescued = cleanIds(save && save.friends, COUNTRY_SET, CAMPAIGN_COUNTRIES.length);
  const radio = front.projects.radio;
  const scoutIntel = SPECIALIST_ROLES[front.active ? front.active.specialist : previewSpecialist] === 'scout';
  const selectable = !front.active && front.projectProgress === 0 && front.board.every((operation) => operation.status === 'available');
  const available = front.board.filter((operation) => operation.status === 'available');
  const recommended = front.active
    ? front.active.operationId
    : available.slice().sort((a, b) => (front.restored[b.country] > 0) - (front.restored[a.country] > 0)
      || a.threat - b.threat || a.id.localeCompare(b.id))[0]?.id || null;
  const board = front.board.map((operation) => {
    const template = FRONT_TEMPLATES[operation.template];
    return {
      ...operation,
      recommended: operation.id === recommended,
      countryState: frontCountryState(front, operation.country),
      commander: radio >= 1 || scoutIntel ? template.commander : null,
      stages: operationStages(front, operation).slice(),
      reward: radio >= 3 ? { coins: operationCoins(operation), crystals: 1 + operation.threat } : null,
    };
  });
  const activeOperation = front.active ? board.find((operation) => operation.id === front.active.operationId) || null : null;
  return {
    unlocked: true,
    guided: front.board.length === 1,
    generation: front.generation,
    board,
    active: front.active ? {
      ...front.active,
      build: front.active.build.slice(),
      role: SPECIALIST_ROLES[front.active.specialist],
      operation: activeOperation,
      stageConfig: frontStageConfig(front),
    } : null,
    specialists: ['dispatcher', ...CAMPAIGN_COUNTRIES].map((id) => ({
      id,
      role: SPECIALIST_ROLES[id],
      available: id === 'dispatcher' || rescued.includes(id),
      selected: !!front.active && front.active.specialist === id,
    })),
    projects: FRONT_PROJECTS.map((id) => ({
      id,
      level: front.projects[id],
      progress: id === front.activeProject ? front.projectProgress : 0,
      selected: id === front.activeProject,
      maxed: front.projects[id] >= 3,
      locked: !selectable,
    })),
    recommendedOperationId: recommended,
    canSelectProject: selectable,
    canAdvance: !!front.active || available.length > 0 || front.board.every((operation) => operation.status === 'claimed'),
    completedOperations: front.board.filter((operation) => ['completed', 'claimed'].includes(operation.status)).length,
    totalOperations: front.board.length,
  };
}
