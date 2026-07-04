import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../src/story/countryStories.js', import.meta.url);
const tmpModulePath = new URL('./.tmp-countryStories.mjs', import.meta.url);

const source = await readFile(sourcePath, 'utf8');
const moduleSource = source.replace(
  "import { t } from '../i18n.js';",
  'const t = (key) => key;',
);

let storyModule;
try {
  await writeFile(tmpModulePath, moduleSource);
  storyModule = await import(`${tmpModulePath.href}?v=${Date.now()}`);
} finally {
  await rm(tmpModulePath, { force: true });
}

const {
  STORY_COUNTRY_IDS,
  getCountryStory,
  shouldUseStoryMissions,
  storyPreview,
} = storyModule;

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
const preview = storyPreview('POL');
assert.equal(preview.join(''), '🔥🚂🏰');
assert.deepEqual(storyPreview('DEU'), null);

console.log('✅ story selector preview pass');
console.log('✅ story campaign 2 definitions pass');
