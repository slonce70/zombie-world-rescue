import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, browser, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, pageErrorPrefix: '' });

let failed = 0;
const check = makeCheck(() => failed++);

const completeStoryObjectiveSnapshot = (objectiveId, delegateId) => page.evaluate(({ objectiveId, delegateId }) => {
  const missions = window.__game.level.missions;
  const first = missions.get(objectiveId);
  const bus = window.__game.level.bus;
  const originalEmit = bus.emit;
  const events = [];
  bus.emit = function emitWithMissionDoneCapture(eventName, ...args) {
    if (eventName === 'missionDone') {
      const m = args[0] || {};
      events.push({ id: m.id, type: m.type, title: m.title, reward: m.reward });
    }
    return originalEmit.call(this, eventName, ...args);
  };
  try {
    window.__game.test.completeStoryObjective(objectiveId);
  } finally {
    bus.emit = originalEmit;
  }
  const real = missions.delegate.get(delegateId);
  const legacy = missions.delegate.get('rescue');
  return {
    storyTitle: first.title,
    current: missions.currentStoryObjective(),
    hud: missions.getHudList().map((m) => ({ title: m.title, done: m.done })),
    story: missions.get(objectiveId),
    real: real && { id: real.id, type: real.type, state: real.state, title: real.title },
    legacy: legacy && { id: legacy.id, type: legacy.type, state: legacy.state, title: legacy.title },
    events,
  };
}, { objectiveId, delegateId });

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
await page.click('.globe-other > summary');
await page.click('#btn-solo');
await page.waitForSelector('#overlay-solo.show', { timeout: 10000 });
await page.click('.solo-mode[data-mode="campaign"]');
await page.waitForSelector('#solo-countries #country-list .country-item[data-id="UKR"] .mission-preview span', { timeout: 10000 });

const previews = await page.evaluate(() => [...document.querySelectorAll('#solo-countries #country-list .country-item')].map((country) => ({
  id: country.dataset.id,
  icons: [...country.querySelectorAll('.mission-preview span')].map((el) => el.textContent),
})));
const preview = previews.find((country) => country.id === 'UKR')?.icons || [];
check(preview.join('') === '🆘📡🛡️🏗️', 'UKR preview shows all 4 story goals', preview.join(''));
check(previews.every((country) => country.icons.length === 4), 'every campaign country preview shows all 4 missions', JSON.stringify(previews));

