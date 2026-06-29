import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  OK' : '  FAIL'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};

page.on('pageerror', (e) => { console.log('PAGEERROR:', e.message); failed++; });

await page.goto(`${BASE}/index.html?test&parts-only`, { waitUntil: 'commit', timeout: 60000 });
const res = await page.evaluate(async () => {
  const THREE = await import('/vendor/three.module.js');
  const {
    makeHero, buildHeroHat, HERO_BODY_TYPES, HERO_HAIR, HERO_ACCESSORIES, HERO_BACKS, HERO_HATS,
  } = await import('/src/characters.js');
  const hero = { body: 'armor', hair: 'mohawk', accessory: 'star', back: 'cape' };
  const rig = makeHero('custom', hero);
  const hatClearance = {};
  const faceClearance = {};
  for (const id of Object.keys(HERO_HATS).filter((x) => x !== 'none')) {
    const g = new THREE.Group();
    buildHeroHat(g, id, 0xff0000);
    const mins = g.children.map((child) => new THREE.Box3().setFromObject(child).min.y);
    hatClearance[id] = +Math.min(...mins).toFixed(3);
    faceClearance[id] = +(id === 'cap' || id === 'beanie' ? mins[1]
      : id === 'cowboy' || id === 'crown' ? mins[0]
      : Math.min(...mins)).toFixed(3);
  }
  return {
    bodies: Object.keys(HERO_BODY_TYPES || {}),
    hair: Object.keys(HERO_HAIR || {}),
    accessories: Object.keys(HERO_ACCESSORIES || {}),
    backs: Object.keys(HERO_BACKS || {}),
    built: !!(rig && rig.group && rig.parts && rig.parts.head && rig.parts.torso),
    spec: rig && rig.spec,
    hatClearance,
    faceClearance,
  };
});

check(res.bodies.length >= 3, 'body type registry has choices', JSON.stringify(res.bodies));
check(res.hair.length >= 4, 'hair registry has choices', JSON.stringify(res.hair));
check(res.accessories.length >= 4, 'accessory registry has choices', JSON.stringify(res.accessories));
check(res.backs.length >= 4, 'back item registry has choices', JSON.stringify(res.backs));
check(res.built, 'custom hero with rich parts builds');
check(res.spec && res.spec.belly > 1, 'armor body changes silhouette', JSON.stringify(res.spec));
check(res.faceClearance.cap >= 0.34 && res.faceClearance.beanie >= 0.32
  && res.faceClearance.cowboy >= 0.38 && res.faceClearance.crown >= 0.36
  && res.faceClearance.ears >= 0.32 && res.faceClearance.party >= 0.36,
  'hat fronts stay above the face', JSON.stringify({ all: res.hatClearance, face: res.faceClearance }));

await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
