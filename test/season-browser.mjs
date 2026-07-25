// 🗓️ Сезон у грі: панель, клейм нагороди, компас і збереження прогресу.
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=730`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Панель сезону над Зоряним шляхом');
const panel = await page.evaluate(async () => {
  const g = window.__game;
  const { seasonState, SEASON_STEPS } = await import('/src/season.js');
  g.renderPassPanel();
  const rows = [...document.querySelectorAll('#pass-track .pass-row')];
  const st = seasonState(g.save, g._weekIndex());
  return {
    steps: SEASON_STEPS,
    seasonRows: rows.length >= SEASON_STEPS,
    heads: [...document.querySelectorAll('#pass-track .season-head')].map((h) => h.textContent.trim()),
    firstStep: st.steps[0] && { id: st.steps[0].id, target: st.steps[0].target, progress: st.steps[0].progress },
    claimButtons: document.querySelectorAll('[data-season-claim]').length,
  };
});
check(panel.seasonRows && panel.heads.length === 2 && /СЕЗОН|SEASON/.test(panel.heads[0]),
  'сезон показано над Зоряним шляхом', JSON.stringify(panel.heads));
check(panel.firstStep && panel.firstStep.progress === 0 && panel.claimButtons === 0,
  'на чистому сейві сходинки ще не пройдені', JSON.stringify(panel.firstStep));

console.log('▸ Виконання сходинки → кнопка «Забрати» → нагорода');
const claim = await page.evaluate(async () => {
  const g = window.__game;
  const { seasonState } = await import('/src/season.js');
  const st = seasonState(g.save, g._weekIndex());
  const step = st.steps.find((s) => s.id && s.target);
  // виконуємо ПЕРШУ сходинку через ті самі лічильники, якими користується гра
  const { SEASON_POOL } = await import('/src/season.js');
  const def = SEASON_POOL.find((d) => d.id === step.id);
  if (def.metric === 'mode') g.save.modeWins[def.mode] = (g.save.modeWins[def.mode] || 0) + def.target;
  else if (def.metric === 'kills') g.save.stats.killed = (g.save.stats.killed | 0) + def.target;
  else if (def.metric === 'friends') g.save.friends = { UKR: true };
  else if (def.metric === 'liberated') g.save.liberated = { ...g.save.liberated, UKR: true };
  g.renderPassPanel();
  const btn = document.querySelector(`[data-season-claim="${step.id}"]`);
  const before = { crystals: g.save.crystals | 0, xp: g.save.xp | 0 };
  btn?.click();
  const after = { crystals: g.save.crystals | 0, xp: g.save.xp | 0 };
  const stAfter = seasonState(g.save, g._weekIndex());
  return {
    stepId: step.id, hadButton: !!btn, before, after,
    claimed: stAfter.steps[0].claimed,
    claimable: stAfter.claimable,
    saved: [...(g.save.season.claimed || [])],
    buttonsLeft: document.querySelectorAll(`[data-season-claim="${step.id}"]`).length,
  };
});
check(claim.hadButton && claim.after.crystals > claim.before.crystals && claim.after.xp > claim.before.xp,
  'клейм видає кристали і XP', JSON.stringify(claim));
check(claim.claimed && claim.claimable === 0 && claim.saved.includes(claim.stepId) && claim.buttonsLeft === 0,
  'сходинка позначена як забрана і зберігається', JSON.stringify(claim));

console.log('▸ Компас веде до сезону');
const compass = await page.evaluate(async () => {
  const g = window.__game;
  const { seasonState, SEASON_POOL } = await import('/src/season.js');
  // готова, але незабрана сходинка має бути найпершою підказкою
  const st = seasonState(g.save, g._weekIndex());
  const pending = st.steps.find((s) => !s.done);
  const def = SEASON_POOL.find((d) => d.id === pending.id);
  if (def.metric === 'mode') g.save.modeWins[def.mode] = (g.save.modeWins[def.mode] || 0) + def.target;
  else if (def.metric === 'kills') g.save.stats.killed = (g.save.stats.killed | 0) + def.target;
  else if (def.metric === 'friends') g.save.friends = { ...g.save.friends, POL: true };
  else if (def.metric === 'liberated') g.save.liberated = { ...g.save.liberated, POL: true };
  const info = g._nextActionInfo();
  return { title: info.title, text: info.text, pending: pending.id };
});
check(/сезону|сезона|Season step/i.test(compass.title),
  'компас кличе забрати готову сходинку', JSON.stringify(compass));

console.log('▸ Новий сезон обнуляє сходинки без втрати нагород');
const rollover = await page.evaluate(async () => {
  const g = window.__game;
  const { seasonState, SEASON_WEEKS } = await import('/src/season.js');
  const week = g._weekIndex();
  g._weekIndex = () => week + SEASON_WEEKS;
  const st = seasonState(g.save, g._weekIndex());
  g._weekIndex = () => week;
  return { index: st.index, claimed: st.steps.filter((s) => s.claimed).length, progress: st.steps.filter((s) => s.progress > 0).length };
});
check(rollover.claimed === 0 && rollover.progress === 0,
  'наступний сезон стартує з чистого аркуша', JSON.stringify(rollover));

check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));

await closeTest();
if (failed) process.exit(1);
console.log('\n🎉 СЕЗОН ПРАЦЮЄ');
