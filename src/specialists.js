export const SPECIALIST_IDS = Object.freeze(['guard', 'medic', 'scout']);
export const EXPEDITION_FIGHTER_IDS = Object.freeze([...SPECIALIST_IDS, 'bastion', 'impulse']);

export const SPECIALISTS = Object.freeze({
  guard: Object.freeze({
    icon: '🛡️', name: 'Захисник', role: 'Танк', passive: '+HP',
    attackName: 'Дробовик', superName: 'Щит', superIcon: '🛡️',
    gadgets: Object.freeze(['Щит', 'Стіна']), playable: true,
    kit: Object.freeze(['pistol', 'shotgun']), signature: 'shotgun', chargePerHit: 18,
    bias: Object.freeze({ tags: Object.freeze(['tank']), ids: Object.freeze([]), multiplier: 2 }),
  }),
  medic: Object.freeze({
    icon: '💉', name: 'Медик', role: 'Підтримка', passive: 'Сильніше лікування',
    attackName: 'Автомат', superName: 'Лікування', superIcon: '💚',
    gadgets: Object.freeze(['Лікування', 'Тотем лікування']), playable: true,
    kit: Object.freeze(['pistol', 'rifle']), signature: 'rifle', chargePerHit: 8,
    bias: Object.freeze({
      tags: Object.freeze([]),
      ids: Object.freeze(['spdheal', 'spdfull', 'dmgvamp', 'spdvamp', 'vamp', 'vamp2']),
      multiplier: 2,
    }),
  }),
  scout: Object.freeze({
    icon: '🏹', name: 'Розвідник', role: 'Мобільність', passive: 'Швидкість і підбір',
    attackName: 'Швидкостріл', superName: 'Ривок', superIcon: '🏃',
    gadgets: Object.freeze(['Ривок', 'Телепорт']), playable: true,
    kit: Object.freeze(['pistol', 'smg']), signature: 'smg', chargePerHit: 5,
    bias: Object.freeze({ tags: Object.freeze(['speed']), ids: Object.freeze([]), multiplier: 2 }),
  }),
  bastion: Object.freeze({
    icon: '🧱', name: 'Бастіон', role: 'Танк', passive: 'Висока витривалість',
    attackName: 'Кулаки', superName: 'Суперкулак', superIcon: '👊',
    gadgets: Object.freeze(['Лікувальні кулаки', 'Провокація']), playable: true,
    kit: Object.freeze(['fists']), signature: 'fists', chargePerHit: 10, hyperChargePerHit: 2,
    bias: Object.freeze({ tags: Object.freeze(['tank']), ids: Object.freeze([]), multiplier: 2 }),
  }),
  impulse: Object.freeze({
    icon: '🌀', name: 'Імпульс', role: 'Контроль', passive: 'Контроль натовпу',
    attackName: 'Очікує твоєї ідеї', superName: 'Очікує твоєї ідеї', superIcon: '✨',
    gadgets: Object.freeze(['Очікує твоєї ідеї', 'Очікує твоєї ідеї']), playable: false,
  }),
});

export const FIGHTER_UPGRADE_COSTS = Object.freeze({
  2: Object.freeze({ coins: 1000, crystals: 0 }),
  3: Object.freeze({ coins: 2000, crystals: 5 }),
  4: Object.freeze({ coins: 2500, crystals: 13 }),
  5: Object.freeze({ coins: 3000, crystals: 15 }),
});

export const BASTION_LEVEL_STATS = Object.freeze([
  null,
  Object.freeze({ maxHealth: 50, damage: 50 }),
  Object.freeze({ maxHealth: 65, damage: 75 }),
  Object.freeze({ maxHealth: 100, damage: 95 }),
  Object.freeze({ maxHealth: 175, damage: 110 }),
  Object.freeze({ maxHealth: 215, damage: 125 }),
]);

export const BASTION_UNLOCK_COSTS = Object.freeze({
  'healing-punch': 1000,
  provoke: 1000,
  hyper: 5000,
});

