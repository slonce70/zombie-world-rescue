import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/specialists.js', import.meta.url), 'utf8');
const specialists = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const {
  SPECIALIST_IDS, claimSpecialistMastery, sanitizeSpecialistClaims, sanitizeSpecialistXp,
  specialistBias, specialistMasteryAward, specialistModifiers, specialistRank,
} = specialists;

test('specialist ids, ranks, modifiers and bias are canonical', () => {
  assert.deepEqual(SPECIALIST_IDS, ['guard', 'medic', 'scout']);
  assert.deepEqual([0, 99, 100, 299, 300].map(specialistRank), [1, 1, 2, 2, 3]);
  assert.equal(specialistModifiers('guard', 1).maxHealthBonus, 25);
  assert.equal(specialistModifiers('guard', 2).maxHealthBonus, 35);
  assert.equal(specialistModifiers('medic', 2).healMult, 1.4);
  assert.equal(specialistModifiers('scout', 3).superAmount, 3);
  assert.deepEqual(specialistBias('guard').tags, ['tank']);
  assert.equal(specialistBias('unknown'), null);
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
