// 🏕️🥚 Тижневий квест табору (v299): детермінізм від week-key, тік прогресу від подій
// (соло/кооп — локальні), клейм → +🥚+🍖 і claimed, БЕЗ FOMO (зміна тижня без клейму —
// нагорода лишається; після клейму — новий квест), ретро-безпека (старий сейв без weeklyCamp).
// Плюс перевірки hintOnce (по разу, збереження у save.hints).
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg, d = '') => { console.log(ok ? '  ✅' : '  ❌', msg, d); if (!ok) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Тижневий квест табору');

// 1. Детермінізм від week-key: квест = пул[week % 3]
const r1 = await page.evaluate(async () => {
  const m = await import('/src/weeklycamp.js');
  return {
    w0: m.weeklyCampQuestFor(0).id, w1: m.weeklyCampQuestFor(1).id, w2: m.weeklyCampQuestFor(2).id,
    w3: m.weeklyCampQuestFor(3).id, poolLen: m.WEEKLY_CAMP_QUESTS.length,
  };
});
check(r1.poolLen === 3, '1: пул із 3 квестів', JSON.stringify(r1));
check(r1.w0 !== r1.w1 && r1.w1 !== r1.w2 && r1.w0 !== r1.w2, '1: три різні квести за тижнями 0/1/2', JSON.stringify(r1));
check(r1.w3 === r1.w0, '1: тиждень 3 циклічно = тиждень 0', JSON.stringify(r1));

// 2. Тік прогресу від подій (метрика має збігатись із квестом тижня) + завершення
const r2 = await page.evaluate(async () => {
  const m = await import('/src/weeklycamp.js');
  const save = {};
  // знайти тиждень, де квест = elite, і тікати elite
  let wk = 0; while (m.weeklyCampQuestFor(wk).metric !== 'elite') wk++;
  const goal = m.weeklyCampQuestFor(wk).goal;
  let doneAt = -1;
  for (let i = 1; i <= goal; i++) { if (m.bumpWeeklyCamp(save, wk, 'elite', 1)) doneAt = i; }
  const st = m.weeklyCampState(save, wk);
  // невідповідна метрика не тікає
  const before = st.p;
  m.bumpWeeklyCamp(save, wk, 'rescue', 5);
  const afterWrong = m.weeklyCampState(save, wk).p;
  return { goal, doneAt, p: st.p, done: st.done, claimable: st.claimable, noTickOnWrongMetric: afterWrong === before };
});
check(r2.p === r2.goal && r2.done, '2: прогрес тікає до цілі і квест виконано', JSON.stringify(r2));
check(r2.doneAt === r2.goal, '2: «щойно виконано» повертається рівно на порозі', JSON.stringify(r2));
check(r2.claimable, '2: виконаний невзятий квест — claimable', JSON.stringify(r2));
check(r2.noTickOnWrongMetric, '2: подія іншої метрики не тікає квест', JSON.stringify(r2));

// 3. Клейм → +1🥚 +🍖×2 і claimed
const r3 = await page.evaluate(async () => {
  const m = await import('/src/weeklycamp.js');
  const save = { eggs: 0, petFood: 0 };
  let wk = 0; while (m.weeklyCampQuestFor(wk).metric !== 'elite') wk++;
  const goal = m.weeklyCampQuestFor(wk).goal;
  m.bumpWeeklyCamp(save, wk, 'elite', goal);
  const reward = m.claimWeeklyCamp(save, wk);
  const st = m.weeklyCampState(save, wk);
  const second = m.claimWeeklyCamp(save, wk); // повторний клейм заборонено
  return { reward, eggs: save.eggs, food: save.petFood, claimed: st.claimed, claimable: st.claimable, second };
});
check(r3.reward && r3.reward.eggs === 1 && r3.reward.food === 2, '3: клейм дає 1🥚 і 2🍖', JSON.stringify(r3));
check(r3.eggs === 1 && r3.food === 2, '3: нараховано у сейв', JSON.stringify(r3));
check(r3.claimed && !r3.claimable, '3: claimed=true, більше не claimable', JSON.stringify(r3));
check(r3.second === null, '3: повторний клейм заборонено', JSON.stringify(r3));

// 4. Зміна тижня БЕЗ клейму → нагорода лишається (той самий квест), не згорає
const r4 = await page.evaluate(async () => {
  const m = await import('/src/weeklycamp.js');
  const save = {};
  let wk = 0; while (m.weeklyCampQuestFor(wk).metric !== 'elite') wk++;
  const goal = m.weeklyCampQuestFor(wk).goal;
  m.bumpWeeklyCamp(save, wk, 'elite', goal); // виконано у тижні wk
  const heldId = m.weeklyCampState(save, wk).id;
  // наступний тиждень БЕЗ клейму
  const st = m.weeklyCampState(save, wk + 1);
  return { heldId, stillId: st.id, stillClaimable: st.claimable, wk: st.wk, expectWk: wk };
});
check(r4.stillClaimable && r4.stillId === r4.heldId && r4.wk === r4.expectWk, '4: зміна тижня без клейму → нагорода лишається (не згоряє)', JSON.stringify(r4));

// 5. Після клейму (нагороди минулого тижня) → стартує НОВИЙ квест поточного тижня
const r5 = await page.evaluate(async () => {
  const m = await import('/src/weeklycamp.js');
  const save = {};
  let wk = 0; while (m.weeklyCampQuestFor(wk).metric !== 'elite') wk++;
  const goal = m.weeklyCampQuestFor(wk).goal;
  m.bumpWeeklyCamp(save, wk, 'elite', goal);
  m.claimWeeklyCamp(save, wk + 1);           // клеймимо, перебуваючи вже в наступному тижні
  const st = m.weeklyCampState(save, wk + 1);
  const expected = m.weeklyCampQuestFor(wk + 1).id;
  return { newId: st.id, p: st.p, claimed: st.claimed, expected };
});
check(r5.newId === r5.expected && r5.p === 0 && !r5.claimed, '5: після клейму — новий квест поточного тижня (p=0)', JSON.stringify(r5));

// 6. Ретро-безпека: старий сейв без weeklyCamp не падає (чистий старт)
const r6 = await page.evaluate(async () => {
  const m = await import('/src/weeklycamp.js');
  let ok = true, id = '';
  try {
    const save = {}; // без weeklyCamp
    const st = m.weeklyCampState(save, 42);
    id = st.id; ok = st.p === 0 && !st.claimed && !!save.weeklyCamp;
    // сміття теж не має ламати
    const s2 = { weeklyCamp: 'broken' };
    m.weeklyCampState(s2, 42);
    const s3 = { weeklyCamp: { q: 'nonexistent', p: 'x', wk: null } };
    m.weeklyCampState(s3, 42);
  } catch (e) { ok = false; id = 'THREW:' + e.message; }
  return { ok, id };
});
check(r6.ok, '6: старий/зіпсований сейв без weeklyCamp не падає', JSON.stringify(r6));

// 7. Інтеграція з грою: _bumpCamp тікає save.weeklyCamp, панель відкривається без помилок
const r7 = await page.evaluate(async () => {
  const g = window.__game;
  const m = await import('/src/weeklycamp.js');
  let wk = 500; while (m.weeklyCampQuestFor(wk).metric !== 'victory') wk++;
  g._weekIndex = () => wk;
  g.save.weeklyCamp = null;
  const goal = m.weeklyCampQuestFor(wk).goal;
  for (let i = 0; i < goal; i++) g._bumpCamp('victory');
  const st = m.weeklyCampState(g.save, wk);
  g._openCampQuest(); // не має кидати помилок; заповнює панель
  const prog = document.getElementById('campquest-prog').textContent;
  const claimVisible = document.getElementById('btn-campquest-claim').style.display !== 'none';
  return { p: st.p, goal, done: st.done, prog, claimVisible };
});
check(r7.p === r7.goal && r7.done, '7: g._bumpCamp тікає квест до виконання', JSON.stringify(r7));
check(r7.prog === `${r7.goal}/${r7.goal}` && r7.claimVisible, '7: панель показує прогрес і кнопку «Забрати»', JSON.stringify(r7));

// 8. hintOnce: показ РІВНО раз, збереження прапорця у save.hints
const r8 = await page.evaluate(() => {
  const g = window.__game;
  delete g.save.hints.album1;
  const before = !!g.save.hints.album1;
  g.hud.hintOnce('album1', 'T', 'S');   // перший раз — показ, прапорець
  const after1 = g.save.hints.album1;
  g.hud.hintOnce('album1', 'T', 'S');   // другий раз — no-op
  const after2 = g.save.hints.album1;
  return { before, after1, after2 };
});
check(!r8.before && r8.after1 === 1 && r8.after2 === 1, '8: hintOnce показує раз і зберігає прапорець', JSON.stringify(r8));

check(errors.length === 0, 'без JS-помилок', errors.join(' | '));

await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
