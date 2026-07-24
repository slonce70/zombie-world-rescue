import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/specialists.js', import.meta.url), 'utf8');
const specialists = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const {
  BASTION_LEVEL_STATS, EXPEDITION_FIGHTER_IDS, FIGHTER_UPGRADE_COSTS, SPECIALIST_IDS, SPECIALISTS,
  bastionLevelStats, buyFighterLevel,
  claimSpecialistMastery, fighterLevelMultiplier, sanitizeFighterLevels,
  sanitizeBastionGadget, sanitizeSpecialistClaims, sanitizeSpecialistXp, specialistBias, specialistMasteryAward,
  specialistModifiers, specialistRank,
} = specialists;

test('specialist ids, ranks, modifiers and bias are canonical', () => {
  assert.deepEqual(SPECIALIST_IDS, ['guard', 'medic', 'scout']);
  assert.deepEqual(EXPEDITION_FIGHTER_IDS, ['guard', 'medic', 'scout', 'bastion', 'impulse']);
  assert.deepEqual([0, 99, 100, 299, 300].map(specialistRank), [1, 1, 2, 2, 3]);
  assert.equal(specialistModifiers('guard', 1).maxHealthBonus, 25);
  assert.equal(specialistModifiers('guard', 2).maxHealthBonus, 35);
  assert.equal(specialistModifiers('medic', 2).healMult, 1.4);
  assert.equal(specialistModifiers('scout', 3).superAmount, 3);
  assert.deepEqual(specialistBias('guard').tags, ['tank']);
  assert.equal(specialistBias('unknown'), null);
});

test('fighter levels sanitize, scale and buy atomically', () => {
  assert.deepEqual(FIGHTER_UPGRADE_COSTS, {
    2: { coins: 1000, crystals: 0 },
    3: { coins: 2000, crystals: 5 },
    4: { coins: 2500, crystals: 13 },
    5: { coins: 3000, crystals: 15 },
  });
  assert.deepEqual(sanitizeFighterLevels({ guard: 9, medic: 2.8, bastion: -1 }), {
    guard: 5, medic: 2, scout: 1, bastion: 1, impulse: 1,
  });
  assert.deepEqual([1, 2, 3, 4, 5].map(fighterLevelMultiplier), [1, 1.1, 1.2, 1.3, 1.4]);

  const bought = buyFighterLevel({ fighterLevels: {}, coins: 1000, crystals: 0 }, 'guard');
  assert.deepEqual(bought, {
    ok: true, reason: null, level: 2, coins: 0, crystals: 0,
    fighterLevels: { guard: 2, medic: 1, scout: 1, bastion: 1, impulse: 1 },
  });
  assert.deepEqual(buyFighterLevel({ fighterLevels: {}, coins: 999, crystals: 99 }, 'guard').reason, 'coins');
  assert.deepEqual(buyFighterLevel({
    fighterLevels: { guard: 2 }, coins: 2000, crystals: 4,
  }, 'guard').reason, 'crystals');
  assert.deepEqual(buyFighterLevel({
    fighterLevels: { guard: 5 }, coins: 9999, crystals: 99,
  }, 'guard').reason, 'max');
  assert.equal(buyFighterLevel({
    fighterLevels: {}, coins: 1000, crystals: 0,
  }, 'bastion').ok, true);
});

test('Bastion has exact level stats and a valid gadget selection', () => {
  assert.deepEqual(BASTION_LEVEL_STATS.slice(1), [
    { maxHealth: 50, damage: 50 },
    { maxHealth: 65, damage: 75 },
    { maxHealth: 100, damage: 95 },
    { maxHealth: 175, damage: 110 },
    { maxHealth: 215, damage: 125 },
  ]);
  assert.deepEqual([1, 2, 3, 4, 5].map(bastionLevelStats), BASTION_LEVEL_STATS.slice(1));
  assert.equal(sanitizeBastionGadget('provoke'), 'provoke');
  assert.equal(sanitizeBastionGadget('bad'), 'healing-punch');
  assert.equal(SPECIALISTS.bastion.playable, true);
  assert.equal(SPECIALISTS.bastion.chargePerHit, 20);
});

test('specialist progress sanitizers isolate malformed values', () => {
  assert.deepEqual(sanitizeSpecialistXp({ guard: -2, medic: 12.9, scout: 2e9 }),
    { guard: 0, medic: 12, scout: 999999 });
  const claims = Array.from({ length: 55 }, (_, i) => `expedition:${i}:solo`);
  assert.equal(sanitizeSpecialistClaims([...claims, claims.at(-1), 'bad']).length, 50);
});

test('terminal mastery is deterministic and claimed once without input mutation', () => {
  const state = { specialistXp: { guard: 0, medic: 0, scout: 0 }, specialistClaims: [] };
  const run = { seed: 607, coop: false, status: 'won', wins: 5 };
  const first = claimSpecialistMastery(state, run, 'guard');
  assert.deepEqual(first.result, { awarded: 100, rankBefore: 1, rankAfter: 2 });
  assert.equal(first.specialistXp.guard, 100);
  assert.equal(state.specialistXp.guard, 0);
  assert.equal(claimSpecialistMastery(first, run, 'guard').result.awarded, 0);
  assert.equal(specialistMasteryAward({ status: 'failed', wins: 2 }), 30);
  assert.equal(specialistMasteryAward({ status: 'active', wins: 4 }), 0);
});