await page.click('#solo-countries #country-list .country-item[data-id="UKR"]');
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#mission-list .story-objective')?.textContent, null, { timeout: 3000 });
const storyObjectiveText = await page.evaluate(() => document.querySelector('#mission-list .story-objective')?.textContent || '');
check(/Врятуй людей/.test(storyObjectiveText), 'HUD shows current UKR story objective', storyObjectiveText);
const visible = await page.locator('#mission-list .story-objective').count();
check(visible === 1, 'HUD renders exactly one primary objective');
const text = await page.locator('#mission-list').innerText();
const objective = 'Врятуй людей із хліва';
check(text.split(objective).length - 1 === 1, 'primary objective is not duplicated');
let st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
  replayNightRaid: window.__game.level.missions && window.__game.level.missions.replayNightRaid,
  current: window.__game.level.missions.currentStoryObjective(),
}));
check(st.kind === 'StoryMissions', 'UKR solo campaign uses StoryMissions', JSON.stringify(st));
check(st.ids.join(',') === 'ukr-rescue,ukr-signal,ukr-defense,ukr-rebuild', 'UKR story objective IDs are present', JSON.stringify(st.ids));
const ukrHudCount = await page.evaluate(() => window.__game.level.missions.getHudList().length);
check(ukrHudCount === 4, 'UKR HUD shows all 4 real missions', String(ukrHudCount));
check(st.replayNightRaid === false, 'first UKR story start does not enable replayNightRaid', JSON.stringify(st));
check(!/Нічний рейд/.test(st.current), 'first UKR story objective does not announce Night Raid', JSON.stringify(st));

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
  current: window.__game.level.missions.currentStoryObjective(),
  unlocked: window.__game.level.missions.bossUnlocked,
  markers: window.__game.level.missions.getMarkers().map((m) => m.icon),
}));
check(!st.unlocked && /віднови центр/i.test(st.current), 'UKR story advances from defense to rebuild', JSON.stringify(st));
await page.evaluate(() => window.__game.test.completeStoryObjective('ukr-rebuild'));
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
  window.__game.test.completeMission('ukr-rebuild');
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
st = await completeStoryObjectiveSnapshot('pol-bonfires', 'bonfire');
check(st.real && st.real.state === 'done' && st.story.state === 'done' && /поїзд/i.test(st.current), 'POL bonfire story completes real bonfire delegate and advances to train', JSON.stringify(st));
check(st.events.length === 1 && st.events[0]?.id === 'pol-bonfires' && st.events[0]?.title === st.storyTitle, 'POL bonfire completion emits one story missionDone payload', JSON.stringify({ storyTitle: st.storyTitle, events: st.events, hud: st.hud }));
await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('POL'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => {
  const missions = window.__game.level.missions;
  missions.delegate._complete('bonfire');
  missions._syncObjectiveStates();
  const real = missions.delegate.get('bonfire');
  return {
    current: missions.currentStoryObjective(),
    story: missions.get('pol-bonfires'),
    real: real && { id: real.id, type: real.type, state: real.state, title: real.title },
  };
});
check(st.real && st.real.state === 'done' && st.story.state === 'done' && /поїзд/i.test(st.current), 'POL sync advances story after real bonfire delegate completion', JSON.stringify(st));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('EGY'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
  marker: window.__game.level.missions.getMarkers()[0],
  hudCount: window.__game.level.missions.getHudList().length,
}));
check(st.kind === 'StoryMissions' && st.ids[0] === 'egy-seals' && st.marker.icon === '🪬', 'EGY starts with seal story', JSON.stringify(st));
check(st.hudCount === 4, 'EGY HUD shows its 2 story goals and 2 extra missions', JSON.stringify(st));
st = await completeStoryObjectiveSnapshot('egy-seals', 'tomb');
check(st.real && st.real.state === 'done' && st.story.state === 'done' && /мум/i.test(st.current), 'EGY seal story completes real tomb delegate and advances to ambush', JSON.stringify(st));
check(st.events.length === 1 && st.events[0]?.id === 'egy-seals' && st.events[0]?.title === st.storyTitle, 'EGY seal completion emits one story missionDone payload', JSON.stringify({ storyTitle: st.storyTitle, events: st.events, hud: st.hud }));
await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('EGY'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => {
  const missions = window.__game.level.missions;
  missions.delegate._complete('tomb');
  missions._syncObjectiveStates();
  const real = missions.delegate.get('tomb');
  return {
    current: missions.currentStoryObjective(),
    story: missions.get('egy-seals'),
    real: real && { id: real.id, type: real.type, state: real.state, title: real.title },
  };
});
check(st.real && st.real.state === 'done' && st.story.state === 'done' && /мум/i.test(st.current), 'EGY sync advances story after real tomb delegate completion', JSON.stringify(st));

