import assert from 'node:assert/strict';
import {
  STORY_COUNTRY_IDS,
  getCountryStory,
  shouldUseStoryMissions,
  storyPreview,
} from '../src/story/countryStories.js';

assert.deepEqual(STORY_COUNTRY_IDS, ['UKR', 'POL', 'EGY']);

const ukr = getCountryStory('UKR');
assert.equal(ukr.id, 'UKR');
assert.equal(ukr.npc.kind, 'medic');
assert.deepEqual(ukr.objectives.map((o) => o.id), ['ukr-rescue', 'ukr-signal', 'ukr-defense']);

const pol = getCountryStory('POL');
assert.equal(pol.objectives[0].kind, 'activate');
assert.equal(pol.objectives[0].count, 3);
assert.equal(pol.objectives[1].site, 'railDepot');

const egy = getCountryStory('EGY');
assert.equal(egy.objectives[0].kind, 'fetch');
assert.equal(egy.objectives[0].count, 2);
assert.equal(egy.objectives[1].kind, 'survive');

assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), true);
assert.equal(shouldUseStoryMissions({ countryId: 'POL', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), true);
assert.equal(shouldUseStoryMissions({ countryId: 'DEU', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'storm', isGuest: false, isCoop: false, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: true, isCoop: true, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: true, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: true }), false);

assert.deepEqual(storyPreview('UKR'), ['🆘', '📡', '🛡️']);
assert.deepEqual(storyPreview('DEU'), null);

console.log('✅ story campaign 2 definitions pass');