// ⭐ Зоряні сили Бастіона: покращення Суперкулака НАЗАВЖДИ. Обрати можна лише ОДНУ —
// куплена сила закриває другу, тож вибір справжній, а не «збери обидві».
export const BASTION_STAR_POWER_COST = 2300;
export const BASTION_STAR_POWER_LEVEL = 4;
export const BASTION_STAR_POWERS = Object.freeze({
  'push-super': Object.freeze({
    icon: '💨', name: 'Відштовхуючий супер',
    desc: 'Суперкулак відкидає зомбі на 7 м і б\'є на 20 сильніше',
    bonusDamage: 20, pushDistance: 7,
  }),
  'fast-super': Object.freeze({
    icon: '⚡', name: 'Швидкий супер',
    desc: 'Після Суперкулака 3 с швидкості, а Super заряджається на 5% швидше',
    speedSecs: 3, chargeMultiplier: 1.05,
  }),
});
export const BASTION_STAR_POWER_IDS = Object.freeze(Object.keys(BASTION_STAR_POWERS));

const clampInt = (value, min, max) => Math.max(min, Math.min(max,
  Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min));

export function bastionLevelStats(level) {
  return BASTION_LEVEL_STATS[clampInt(level, 1, 5)];
}

export function sanitizeBastionGadget(value) {
  return value === 'provoke' ? 'provoke' : 'healing-punch';
}

export function sanitizeBastionGadgetsOwned(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((id) => id === 'healing-punch' || id === 'provoke'))];
}

export function buyBastionUnlock(state, id) {
  const coins = clampInt(state && state.coins, 0, 999999999);
  const level = sanitizeFighterLevels(state && state.fighterLevels).bastion;
  const bastionGadgetsOwned = sanitizeBastionGadgetsOwned(state && state.bastionGadgetsOwned);
  const bastionHyperOwned = state && state.bastionHyperOwned === true;
  const fail = (reason) => ({ ok: false, reason, coins, bastionGadgetsOwned, bastionHyperOwned });
  const cost = BASTION_UNLOCK_COSTS[id];
  if (!cost) return fail('unknown');
  if (level < (id === 'hyper' ? 5 : 3)) return fail('level');
  if (id === 'hyper' ? bastionHyperOwned : bastionGadgetsOwned.includes(id)) return fail('owned');
  if (coins < cost) return fail('coins');
  return {
    ok: true, reason: null, coins: coins - cost,
    bastionGadgetsOwned: id === 'hyper' ? bastionGadgetsOwned : [...bastionGadgetsOwned, id],
    bastionHyperOwned: id === 'hyper' || bastionHyperOwned,
  };
}

export function sanitizeBastionStarPower(value) {
  return BASTION_STAR_POWER_IDS.includes(value) ? value : null;
}

export function buyBastionStarPower(state, id) {
  const coins = clampInt(state && state.coins, 0, 999999999);
  const level = sanitizeFighterLevels(state && state.fighterLevels).bastion;
  const owned = sanitizeBastionStarPower(state && state.bastionStarPower);
  const cleanId = sanitizeBastionStarPower(id);
  const fail = (reason) => ({ ok: false, reason, coins, bastionStarPower: owned });
  if (!cleanId) return fail('unknown');
  if (level < BASTION_STAR_POWER_LEVEL) return fail('level');
  // друга сила недоступна назавжди: 'owned' — та сама, 'chosen' — вибір уже зроблено
  if (owned) return fail(owned === cleanId ? 'owned' : 'chosen');
  if (coins < BASTION_STAR_POWER_COST) return fail('coins');
  return { ok: true, reason: null, coins: coins - BASTION_STAR_POWER_COST, bastionStarPower: cleanId };
}

export function sanitizeSpecialistId(value, fallback = null) {
  if (SPECIALIST_IDS.includes(value)) return value;
  return SPECIALIST_IDS.includes(fallback) ? fallback : null;
}

export function sanitizeFighterId(value, fallback = null) {
  if (EXPEDITION_FIGHTER_IDS.includes(value)) return value;
  return EXPEDITION_FIGHTER_IDS.includes(fallback) ? fallback : null;
}

export function sanitizeFighterLevels(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(EXPEDITION_FIGHTER_IDS.map((id) => [id, clampInt(src[id], 1, 5)]));
}

export function fighterLevelMultiplier(level) {
  return 1 + (clampInt(level, 1, 5) - 1) / 10;
}

