// 🐛 Баг (репорт з України): «Завдання пише "врятуй людей з хліва", а по факту
// треба набрати води з колодязя; і коли набираємо 1 відро — озвучує, що квест
// виконано, хоча ще ні.» Тут — регресійні перевірки обох частин фіксу:
//  1) статично: для всіх 12 сюжетних країн × runIndex 0..5 набір-делегат містить
//     preferred[0] КОЖНОЇ цілі у перших 3 слотах, слоти фірмових місій дотримані;
//  2) браузер: UKR на runIndex, де БЕЗ фіксу випадав «колодязь замість хліва»,
//     тепер делегує ukr-rescue у місію типу 'rescue';
//  3) браузер: активуй-місія — 1 з N точок дає ЧЕКПОЙНТ (без голосу «виконано»),
//     і лише фінальна точка грає mission() рівно один раз.
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, pageErrorPrefix: '' });

let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// ─────────────────────────────────────────────────────────────────────────────
// ЧАСТИНА 1 — статично: набір-делегат ЗАВЖДИ покриває preferred[0] кожної цілі.
// Рахуємо у браузері через нативний ESM-import (модулі тягнуть three).
const staticRes = await page.evaluate(async () => {
  const sm = await import('/src/story/storymissions.js');
  const mp = await import('/src/missionpool.js');
  const cs = await import('/src/story/countryStories.js');
  const co = await import('/src/countries.js');
  const { storyMissionSet, STORY_DELEGATE_MATCHES } = sm;
  const { MISSION_TYPES } = mp;
  const { STORY_COUNTRY_IDS, getCountryStory } = cs;
  const { COUNTRIES } = co;
  const fails = [];
  let cases = 0;
  const samples = {};
  for (const cid of STORY_COUNTRY_IDS) {
    const story = getCountryStory(cid);
    const required = story.objectives
      .map((o) => (STORY_DELEGATE_MATCHES[o.id] && STORY_DELEGATE_MATCHES[o.id].preferred || [])[0])
      .filter(Boolean);
    const seeds = [COUNTRIES[cid] ? COUNTRIES[cid].seed : 1, 1, 999, 55555, 314159];
    for (let runIndex = 0; runIndex <= 5; runIndex++) {
      for (const seed of seeds) {
        cases++;
        const set = storyMissionSet(cid, seed, runIndex);
        const first3 = set.slice(0, 3);
        for (const p of required) {
          const bonus = MISSION_TYPES[p].slots.includes('D');
          if ((bonus && set[3] !== p) || (!bonus && !first3.includes(p))) {
            fails.push(`${cid} ri${runIndex} seed${seed}: missing ${p} in ${JSON.stringify(set)}`);
          }
        }
        for (let i = 0; i < 3; i++) {
          const mt = MISSION_TYPES[set[i]];
          if (mt && mt.country && !mt.slots.includes('ABC'[i])) {
            fails.push(`${cid} ri${runIndex}: signature ${set[i]} in wrong slot ${'ABC'[i]} ${JSON.stringify(set)}`);
          }
        }
        if (new Set(first3).size !== first3.length) fails.push(`${cid} ri${runIndex}: dup ${JSON.stringify(set)}`);
        if (seed === (COUNTRIES[cid] ? COUNTRIES[cid].seed : 1) && runIndex === 2) samples[cid] = JSON.stringify(set);
      }
    }
  }
  return { fails, cases, samples, countries: STORY_COUNTRY_IDS.length };
});
check(staticRes.countries === 12, 'story campaign covers 12 countries', String(staticRes.countries));
check(staticRes.fails.length === 0, `all story sets cover preferred[0] (${staticRes.cases} cases)`, staticRes.fails.slice(0, 3).join(' | '));
console.log('  ℹ️ samples (runIndex 2, real seed):', JSON.stringify(staticRes.samples));

// ─────────────────────────────────────────────────────────────────────────────
// ЧАСТИНА 2 — UKR: спершу ДОВОДИМО баг на природному ролі, тоді перевіряємо фікс.
const bugProof = await page.evaluate(async () => {
  const mp = await import('/src/missionpool.js');
  const co = await import('/src/countries.js');
  const seed = co.COUNTRIES.UKR.seed;
  const set = mp.rollMissionSet('UKR', seed, 2); // runIndex 2
  const first3 = set.slice(0, 3);
  return { seed, set, wellSlot0: first3[0] === 'well', rescueInFirst3: first3.includes('rescue') };
});
check(bugProof.wellSlot0 && !bugProof.rescueInFirst3,
  'BUG reproduced on raw roll: UKR ri2 puts well in slot A and no rescue', JSON.stringify(bugProof.set));

