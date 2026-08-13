import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader'] }, context: { viewport: { width: 1280, height: 800 } }, captureErrors: false });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&lang=uk`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Play compass: new player');
await page.click('#btn-solo');
let compass = await page.textContent('#player-compass').catch(() => '');
check(/Україна/.test(compass || ''), 'новому гравцю компас радить Україну', compass || '');

console.log('▸ Mission preview does not mutate missionRuns');
// Каталог режимів живе у згорнутих <details> (крім слотів «СЬОГОДНІ», а вони від дати):
// розгортаємо категорію з кампанією, інакше картка є в DOM, але невидима для кліку.
const campaignShown = await page.evaluate(() => {
  const el = document.querySelector('.solo-mode[data-mode="campaign"]');
  if (!el) return false;
  const box = el.closest('details');
  if (box) box.open = true;
  return true;
});
check(campaignShown, 'картка кампанії є в меню режимів');
await page.click('.solo-mode[data-mode="campaign"]');
let preview = await page.evaluate(() => ({
  missionRuns: { ...window.__game.save.missionRuns },
  chips: [...document.querySelectorAll('#country-list .country-item[data-id="UKR"] .mission-preview span')].map((el) => el.textContent.trim()),
  expected: window.__game.test.rollMissions('UKR', 1234, 0),
}));
// 4-та ціль України — сюжетна «віднови центр міста» (🏗️ ukr-rebuild), а не друга оборона
check(preview.chips.join('') === '🆘📡🛡️🏗️', 'preview показує всі 4 місії України', JSON.stringify(preview));
check(preview.expected.join(',') === 'rescue,repair,clear', 'динамічний roll для UKR лишається доступним test API', JSON.stringify(preview.expected));
check(JSON.stringify(preview.missionRuns) === '{}', 'preview не змінює actual missionRuns', JSON.stringify(preview.missionRuns));

console.log('▸ Solo mode registry routes every visible mode');
const registry = await page.evaluate(() => {
  const g = window.__game;
  g.renderSoloMenu();
  return [...document.querySelectorAll('.solo-mode[data-mode]')].map((el) => {
    const id = el.dataset.mode;
    return {
      id,
      hasEntry: !!(g._soloModeById && g._soloModeById.get(id)),
      hasStart: typeof (g._soloModeById && g._soloModeById.get(id) && g._soloModeById.get(id).start) === 'function',
    };
  });
});
check(registry.length > 0, 'registry перевіряє відрендерені solo modes', JSON.stringify(registry));
check(registry.every((m) => m.hasEntry && m.hasStart), 'кожен visible solo mode має callable start path', JSON.stringify(registry.filter((m) => !m.hasEntry || !m.hasStart)));
const retryRegistry = await page.evaluate(() => {
  const retryModes = ['arena', 'knockout', 'defense', 'overloaded-defense', 'zone-defense', 'pvp', 'bank', 'portal', 'maze', 'humans', 'overloaded-humans', 'soul-collector', 'worldboss'];
  const routes = window.__game._soloModeById;
  return retryModes.map((id) => ({ id, hasStart: typeof (routes && routes.get(id) && routes.get(id).start) === 'function' }));
});
check(retryRegistry.every((m) => m.hasStart), 'retry modes мають registry start route', JSON.stringify(retryRegistry.filter((m) => !m.hasStart)));

console.log('▸ Play compass: campaign, shop goal, finished campaign');
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true };
  g.renderSoloMenu();
});
compass = await page.textContent('#player-compass').catch(() => '');
check(/Польща/.test(compass || ''), 'після України компас радить наступну країну', compass || '');

// 🎯 ціль магазину стоїть НИЖЧЕ кроку кампанії: поки в кишені менше 80% ціни,
// компас веде далі по кампанії й не тягне дитину у вітрину.
await page.evaluate(() => {
  const g = window.__game;
  g.save.goal = 'shield';
  g.save.coins = 100;
  g.renderSoloMenu();
});
compass = await page.textContent('#player-compass').catch(() => '');
check(/Польща/.test(compass || ''), 'ціль магазину на початку збору не перебиває крок кампанії', compass || '');

// …а коли зібрано ≥80% ціни — лишився один забіг, і компас нагадує саме про ціль
const goalNear = await page.evaluate(async () => {
  const g = window.__game;
  const { goalInfo } = await import('/src/shop.js');
  g.save.coins = Math.ceil(goalInfo(g).need * 0.8);
  g.renderSoloMenu();
  return { need: goalInfo(g).need, have: goalInfo(g).have, remaining: goalInfo(g).remaining };
});
compass = await page.textContent('#player-compass').catch(() => '');
check(new RegExp(`ще\\s+${goalNear.remaining}\\b`).test(compass || '') && /Щит|ціл/i.test(compass || ''),
  'зібрано ≥80% ціни — компас показує залишок до цілі', `${compass || ''} | ${JSON.stringify(goalNear)}`);

const seasonClosed = await page.evaluate(async () => {
  const g = window.__game;
  const { seasonSteps, seasonIndex, seasonState } = await import('/src/season.js');
  g.save.goal = null;
  g.save.liberated = Object.fromEntries(['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN'].map((id) => [id, true]));
  // 🗓️ сезон (v730) у компасі стоїть вище за Главу 2: закриваємо його тими самими
  // лічильниками сейва, з яких він рахує прогрес, і забираємо всі нагороди
  const sIdx = seasonIndex(g._weekIndex());
  const defs = seasonSteps(sIdx);
  g.save.modeWins = g.save.modeWins || {};
  g.save.stats = g.save.stats || {};
  g.save.friends = g.save.friends || {};
  for (const d of defs) {
    if (d.metric === 'mode') g.save.modeWins[d.mode] = Math.max(g.save.modeWins[d.mode] | 0, d.target);
    else if (d.metric === 'kills') g.save.stats.killed = Math.max(g.save.stats.killed | 0, d.target);
    else if (d.metric === 'friends') for (let i = 0; i < d.target; i++) g.save.friends['season' + i] = true;
  }
  // base = {} означає «сезон стартував з нуля», тож лічильники вище рахуються повністю
  g.save.season = { i: sIdx, base: {}, claimed: defs.map((d) => d.id), carry: [] };
  const st = seasonState(g.save, g._weekIndex());
  g.renderSoloMenu();
  return st.next === null && st.claimable === 0;
});
check(seasonClosed, 'сезон закрито — компас доходить до Глави 2');
compass = await page.textContent('#player-compass').catch(() => '');
check(/Глава 2|Острів Динозаврів|Chapter 2|Dinosaur/i.test(compass || ''), 'після кампанії компас радить Chapter 2 або Dinosaur Island', compass || '');

console.log('');
const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.slice(0, 8).join('\n'));

console.log(failed === 0 ? '🎉 STAGED PROJECT IMPROVEMENTS ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