export function buyFighterLevel(state, id) {
  const fighterLevels = sanitizeFighterLevels(state && state.fighterLevels);
  const coins = clampInt(state && state.coins, 0, 999999999);
  const crystals = clampInt(state && state.crystals, 0, 999999999);
  const cleanId = sanitizeFighterId(id);
  const level = cleanId ? fighterLevels[cleanId] : 1;
  const fail = (reason) => ({ ok: false, reason, level, coins, crystals, fighterLevels });
  if (!cleanId) return fail('unknown');
  if (!SPECIALISTS[cleanId].playable) return fail('unavailable');
  if (level >= 5) return fail('max');
  const cost = FIGHTER_UPGRADE_COSTS[level + 1];
  if (coins < cost.coins) return fail('coins');
  if (crystals < cost.crystals) return fail('crystals');
  fighterLevels[cleanId] = level + 1;
  return {
    ok: true, reason: null, level: level + 1,
    coins: coins - cost.coins, crystals: crystals - cost.crystals, fighterLevels,
  };
}

export function sanitizeSpecialistXp(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(SPECIALIST_IDS.map((id) => [id, clampInt(src[id], 0, 999999)]));
}

export function sanitizeSpecialistClaims(value) {
  const clean = (Array.isArray(value) ? value : []).filter((id) =>
    typeof id === 'string' && id.length <= 80 && /^expedition:-?\d+:(solo|coop)$/.test(id));
  return [...new Set(clean)].slice(-50);
}

export function specialistRank(xp) {
  const n = clampInt(xp, 0, 999999);
  return n >= 300 ? 3 : n >= 100 ? 2 : 1;
}

export function specialistBias(id) {
  const cfg = SPECIALISTS[sanitizeSpecialistId(id)];
  return cfg ? cfg.bias : null;
}

export function specialistModifiers(id, rank = 1) {
  const cleanId = sanitizeSpecialistId(id, 'guard');
  const cleanRank = clampInt(rank, 1, 3);
  if (cleanId === 'guard') return {
    maxHealthBonus: cleanRank >= 2 ? 35 : 25,
    healMult: 1, reviveSecs: 3, speedMult: 1, pickupMult: 1,
    superId: 'shield', superAmount: cleanRank >= 3 ? 100 : 50,
  };
  if (cleanId === 'medic') return {
    maxHealthBonus: 0,
    healMult: cleanRank >= 2 ? 1.4 : 1.25,
    reviveSecs: cleanRank >= 2 ? 1.5 : 1.8,
    speedMult: 1, pickupMult: 1,
    superId: 'heal', superAmount: cleanRank >= 3 ? 100 : 50,
  };
  return {
    maxHealthBonus: 0, healMult: 1, reviveSecs: 3,
    speedMult: cleanRank >= 2 ? 1.12 : 1.08,
    pickupMult: cleanRank >= 2 ? 1.35 : 1.25,
    superId: 'dash', superAmount: cleanRank >= 3 ? 3 : 1,
  };
}

export function specialistMasteryAward(run) {
  if (!run || run.status === 'active' || run.status === 'choice') return 0;
  if (run.status === 'won') return 100;
  return run.status === 'failed' ? 15 * clampInt(run.wins, 0, 5) : 0;
}

export function specialistClaimId(run) {
  if (!run || !Number.isFinite(Number(run.seed))) return null;
  return `expedition:${Math.trunc(Number(run.seed))}:${run.coop ? 'coop' : 'solo'}`;
}

export function claimSpecialistMastery(state, run, id) {
  const specialistXp = sanitizeSpecialistXp(state && state.specialistXp);
  const specialistClaims = sanitizeSpecialistClaims(state && state.specialistClaims);
  // БЕЗ fallback на 'guard': Бастіон має власну прокачку за монети (BASTION_LEVEL_STATS),
  // рангові модифікатори до нього не застосовуються — тож його забіг не має качати Захисника.
  const cleanId = sanitizeSpecialistId(id);
  const claimId = specialistClaimId(run);
  const rankBefore = specialistRank(cleanId ? specialistXp[cleanId] : 0);
  const award = cleanId ? specialistMasteryAward(run) : 0;
  if (!claimId || !award || specialistClaims.includes(claimId)) {
    return { specialistXp, specialistClaims, result: { awarded: 0, rankBefore, rankAfter: rankBefore } };
  }
  specialistXp[cleanId] = clampInt(specialistXp[cleanId] + award, 0, 999999);
  const claims = sanitizeSpecialistClaims([...specialistClaims, claimId]);
  return {
    specialistXp,
    specialistClaims: claims,
    result: { awarded: award, rankBefore, rankAfter: specialistRank(specialistXp[cleanId]) },
  };
}
