export const SPECIALIST_IDS = Object.freeze(['guard', 'medic', 'scout']);

export const SPECIALISTS = Object.freeze({
  guard: Object.freeze({
    icon: '🛡️', name: 'Захисник', passive: '+HP', superName: 'Щит', superIcon: '🛡️',
    kit: Object.freeze(['pistol', 'shotgun']), signature: 'shotgun', chargePerHit: 18,
    bias: Object.freeze({ tags: Object.freeze(['tank']), ids: Object.freeze([]), multiplier: 2 }),
  }),
  medic: Object.freeze({
    icon: '💉', name: 'Медик', passive: 'Сильніше лікування', superName: 'Лікування', superIcon: '💚',
    kit: Object.freeze(['pistol', 'rifle']), signature: 'rifle', chargePerHit: 8,
    bias: Object.freeze({
      tags: Object.freeze([]),
      ids: Object.freeze(['spdheal', 'spdfull', 'dmgvamp', 'spdvamp', 'vamp', 'vamp2']),
      multiplier: 2,
    }),
  }),
  scout: Object.freeze({
    icon: '🏹', name: 'Розвідник', passive: 'Швидкість і підбір', superName: 'Ривок', superIcon: '🏃',
    kit: Object.freeze(['pistol', 'smg']), signature: 'smg', chargePerHit: 5,
    bias: Object.freeze({ tags: Object.freeze(['speed']), ids: Object.freeze([]), multiplier: 2 }),
  }),
});

const clampInt = (value, min, max) => Math.max(min, Math.min(max,
  Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : min));

export function sanitizeSpecialistId(value, fallback = null) {
  if (SPECIALIST_IDS.includes(value)) return value;
  return SPECIALIST_IDS.includes(fallback) ? fallback : null;
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
  const cleanId = sanitizeSpecialistId(id, 'guard');
  const claimId = specialistClaimId(run);
  const rankBefore = specialistRank(specialistXp[cleanId]);
  const award = specialistMasteryAward(run);
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
