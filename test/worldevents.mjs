import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/worldevents.js', import.meta.url), 'utf8');
const worldEvents = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const {
  availableSpecialists,
  encounterPlan,
  specialistEffects,
  specialistForFriend,
} = worldEvents;

test('encounter plan is deterministic and always has the four ordered phases', () => {
  const input = { seed: 500, template: 'outbreak', stage: 1, threat: 2, teamSize: 3 };
  const first = encounterPlan(input);
  const second = encounterPlan({ ...input });
  assert.deepEqual(first, second);
  assert.deepEqual(first.phases.map((entry) => entry.id), ['quiet', 'pressure', 'spike', 'reward']);
  assert.ok(first.phases[0].duration >= 12 && first.phases[0].duration <= 20);
  assert.equal(first.spawnBudget, first.phases[1].spawnBudget + first.phases[2].spawnBudget);
  assert.deepEqual(first.commander.mechanics, ['summon']);
  assert.equal(first.phases[2].elite, true);
  assert.equal(encounterPlan({ ...input, stage: 2 }).phases[2].commander.id, 'broodmother');
});

test('encounter inputs clamp to supported runtime limits', () => {
  const low = encounterPlan({ seed: -1, template: 'forged', stage: -99, threat: 0, teamSize: 0 });
  assert.equal(low.seed, 0xffffffff);
  assert.equal(low.template, 'evacuation');
  assert.equal(low.stage, 0);
  assert.equal(low.threat, 1);
  assert.equal(low.teamSize, 1);
  assert.equal(low.commander.id, 'pursuer');

  const high = encounterPlan({ seed: Infinity, template: 'hunt', stage: 99, threat: 99, teamSize: 99 });
  assert.equal(high.seed, 0);
  assert.equal(high.stage, 2);
  assert.equal(high.threat, 3);
  assert.equal(high.teamSize, 4);
  assert.equal(high.commander.id, 'stalker');
  assert.ok(high.spawnBudget > low.spawnBudget);
});

test('every operation template selects commander metadata backed by existing mechanics', () => {
  const expected = {
    evacuation: ['pursuer', 'gladiator', ['charger']],
    outbreak: ['broodmother', 'wizard', ['summon']],
    siege: ['ram', 'terracotta', ['shield', 'charger']],
    hunt: ['stalker', 'ghost', ['invisible']],
  };
  for (const [template, [id, zombieType, mechanics]] of Object.entries(expected)) {
    const commander = encounterPlan({ seed: 1, template }).commander;
    assert.equal(commander.id, id);
    assert.equal(commander.zombieType, zombieType);
    assert.deepEqual(commander.mechanics, mechanics);
  }
});

test('friend countries map exactly to the four specialist roles with dispatcher fallback', () => {
  const expected = {
    medic: ['UKR', 'FRA', 'SWE'],
    engineer: ['DEU', 'JPN', 'CHN'],
    scout: ['POL', 'ESP', 'TUR'],
    supplier: ['PRT', 'ITA', 'EGY'],
  };
  for (const [role, ids] of Object.entries(expected)) {
    for (const id of ids) assert.equal(specialistForFriend(id).role, role, id);
  }
  assert.equal(specialistForFriend('LAB').id, 'dispatcher');
  assert.equal(specialistForFriend(null).role, 'dispatcher');
});

test('available specialists contain dispatcher and only rescued campaign friends', () => {
  const specialists = availableSpecialists({
    friends: { UKR: true, POL: false, JPN: 1, LAB: true, __proto__: true },
  });
  assert.deepEqual(specialists.map((entry) => entry.id), ['dispatcher', 'UKR', 'JPN']);
  assert.deepEqual(availableSpecialists(null).map((entry) => entry.id), ['dispatcher']);
});

test('specialist and project effects stack additively and project levels clamp', () => {
  const medic = specialistEffects('UKR', { medbay: 2, workshop: 9, radio: -1 });
  assert.equal(medic.healingMultiplier, 1.35);
  assert.equal(medic.alliedObjectHealthMultiplier, 1.3);
  assert.equal(medic.repairSpeedMultiplier, 1);
  assert.equal(medic.projects.workshop, 3);

  const engineer = specialistEffects('engineer', { workshop: 2 });
  assert.equal(engineer.alliedObjectHealthMultiplier, 1.45);
  assert.equal(engineer.repairSpeedMultiplier, 1.25);

  const scout = specialistEffects('ESP', { radio: 0 });
  assert.equal(scout.revealCommander, true);
  assert.equal(scout.extraCache, true);
  assert.equal(scout.revealStageTypes, false);

  const radio = specialistEffects('dispatcher', { radio: 3 });
  assert.equal(radio.revealCommander, true);
  assert.equal(radio.revealStageTypes, true);
  assert.equal(radio.revealRewards, true);
  assert.equal(specialistEffects('EGY').cardOfferCount, 4);
});