// 📖 Кампанія 2.0 (v282): усі 9 нових країн стартують зі своєю історією
const NEW_STORIES = [
  { id: 'DEU', first: 'deu-workshop', icon: '🔧', word: /механік/i, chapter: 'Осінній конвой' },
  { id: 'FRA', first: 'fra-kitchen', icon: '🥐', word: /кухар/i, chapter: 'Куля над Парижем' },
  { id: 'ESP', first: 'esp-band', icon: '🎺', word: /музикант/i, chapter: 'Фієста повертається' },
  { id: 'PRT', first: 'prt-fishers', icon: '⛵', word: /рибалок/i, chapter: 'Маяк Атлантики' },
  { id: 'ITA', first: 'ita-trattoria', icon: '🍕', word: /тратторі/i, chapter: 'Фонтан бажань' },
  { id: 'TUR', first: 'tur-bazaar', icon: '🧿', word: /килим/i, chapter: 'Килими й Босфор' },
  { id: 'SWE', first: 'swe-longhouse', icon: '🛶', word: /довгого дому/i, chapter: 'Північне сяйво' },
  { id: 'JPN', first: 'jpn-teahouse', icon: '🌸', word: /садівник/i, chapter: 'Сад тисячі ліхтариків' },
  { id: 'CHN', first: 'chn-scrolls', icon: '📜', word: /учених/i, chapter: 'Вогні Великої стіни' },
];
for (const c of NEW_STORIES) {
  await page.evaluate((cid) => { window.__game.endLevel(); window.__game.startLevel(cid); }, c.id);
  await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
  const s = await page.evaluate(() => ({
    kind: window.__game.test.missionKind(),
    ids: window.__game.test.storyObjectiveIds(),
    marker: window.__game.level.missions.getMarkers()[0],
    current: window.__game.level.missions.currentStoryObjective(),
    npc: !!(window.__game.level.missions.npcState && window.__game.level.missions.npcState.rig),
    hudCount: window.__game.level.missions.getHudList().length,
  }));
  check(s.kind === 'StoryMissions' && s.ids && s.ids[0] === c.first, `${c.id} starts its story (${c.first})`, JSON.stringify(s.ids));
  check(!!s.marker && s.marker.icon === c.icon, `${c.id} first marker is ${c.icon}`, JSON.stringify(s.marker));
  check(c.word.test(s.current), `${c.id} HUD shows first story objective`, s.current);
  check(s.npc, `${c.id} story NPC spawned`, String(s.npc));
  check(s.hudCount === 4, `${c.id} HUD shows all 4 real missions`, String(s.hudCount));
  // 📖 інтро-банер: назва глави і репліка НПС потрапляють у DOM
  const intro = await page.evaluate(() => {
    const m = window.__game.level.missions;
    m._introShown = false;
    m._showIntro();
    return {
      title: document.getElementById('banner-title')?.textContent || '',
      sub: document.getElementById('banner-sub')?.textContent || '',
    };
  });
  check(intro.title.includes(c.chapter), `${c.id} intro banner shows chapter title`, JSON.stringify(intro.title));
  check(intro.sub.length > 5, `${c.id} intro banner shows NPC line`, JSON.stringify(intro.sub));
  // перша ціль завершується і історія просувається далі
  const adv = await page.evaluate((firstId) => {
    window.__game.test.completeStoryObjective(firstId);
    const m = window.__game.level.missions;
    return { done: m.get(firstId).state === 'done', current: m.currentStoryObjective() };
  }, c.first);
  check(adv.done && !!adv.current, `${c.id} advances after first objective`, JSON.stringify(adv));
}

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('LOST'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  replayNightRaid: window.__game.level.missions && window.__game.level.missions.replayNightRaid,
}));
check(st.kind === 'DynamicMissions', 'LOST keeps DynamicMissions fallback', JSON.stringify(st));
check(!st.replayNightRaid, 'LOST fallback has no replayNightRaid truthy value', JSON.stringify(st));

await page.evaluate(async () => {
  if (window.__game.level) window.__game.endLevel();
  window.__game.save.liberated = { UKR: true };
  window.__game.save.missionRuns = { UKR: 1 };
  await window.__game.startLevel('UKR');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
await page.waitForTimeout(100);
st = await page.evaluate(() => ({
  updated: (window.__game._updateDayNight(), true),
  kind: window.__game.test.missionKind(),
  replayNightRaid: window.__game.level.missions && window.__game.level.missions.replayNightRaid,
  current: window.__game.level.missions.currentStoryObjective(),
  statsTime: window.__game.level.stats && window.__game.level.stats.time,
  nightK: window.__game.test.state().nightK,
  worldTime: window.__game.level.world && window.__game.level.world.time,
}));
check(st.kind === 'StoryMissions', 'liberated UKR replay still uses StoryMissions', JSON.stringify(st));
check(st.replayNightRaid === true, 'liberated UKR replay enables replayNightRaid', JSON.stringify(st));
check(st.current.startsWith('🌙 Нічний рейд · '), 'liberated UKR replay objective uses Night Raid prefix', JSON.stringify(st));
check(st.statsTime >= 150, 'liberated UKR replay sets engine-consumed stats time', JSON.stringify(st));
check(st.nightK > 0, 'liberated UKR replay reaches engine-consumed night signal', JSON.stringify(st));
check(st.worldTime >= 150, 'liberated UKR replay pushes world toward night', JSON.stringify(st));

check(errors.length === 0, `no JS errors (${errors.slice(0, 2).join('|')})`);
console.log(failed === 0 ? '✅ story campaign 2 browser selector pass' : `❌ story campaign 2 browser selector failed: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
