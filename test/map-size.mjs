import { openBrowserTest, makeCheck } from './_browser.mjs';
import { mkdirSync } from 'fs';

const { BASE, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader'] }, context: { viewport: { width: 1280, height: 800 } }, captureErrors: false });
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe');

const profiles = await page.evaluate(async () => {
  const { MAP_SIZE_MODES, MAP_SIZE_METERS, mapSizeScale, scaleMap } = await import('/src/mapsize.js');
  const sample = {
    bound: 200,
    spawn: { x: 0, z: 170 },
    storySites: { castle: { x: -112, z: -112, r: 36 } },
    roads: [[[0, 190], [-112, -76]]],
    terrain: (x, z) => x + z,
  };
  const modes = Object.fromEntries(MAP_SIZE_MODES.map((mode) => {
    const map = scaleMap(sample, mode);
    return [mode, {
      meters: MAP_SIZE_METERS[mode], scale: mapSizeScale(mode), bound: map.bound,
      castle: map.storySites.castle, road: map.roads[0][1], terrain: map.terrain(10, 20),
    }];
  }));
  return { modes, sourceBound: sample.bound, sourceCastle: sample.storySites.castle };
});

check(profiles.modes.small.meters === 500 && profiles.modes.standard.meters === 750
  && profiles.modes.large.meters === 950 && profiles.modes.huge.meters === 1250,
'розміри відповідають −250 / стандарт / +200 / +500 м');
check(Math.abs(profiles.modes.small.bound - 133.3333333) < 0.001
  && Math.abs(profiles.modes.large.bound - 253.3333333) < 0.001
  && Math.abs(profiles.modes.huge.bound - 333.3333333) < 0.001,
'масштабуються межі всіх трьох нестандартних карт');
check(profiles.modes.small.castle.x < -74 && profiles.modes.small.castle.r === 24
  && profiles.modes.small.road[0] < -74,
'сюжетна точка, її радіус і дороги масштабуються разом');
check(profiles.modes.small.terrain === 45, 'рельєф читає координати у масштабі карти');
check(profiles.sourceBound === 200 && profiles.sourceCastle.x === -112,
'початковий конфіг карти не мутується');

const labels = [];
await page.locator('#btn-menu').click();
await page.locator('#btn-map-size').scrollIntoViewIfNeeded();
await page.screenshot({ path: 'shots/map-size-settings.png' });
await page.locator('#overlay-menu .panel-close').click();
for (let i = 0; i < 4; i++) {
  labels.push(await page.locator('#btn-map-size').innerText());
  await page.evaluate(() => document.getElementById('btn-map-size').click());
}
const saved = await page.evaluate(() => ({ mapSize: window.__game.save.mapSize, raw: JSON.parse(localStorage.getItem('zr-save-v1')).mapSize }));
check(labels.some((s) => s.includes('500')) && labels.some((s) => s.includes('750'))
  && labels.some((s) => s.includes('950')) && labels.some((s) => s.includes('1250')),
'кнопка показує всі 4 розміри', JSON.stringify(labels));
check(saved.mapSize === 'standard' && saved.raw === 'standard', 'повний цикл повертає та зберігає стандартну карту');

await page.evaluate(async () => {
  window.__game.save.mapSize = 'small';
  window.__game.saveGame();
  await window.__game.startLevel('POL');
});
await page.waitForFunction(() => window.__game && window.__game.state === 'level');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/map-size-small-poland.png' });
const runtime = await page.evaluate(() => {
  const g = window.__game;
  const c = g.level.country.map.storySites.castleRuin;
  return {
    mode: g.level.mapSize,
    bound: g.level.world.layout.BOUND,
    castle: c,
    castleEdge: Math.hypot(c.x, c.z) + c.r,
  };
});
check(runtime.mode === 'small' && Math.abs(runtime.bound - 133.3333333) < 0.001,
'нова гра застосовує маленьку карту', JSON.stringify(runtime));
check(runtime.castleEdge < runtime.bound,
'замок повністю залишається всередині маленької карти', JSON.stringify(runtime));

await closeTest();
process.exit(failed ? 1 : 0);
