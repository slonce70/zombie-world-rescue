// 🇸🇪 v293 «Характер країн»: Швеція отримала ВЛАСНУ карту (фіорд «Північне сяйво»),
// більше не ділить карту Польщі. Перевіряємо: рівень вантажиться на новій карті,
// усі нордичні storySites існують і в межах bound, сюжетні цілі знаходять свої
// точки, клітка друга (Ліннея) отримує якір, а рельєф відрізняється від Польщі.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=SWE`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Швеція на власній карті');
const swe = await page.evaluate(() => {
  const g = window.__game;
  const map = g.level.country.map;
  return {
    country: g.level.countryId,
    zombies: g.level.zombies.list.length,
    bound: map.bound,
    storySites: map.storySites,
    sites: Object.keys(map.sites),
  };
});
check(swe.country === 'SWE', 'країна SWE завантажилась', swe.country);
check(swe.zombies > 0, 'на мапі є зомбі', String(swe.zombies));

console.log('▸ Нордичні storySites у межах карти');
const NEEDED = ['townSquare', 'longhouse', 'auroraTower', 'jarlCamp', 'arena'];
for (const k of NEEDED) {
  const s = swe.storySites[k];
  const ok = s && Number.isFinite(s.x) && Number.isFinite(s.z)
    && Math.abs(s.x) <= swe.bound && Math.abs(s.z) <= swe.bound;
  check(ok, `storySites.${k} існує і в межах bound`, JSON.stringify(s));
}
for (const k of ['village', 'rescue', 'tower', 'warehouse', 'arena']) {
  check(swe.sites.includes(k), `sites.${k} присутній`);
}

console.log('▸ Сюжет «Північне сяйво» знаходить свої точки');
const story = await page.evaluate(() => {
  const m = window.__game.level.missions;
  return {
    kind: m.constructor.name,
    ids: window.__game.test.storyObjectiveIds ? window.__game.test.storyObjectiveIds() : null,
    markers: m.getMarkers ? m.getMarkers().length : 0,
    firstMarker: m.getMarkers ? m.getMarkers()[0] : null,
    npc: !!(m.npcState && m.npcState.rig),
  };
});
check(story.kind === 'StoryMissions', 'SWE grає StoryMissions (соло-кампанія)', story.kind);
check(story.ids && story.ids[0] === 'swe-longhouse', 'перша ціль — swe-longhouse', JSON.stringify(story.ids));
check(story.markers > 0 && !!story.firstMarker, 'маркери цілей існують', JSON.stringify(story.firstMarker));
check(story.npc, 'НПС Ерік з\'явився на townSquare');

console.log('▸ Клітка друга (Ліннея) отримала якір');
const cage = await page.evaluate(() => {
  const rc = window.__game.level.rescueCage;
  if (!rc) return null;
  const b = window.__game.level.country.map.bound;
  return { active: rc.active, x: rc.cageX, z: rc.cageZ, inBound: Math.abs(rc.cageX) <= b && Math.abs(rc.cageZ) <= b };
});
check(!!cage && cage.active, 'клітка друга активна на карті', JSON.stringify(cage));
check(!!cage && cage.inBound && (cage.x !== 0 || cage.z !== 0), 'якір клітки в межах карти', JSON.stringify(cage));

console.log('▸ Рельєф відрізняється від Польщі');
const terr = await page.evaluate(async () => {
  const swMap = (await import('/src/maps/sweden.js')).default;
  const plMap = (await import('/src/maps/poland.js')).default;
  // семплимо у зонах фірмового рельєфу Швеції (фіорд/скелі), де карти розходяться
  const coords = [[-64, -56], [-145, 10], [168, -40], [-100, -188], [140, -62]];
  let diffs = 0;
  for (const [x, z] of coords) {
    const a = swMap.terrain(x, z), b = plMap.terrain(x, z);
    if (Math.abs(a - b) > 0.5) diffs++;
  }
  return { sameModule: swMap === plMap, diffs, total: coords.length };
});
check(!terr.sameModule, 'sweden.js — окремий модуль, не poland.js');
check(terr.diffs >= 3, `рельєф Швеції відрізняється у ${terr.diffs}/${terr.total} точках`, String(terr.diffs));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 КАРТА ШВЕЦІЇ ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