await page.evaluate(async () => {
  if (window.__game.level) window.__game.endLevel();
  window.__game.save.liberated = {};
  window.__game.save.missionRuns = { UKR: 2 };
  await window.__game.startLevel('UKR');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
const fix = await page.evaluate(() => {
  const missions = window.__game.level.missions;
  const setTypes = missions.delegate.missions.map((m) => m.type);
  const obj = missions.objectives.find((o) => o.id === 'ukr-rescue');
  const dm = missions._delegateMissionForObjective(obj);
  const rescueDelegate = missions.delegate.get('rescue');
  return {
    runIndex: missions.delegate.runIndex,
    setTypes,
    rescueInFirst3: setTypes.slice(0, 3).includes('rescue'),
    wellInFirst3: setTypes.slice(0, 3).includes('well'),
    delegateType: dm && dm.type,
    rescueDelegate: !!rescueDelegate,
    storyTitle: missions.get('ukr-rescue').title,
  };
});
check(fix.runIndex === 2, 'UKR delegate built with runIndex 2', JSON.stringify(fix.runIndex));
check(fix.rescueInFirst3 && !fix.wellInFirst3, 'story set now has rescue (not well) in first 3 slots', JSON.stringify(fix.setTypes));
check(fix.rescueDelegate && fix.delegateType === 'rescue', 'ukr-rescue delegates to a real rescue mission', JSON.stringify({ dm: fix.delegateType, has: fix.rescueDelegate }));
check(/Врятуй людей/.test(fix.storyTitle), 'ukr-rescue story title still speaks of rescuing people', fix.storyTitle);

// ─────────────────────────────────────────────────────────────────────────────
// ЧАСТИНА 3 — активуй-місія: чекпойнт на проміжних точках, mission() лише на фіналі.
await page.evaluate(async () => {
  window.__game.test.forceMissions(['well', 'repair', 'clear', 'collect']);
  window.__game.endLevel();
  await window.__game.startLevel('LOST'); // не-сюжетна країна → чистий DynamicMissions
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level
  && window.__game.level.missions.get('well'), null, { timeout: 30000 });

const audio = await page.evaluate(() => {
  const g = window.__game;
  const level = g.level;
  const missions = level.missions;
  const m = missions.get('well');
  missions.livingWorldOffered = true; // не даємо «живому світу» смикнути mission() окремо
  const counts = { mission: 0, checkpoint: 0 };
  const origMission = level.audio.mission.bind(level.audio);
  const origCheck = level.audio.checkpoint.bind(level.audio);
  level.audio.mission = (...a) => { counts.mission++; return origMission(...a); };
  level.audio.checkpoint = (...a) => { counts.checkpoint++; return origCheck(...a); };
  level.audio.voiceOnce = () => {}; // прибираємо голосові кулдауни/побічку

  const total = m.points.length;
  const completePoint = (i) => {
    const p = m.points[i];
    g.test.teleport(p.x, p.z);
    p.progress = 0.99;
    g.input.keys.add('KeyE');
    missions._up_well(m, 1.0, g.input, true); // LOST → DynamicMissions напряму
    g.input.keys.delete('KeyE');
  };

  completePoint(0);
  const afterFirst = { mission: counts.mission, checkpoint: counts.checkpoint, activated: m.activated, done: m.state === 'done' };
  for (let i = 1; i < total; i++) completePoint(i);
  const afterAll = { mission: counts.mission, checkpoint: counts.checkpoint, activated: m.activated, done: m.state === 'done' };
  return { total, afterFirst, afterAll };
});
check(audio.total === 3, 'well mission has 3 activation points', String(audio.total));
check(audio.afterFirst.mission === 0 && audio.afterFirst.checkpoint === 1 && !audio.afterFirst.done,
  'one point of several: checkpoint fired, mission() did NOT', JSON.stringify(audio.afterFirst));
check(audio.afterAll.mission === 1 && audio.afterAll.done,
  'all points done: mission() fired exactly once', JSON.stringify(audio.afterAll));
check(audio.afterAll.checkpoint === 2,
  'checkpoint fired only on the 2 intermediate points', JSON.stringify(audio.afterAll));

await page.evaluate(() => { window.__game.test.forceMissions(null); });

check(errors.length === 0, `no JS errors (${errors.slice(0, 2).join('|')})`);
console.log(failed === 0 ? '✅ story delegate match pass' : `❌ story delegate match failed: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
