// 🔥 Бойовий імпульс: чисті правила комбо без DOM/Three.js.
// Рендерер лише показує стан, Player читає множники, main.js зараховує вбивства.

export const MOMENTUM_TIERS = [
  { at: 0, id: 'calm', speed: 1, damage: 1, fire: 1, reload: 1, window: 3.2 },
  { at: 5, id: 'warmup', speed: 1.10, damage: 1, fire: 1.15, reload: 1.15, window: 4.0 },
  { at: 10, id: 'assault', speed: 1.15, damage: 1.25, fire: 1.25, reload: 1.25, window: 4.8 },
  { at: 20, id: 'unstoppable', speed: 1.25, damage: 1.50, fire: 1.40, reload: 1.40, window: 6.0 },
];

export function momentumTier(combo) {
  const n = Math.max(0, (combo && combo.n) | 0);
  for (let i = MOMENTUM_TIERS.length - 1; i >= 0; i--) {
    if (n >= MOMENTUM_TIERS[i].at) return i;
  }
  return 0;
}

export function momentumStats(combo) {
  return MOMENTUM_TIERS[momentumTier(combo)];
}

export function advanceMomentum(combo) {
  if (!combo) return { tier: 0, tierUp: false };
  const before = momentumTier(combo);
  combo.n = Math.max(0, combo.n | 0) + 1;
  combo.best = Math.max(combo.best | 0, combo.n);
  const tier = momentumTier(combo);
  combo.tier = tier;
  combo.t = MOMENTUM_TIERS[tier].window;
  return { tier, tierUp: tier > before };
}

export function tickMomentum(combo, dt) {
  if (!combo || !(combo.t > 0)) return false;
  combo.t = Math.max(0, combo.t - Math.max(0, Number(dt) || 0));
  if (combo.t > 0) return false;
  combo.n = 0;
  combo.tier = 0;
  return true;
}

export function momentumProgress(combo) {
  const tier = momentumTier(combo);
  const cfg = MOMENTUM_TIERS[tier];
  return cfg.window > 0 ? Math.max(0, Math.min(1, (combo && combo.t || 0) / cfg.window)) : 0;
}
