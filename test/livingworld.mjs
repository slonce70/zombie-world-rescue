import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/livingworld.js', import.meta.url), 'utf8');
const { livingWorldReward, pickLivingWorldEvent, shouldOfferLivingWorld } =
  await import(`data:text/javascript,${encodeURIComponent(source)}`);

assert.equal(shouldOfferLivingWorld({ countryId: 'UKR', runIndex: 0, missionIndex: 0 }), false);
assert.equal(shouldOfferLivingWorld({ countryId: 'POL', runIndex: 0, missionIndex: 1 }), true);
assert.equal(shouldOfferLivingWorld({ countryId: 'LAB', runIndex: 2, missionIndex: 1 }), false);
assert.equal(shouldOfferLivingWorld({ countryId: 'POL', runIndex: 0, missionIndex: 1, modeId: 'storm' }), false);

const a = pickLivingWorldEvent({ countryId: 'POL', seed: 2222, runIndex: 3, missionIndex: 1 });
const b = pickLivingWorldEvent({ countryId: 'POL', seed: 2222, runIndex: 3, missionIndex: 1 });
assert.deepEqual(a, b);
assert.equal(['survivor', 'crate', 'goldHorde'].includes(a.id), true);

assert.deepEqual(livingWorldReward('survivor', 2), { coins: 125, xp: 35 });
assert.deepEqual(livingWorldReward('goldHorde', 4), { coins: 240, xp: 40 });

console.log('LIVING WORLD OK');
