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

async function loadMapModule(name) {
  const mapPath = new URL(`../src/maps/${name}.js`, import.meta.url);
  const tmpPath = new URL(`./.tmp-map-${name}.mjs`, import.meta.url);
  const mapSource = await readFile(mapPath, 'utf8');
  // portugal.js імпортує spainMap і спредить її — стабимо порожнім обʼєктом
  // (storySites у portugal.js власні, тест перевіряє саме їх)
  const moduleSource = mapSource
    .replace(/^import spainMap from '\.\/spain\.js';\n/m, 'const spainMap = {};\n')
    .replace(
      /^import .*;\n/m,
      'const ridge = () => 0;\nconst valley = () => 0;\nconst mesa = () => 0;\nconst dunes = () => 0;\nconst basin = () => 0;\nconst terraces = () => 0;\n',
    );
  try {
    await writeFile(tmpPath, moduleSource);
    return (await import(`${tmpPath.href}?v=${Date.now()}`)).default;
  } finally {
    await rm(tmpPath, { force: true });
  }
}

assert.deepEqual(STORY_COUNTRY_IDS, ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN']);

const ukr = getCountryStory('UKR');
assert.equal(ukr.id, 'UKR');
assert.equal(ukr.npc.kind, 'medic');
assert.deepEqual(ukr.objectives.map((o) => o.id), ['ukr-rescue', 'ukr-signal', 'ukr-defense']);

const pol = getCountryStory('POL');
assert.equal(pol.objectives[0].kind, 'activate');
assert.equal(pol.objectives[0].count, 3);
assert.equal(pol.objectives[1].site, 'railDepot');
assert.equal(pol.objectives[2].kind, 'castle');
assert.equal(pol.objectives[2].count, 30);
assert.equal(pol.objectives[2].reward, 250);

const egy = getCountryStory('EGY');
assert.equal(egy.objectives[0].kind, 'fetch');
assert.equal(egy.objectives[0].count, 2);
assert.equal(egy.objectives[1].kind, 'survive');

assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), true);
assert.equal(shouldUseStoryMissions({ countryId: 'POL', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), true);
assert.equal(shouldUseStoryMissions({ countryId: 'DEU', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), true);
assert.equal(shouldUseStoryMissions({ countryId: 'LOST', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'storm', isGuest: false, isCoop: false, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: true, isCoop: true, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: true, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: true }), false);

assert.deepEqual(storyPreview('UKR'), ['🆘', '📡', '🛡️']);
const preview = storyPreview('POL');
assert.equal(preview.join(''), '🔥🚂🏰');
assert.deepEqual(storyPreview('LOST'), null);
assert.deepEqual(storyPreview('LAB'), null);

// 📖 Кампанія 2.0 (v282): усі 12 кампанійних країн мають історію з 3 цілями та НПС
const EXPECTED_STORY_SHAPE = {
  DEU: { npcKind: 'granny', npcSite: 'cityGate', ids: ['deu-workshop', 'deu-convoy', 'deu-gate', 'deu-barracks'], icons: '🔧🚚🛡️🏚️' },
  FRA: { npcKind: 'kid', npcSite: 'cafe', ids: ['fra-kitchen', 'fra-balloon', 'fra-cellar'], icons: '🥐🎈🍇' },
  ESP: { npcKind: 'granny', npcSite: 'fiestaSquare', ids: ['esp-band', 'esp-bells', 'esp-fireworks'], icons: '🎺🔔🎆' },
  PRT: { npcKind: 'kid', npcSite: 'harborSquare', ids: ['prt-fishers', 'prt-lighthouse', 'prt-docks'], icons: '⛵🚨⚓' },
  ITA: { npcKind: 'granny', npcSite: 'fountainSquare', ids: ['ita-trattoria', 'ita-aqueduct', 'ita-legion'], icons: '🍕⛲🏛️' },
  TUR: { npcKind: 'granny', npcSite: 'teaGarden', ids: ['tur-bazaar', 'tur-lighthouse', 'tur-spices', 'tur-rescue-ship'], icons: '🧿🗼🌶️🚢' },
  SWE: { npcKind: 'kid', npcSite: 'townSquare', ids: ['swe-longhouse', 'swe-aurora', 'swe-jarl'], icons: '🛶🌌❄️' },
  JPN: { npcKind: 'kid', npcSite: 'toriiGate', ids: ['jpn-teahouse', 'jpn-lanterns', 'jpn-dojo'], icons: '🌸🏮🥋' },
  CHN: { npcKind: 'granny', npcSite: 'teaMarket', ids: ['chn-scrolls', 'chn-beacon', 'chn-pit'], icons: '📜🔥🏺' },
};
for (const [cid, exp] of Object.entries(EXPECTED_STORY_SHAPE)) {
  const story = getCountryStory(cid);
  assert.ok(story, `${cid}: історія існує`);
  assert.equal(story.npc.kind, exp.npcKind, `${cid}: kind НПС`);
  assert.equal(story.npc.site, exp.npcSite, `${cid}: site НПС`);
  assert.deepEqual(story.objectives.map((o) => o.id), exp.ids, `${cid}: ідентифікатори цілей`);
  assert.equal(storyPreview(cid).join(''), exp.icons, `${cid}: іконки превʼю`);
  for (const o of story.objectives) {
    assert.ok(typeof o.title === 'function' && o.title(), `${cid}/${o.id}: title`);
    assert.ok(typeof o.start === 'function' && o.start(), `${cid}/${o.id}: start`);
    assert.ok(typeof o.done === 'function' && o.done(), `${cid}/${o.id}: done`);
    assert.ok(o.reward > 0, `${cid}/${o.id}: reward`);
  }
  assert.ok(typeof story.npc.intro === 'function' && story.npc.intro(), `${cid}: intro НПС`);
  assert.ok(typeof story.title === 'function' && story.title(), `${cid}: назва глави`);
}

// 🗺️ storySites: кожна ціль і НПС мають точку на карті своєї країни
const MAP_BY_COUNTRY = {
  DEU: 'germany', FRA: 'france', ESP: 'spain', PRT: 'portugal', ITA: 'italy',
  TUR: 'turkey', SWE: 'sweden', JPN: 'japan', CHN: 'china',
};
for (const [cid, mapName] of Object.entries(MAP_BY_COUNTRY)) {
  const map = await loadMapModule(mapName);
  const story = getCountryStory(cid);
  assert.ok(map.storySites, `${mapName}: storySites існує`);
  for (const o of story.objectives) {
    assert.ok(map.storySites[o.site], `${mapName}: storySites.${o.site} для ${o.id}`);
  }
  assert.ok(map.storySites[story.npc.site], `${mapName}: storySites.${story.npc.site} для НПС ${cid}`);
  assert.ok(map.storySites.arena, `${mapName}: storySites.arena`);
}

const ukraineMap = await loadMapModule('ukraine');
assert.ok(ukraineMap.storySites.barn);
assert.ok(ukraineMap.storySites.tower);
assert.ok(ukraineMap.storySites.village);

const polandMap = await loadMapModule('poland');
assert.ok(polandMap.storySites.railDepot);
assert.ok(polandMap.storySites.castleRuin);
assert.ok(polandMap.storySites.castleRuin.r >= 34, 'великий польський замок має радіус не менше 34 м');
assert.equal(polandMap.storySites.bonfires.length, 3);

const egyptMap = await loadMapModule('egypt');
assert.ok(egyptMap.storySites.sphinx);
assert.ok(egyptMap.storySites.pyramid);
assert.ok(egyptMap.storySites.tombDoor);
assert.equal(egyptMap.storySites.seals.length, 2);

console.log('✅ story selector preview pass');
console.log('✅ story campaign 2 definitions pass');
