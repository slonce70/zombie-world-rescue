import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg, detail = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, detail);
  if (!ok) failed++;
};

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
await page.click('#btn-solo');
await page.waitForSelector('#overlay-solo.show', { timeout: 10000 });
await page.click('.solo-mode[data-mode="campaign"]');
await page.waitForSelector('#solo-countries #country-list .country-item[data-id="UKR"] .mission-preview span', { timeout: 10000 });

const preview = await page.evaluate(() => [...document.querySelectorAll('#solo-countries #country-list .country-item[data-id="UKR"] .mission-preview span')].map((el) => el.textContent));
check(preview.join('') === '🆘📡🛡️', 'UKR preview uses story icons', preview.join(''));

await page.click('#solo-countries #country-list .country-item[data-id="UKR"]');
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
let st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
}));
check(st.kind === 'StoryMissions', 'UKR solo campaign uses StoryMissions', JSON.stringify(st));
check(st.ids.join(',') === 'ukr-rescue,ukr-signal,ukr-defense', 'UKR story objective IDs are present', JSON.stringify(st.ids));

await page.evaluate(() => window.__game.test.completeStoryObjective('ukr-rescue'));
st = await page.evaluate(() => ({
  ids: window.__game.test.storyObjectiveIds(),
  hud: window.__game.level.missions.getHudList().map((m) => ({ title: m.title, done: m.done })),
  current: window.__game.level.missions.currentStoryObjective(),
}));
check(st.hud[0].done && /сигнал/i.test(st.current), 'UKR story advances from rescue to signal', JSON.stringify(st));

await page.evaluate(() => {
  window.__game.test.completeStoryObjective('ukr-signal');
  window.__game.test.completeStoryObjective('ukr-defense');
});
st = await page.evaluate(() => ({
  unlocked: window.__game.level.missions.bossUnlocked,
  markers: window.__game.level.missions.getMarkers().map((m) => m.icon),
}));
check(st.unlocked && st.markers.includes('👑'), 'UKR story unlocks boss after final objective', JSON.stringify(st));

let legacy = await page.evaluate(() => {
  try {
    return { ok: true, missions: window.__game.test.state().missions };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});
check(legacy.ok, 'legacy test.state().missions works for StoryMissions', JSON.stringify(legacy));
check(legacy.ok && legacy.missions.map((m) => m.id).join(',') === 'rescue,tower,warehouse', 'legacy story mission slot IDs are stable', JSON.stringify(legacy.missions));

await page.evaluate(() => {
  window.__game.test.completeMission('rescue');
  window.__game.test.completeMission('tower');
  window.__game.test.completeMission('warehouse');
});
legacy = await page.evaluate(() => window.__game.test.state());
check(legacy.missions.every((m) => m.state === 'done') && legacy.bossStarted === false, 'legacy story mission aliases complete UKR objectives', JSON.stringify({ missions: legacy.missions, bossStarted: legacy.bossStarted }));

await page.evaluate(async () => {
  window.__game.endLevel();
  await window.__game.startLevel('UKR');
  window.__game.test.completeMission('ukr-rescue');
  window.__game.test.completeMission('ukr-signal');
  window.__game.test.completeMission('ukr-defense');
  window.__game.test.finishHorde();
  const arena = window.__game.level.world.layout.arena;
  window.__game.test.teleport(arena.x, arena.z);
});
legacy = await page.evaluate(() => window.__game.test.state());
check(legacy.missions.every((m) => m.state === 'done'), 'exact story objective IDs complete through legacy helper', JSON.stringify(legacy.missions));
await page.waitForFunction(() => window.__game.test.state().bossStarted, null, { timeout: 10000 }).catch(() => null);
legacy = await page.evaluate(() => window.__game.test.state());
check(legacy.bossStarted === true, 'story compatibility wrapper starts boss after UKR objectives', JSON.stringify({ bossStarted: legacy.bossStarted }));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('POL'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
  marker: window.__game.level.missions.getMarkers()[0],
}));
check(st.kind === 'StoryMissions' && st.ids[0] === 'pol-bonfires' && st.marker.icon === '🔥', 'POL starts with bonfire story', JSON.stringify(st));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('EGY'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
  marker: window.__game.level.missions.getMarkers()[0],
}));
check(st.kind === 'StoryMissions' && st.ids[0] === 'egy-seals' && st.marker.icon === '🪬', 'EGY starts with seal story', JSON.stringify(st));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('DEU'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({ kind: window.__game.test.missionKind() }));
check(st.kind === 'DynamicMissions', 'DEU keeps DynamicMissions fallback', JSON.stringify(st));

check(errors.length === 0, `no JS errors (${errors.slice(0, 2).join('|')})`);
console.log(failed === 0 ? '✅ story campaign 2 browser selector pass' : `❌ story campaign 2 browser selector failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
