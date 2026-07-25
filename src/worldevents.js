// Pure World Front encounter planning and specialist bonuses.
// This module deliberately has no runtime imports: the host turns its data into gameplay.

const FRONT_TEMPLATES = Object.freeze(['evacuation', 'outbreak', 'siege', 'hunt']);
const FRIEND_ORDER = Object.freeze([
  'UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT',
  'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN',
]);

const COMMANDERS = Object.freeze({
  pursuer: Object.freeze({
    id: 'pursuer',
    zombieType: 'gladiator',
    mechanics: Object.freeze(['charger']),
  }),
  broodmother: Object.freeze({
    id: 'broodmother',
    zombieType: 'wizard',
    mechanics: Object.freeze(['summon']),
  }),
  ram: Object.freeze({
    id: 'ram',
    zombieType: 'terracotta',
    mechanics: Object.freeze(['shield', 'charger']),
  }),
  stalker: Object.freeze({
    id: 'stalker',
    zombieType: 'ghost',
    mechanics: Object.freeze(['invisible']),
  }),
});

const COMMANDER_BY_TEMPLATE = Object.freeze({
  evacuation: 'pursuer',
  outbreak: 'broodmother',
  siege: 'ram',
  hunt: 'stalker',
});

const COMMANDER_BY_COUNTRY = Object.freeze({ POL: 'pursuer', DEU: 'ram' });

const ROLE_BY_FRIEND = Object.freeze({
  UKR: 'medic', FRA: 'medic', SWE: 'medic',
  DEU: 'engineer', JPN: 'engineer', CHN: 'engineer',
  POL: 'scout', ESP: 'scout', TUR: 'scout',
  PRT: 'supplier', ITA: 'supplier', EGY: 'supplier',
});

const VISIBLE_SUPPORT = Object.freeze({
  dispatcher: null,
  medic: 'medkit',
  engineer: 'fortified-barrier',
  scout: 'signal-flare',
  supplier: 'supply-crate',
});

const DISPATCHER = Object.freeze({
  id: 'dispatcher',
  friendId: null,
  role: 'dispatcher',
  support: VISIBLE_SUPPORT.dispatcher,
});

const asInt = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
};

const clampInt = (value, min, max, fallback = min) =>
  Math.max(min, Math.min(max, asInt(value, fallback)));

function hash32(...values) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const text = String(value);
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function normalizedTemplate(value) {
  return FRONT_TEMPLATES.includes(value) ? value : 'evacuation';
}

function phase(id, duration, spawnBudget, extra = {}) {
  return { id, duration, spawnBudget, ...extra };
}

/**
 * Build a deterministic four-phase encounter description.
 * Runtime code owns clocks and spawning; this function only supplies the plan.
 */
export function encounterPlan({ seed = 0, countryId = '', template = 'evacuation', stage = 0, threat = 1, teamSize = 1 } = {}) {
  const cleanSeed = asInt(seed) >>> 0;
  const cleanTemplate = normalizedTemplate(template);
  const cleanStage = clampInt(stage, 0, 2);
  const cleanThreat = clampInt(threat, 1, 3, 1);
  const cleanTeamSize = clampInt(teamSize, 1, 4, 1);
  const roll = hash32(cleanSeed, cleanTemplate, cleanStage, cleanThreat, cleanTeamSize);

  const quietDuration = 12 + (roll % 9); // contract: inclusive 12..20 seconds
  const pressureBudget = 7
    + cleanStage * 3
    + cleanThreat * 3
    + (cleanTeamSize - 1) * 2
    + ((roll >>> 8) % 4);
  const spikeAdds = cleanStage === 2
    ? 0
    : 1 + cleanThreat + (cleanTeamSize - 1) + ((roll >>> 16) % 3);
  const commanderId = COMMANDER_BY_COUNTRY[String(countryId).toUpperCase()] || COMMANDER_BY_TEMPLATE[cleanTemplate];
  const commander = COMMANDERS[commanderId];
  const pressureDuration = 30 + cleanStage * 5 + cleanThreat * 3 + ((roll >>> 20) % 6);
  const spikeDuration = 28 + cleanThreat * 4 + cleanStage * 4;
  const rewardDuration = 8;

  const spike = cleanStage === 2
    ? { commander: { ...commander, mechanics: [...commander.mechanics] } }
    : { elite: true };
  const phases = [
    phase('quiet', quietDuration, 0),
    phase('pressure', pressureDuration, pressureBudget),
    phase('spike', spikeDuration, spikeAdds, spike),
    phase('reward', rewardDuration, 0),
  ];

  return {
    seed: cleanSeed,
    template: cleanTemplate,
    stage: cleanStage,
    threat: cleanThreat,
    teamSize: cleanTeamSize,
    spawnBudget: pressureBudget + spikeAdds,
    commander: { ...commander, mechanics: [...commander.mechanics] },
    phases,
  };
}

export function specialistForFriend(friendId) {
  const cleanId = typeof friendId === 'string' ? friendId.toUpperCase() : '';
  const role = ROLE_BY_FRIEND[cleanId];
  if (!role) return { ...DISPATCHER };
  return {
    id: cleanId,
    friendId: cleanId,
    role,
    support: VISIBLE_SUPPORT[role],
  };
}

export function availableSpecialists(save) {
  const rescued = save && save.friends && typeof save.friends === 'object'
    ? save.friends
    : {};
  return [
    { ...DISPATCHER },
    ...FRIEND_ORDER.filter((id) => !!rescued[id]).map(specialistForFriend),
  ];
}

function projectLevels(projects) {
  const source = projects && typeof projects === 'object' ? projects : {};
  return {
    medbay: clampInt(source.medbay, 0, 3, 0),
    workshop: clampInt(source.workshop, 0, 3, 0),
    radio: clampInt(source.radio, 0, 3, 0),
  };
}

/**
 * Combine a selected specialist with persistent base projects.
 * Percent bonuses are additive so the UI can explain them without hidden compounding.
 */
export function specialistEffects(id, projects = {}) {
  const candidate = typeof id === 'string' ? id : 'dispatcher';
  const byFriend = specialistForFriend(candidate);
  const role = ['medic', 'engineer', 'scout', 'supplier'].includes(candidate)
    ? candidate
    : byFriend.role;
  const specialistId = role === 'dispatcher' ? 'dispatcher' : byFriend.role === role ? byFriend.id : role;
  const levels = projectLevels(projects);

  return {
    specialistId,
    role,
    support: VISIBLE_SUPPORT[role],
    healingMultiplier: 1 + levels.medbay * 0.05 + (role === 'medic' ? 0.25 : 0),
    alliedObjectHealthMultiplier: 1 + levels.workshop * 0.1 + (role === 'engineer' ? 0.25 : 0),
    repairSpeedMultiplier: role === 'engineer' ? 1.25 : 1,
    cardOfferCount: role === 'supplier' ? 4 : 3,
    revealCommander: role === 'scout' || levels.radio >= 1,
    revealStageTypes: levels.radio >= 2,
    revealRewards: levels.radio >= 3,
    extraCache: role === 'scout',
    projects: levels,
  };
}
