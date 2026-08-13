// «Краї петлі»: кнопки Далі/Ще раз на перемозі, Реванш на смерті, компас+welcome-back на глобусі
import { chromium } from 'playwright';
import { waitFor as waitForAsync, makeCheck } from './_browser.mjs';
import { ensureWebServer } from './_server.mjs';

const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });

let failed = 0;
const check = makeCheck(() => failed++);

const waitFor = (page, fn, timeoutMs, label) => waitForAsync(fn, timeoutMs, label, 200);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

console.log('▸ Boot ?test&fresh — компас на глобусі, без welcome-back тоста');
await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус');

const compass0 = await page.evaluate(() => {
  const el = document.getElementById('globe-compass');
  return el ? el.textContent.trim() : null;
});
check(!!compass0 && compass0.length > 0, 'fresh-бут: #globe-compass існує і непорожній', compass0);

await page.waitForTimeout(500);
const toasts0 = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast, .toast')].map((el) => el.textContent));
check(!toasts0.some((t) => t.includes('З поверненням')), 'fresh-бут: немає тоста «З поверненням»', JSON.stringify(toasts0));

console.log('▸ Перемога: кнопки Далі/Ще раз/На глобус');
await page.evaluate(() => window.__game.startLevel('UKR'));
await waitFor(page, async () => (await page.evaluate(() => window.__game.state)) === 'level', 30000 * SLOW, 'рівень UKR');
await page.evaluate(() => window.__game._showVictory());
await waitFor(page, async () => (await page.evaluate(() => document.getElementById('overlay-victory').classList.contains('show'))), 10000 * SLOW, 'overlay-victory show');

let vis = await page.evaluate(() => ({
  next: getComputedStyle(document.getElementById('btn-victory-next')).display,
  retry: getComputedStyle(document.getElementById('btn-victory-retry')).display,
  globeBtn: !!document.getElementById('btn-victory-globe'),
}));
check(vis.next !== 'none', 'btn-victory-next видимий (solo, кампанія не пройдена)', JSON.stringify(vis));
check(vis.retry !== 'none', 'btn-victory-retry видимий (solo)', JSON.stringify(vis));
check(vis.globeBtn, 'btn-victory-globe на місці', JSON.stringify(vis));

await page.click('#btn-victory-retry');
await waitFor(page, async () => (await page.evaluate(() => window.__game.state)) === 'level', 30000 * SLOW, 'рівень після ретраю');
let st = await page.evaluate(() => ({ cid: window.__game.level.countryId, victoryShown: window.__game.victoryShown }));
check(st.cid === 'UKR', 'клік retry: countryId лишається UKR', JSON.stringify(st));
check(st.victoryShown === false, 'клік retry: victoryShown скинуто', JSON.stringify(st));

await page.evaluate(() => window.__game._showVictory());
await waitFor(page, async () => (await page.evaluate(() => document.getElementById('overlay-victory').classList.contains('show'))), 10000 * SLOW, 'overlay-victory show 2');
await page.click('#btn-victory-next');
await waitFor(page, async () => (await page.evaluate(() => window.__game.state)) === 'level', 30000 * SLOW, 'рівень після next');
st = await page.evaluate(() => ({ cid: window.__game.level.countryId }));
check(st.cid === 'POL', 'клік next: перехід на POL (другий у CAMPAIGN_ORDER)', JSON.stringify(st));

console.log('▸ Кампанія пройдена: next схований, retry видимий');
// CAMPAIGN_ORDER не експортується глобально в window — дублюємо відомий список країн кампанії
await page.evaluate(() => {
  const g = window.__game;
  const ids = ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN'];
  g.save.liberated = g.save.liberated || {};
  for (const id of ids) g.save.liberated[id] = true;
});
await page.evaluate(() => { window.__game.victoryShown = false; window.__game._showVictory(); });
await waitFor(page, async () => (await page.evaluate(() => document.getElementById('overlay-victory').classList.contains('show'))), 10000 * SLOW, 'overlay-victory show 3');
vis = await page.evaluate(() => ({
  next: getComputedStyle(document.getElementById('btn-victory-next')).display,
  retry: getComputedStyle(document.getElementById('btn-victory-retry')).display,
}));
check(vis.next === 'none', 'кампанія пройдена: btn-victory-next схований', JSON.stringify(vis));
check(vis.retry !== 'none', 'кампанія пройдена: btn-victory-retry лишається видимим', JSON.stringify(vis));

console.log('▸ Смерть: Реванш');
await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('UKR'); });
await waitFor(page, async () => (await page.evaluate(() => window.__game.state)) === 'level', 30000 * SLOW, 'новий рівень UKR');
await page.evaluate(() => {
  const g = window.__game;
  g._deltaBefore = { coins: g.save.coins, xp: g.progress.xp };
  g._onPlayerDied();
});
await waitFor(page, async () => (await page.evaluate(() => document.getElementById('overlay-death').classList.contains('show'))), 10000 * SLOW, 'overlay-death show');
let dvis = await page.evaluate(() => ({
  revenge: getComputedStyle(document.getElementById('btn-death-revenge')).display,
  countdown: document.getElementById('death-countdown').textContent,
}));
check(dvis.revenge !== 'none', 'btn-death-revenge видимий у фінальній соло-гілці', JSON.stringify(dvis));
check(!Number.isNaN(parseFloat(dvis.countdown)), 'death-countdown числовий', JSON.stringify(dvis));

await page.click('#btn-death-revenge');
await waitFor(page, async () => (await page.evaluate(() => window.__game.state)) === 'level', 30000 * SLOW, 'рівень після реваншу');
const afterRevenge = await page.evaluate(() => {
  const g = window.__game;
  return {
    cid: g.level.countryId,
    deathT: g.deathT,
    deathOverlayShown: document.getElementById('overlay-death').classList.contains('show'),
    dCoins: g.save.coins - g._deltaBefore.coins,
    dXp: g.progress.xp - g._deltaBefore.xp,
  };
});
check(afterRevenge.cid === 'UKR', 'реванш: countryId === UKR', JSON.stringify(afterRevenge));
check(afterRevenge.deathT === -1, 'реванш: deathT === -1', JSON.stringify(afterRevenge));
check(afterRevenge.deathOverlayShown === false, 'реванш: overlay-death схований', JSON.stringify(afterRevenge));
check(afterRevenge.dCoins === 0 && afterRevenge.dXp === 0, 'реванш: без подвійної нагороди (дельта 0)', JSON.stringify(afterRevenge));

console.log('▸ _nextActionInfo: сезон / завдання дня / weekly / fallback');
// Компас веде до найдешевшої наступної дії. Пройдена кампанія відкриває сезон, і поки
// в сезоні лишилась незакрита сходинка — саме він, а НЕ завдання дня, головна ціль.
const infoSeason = await page.evaluate(() => {
  const g = window.__game;
  if (g.level) g.endLevel();
  const ids = ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN', 'LOST', 'LAB'];
  g.save.liberated = {};
  for (const id of ids) g.save.liberated[id] = true;
  g.save.infected = { done: true, cleared: {} };
  g.quests.ensureToday();
  for (const q of g.quests.list) q.done = false;
  return g._nextActionInfo();
});
check(infoSeason.icon === '🗓️' && /Сезон/.test(infoSeason.title),
  '_nextActionInfo: незакритий сезон веде поперед завдань дня → 🗓️ Сезон', JSON.stringify(infoSeason));

// Закриваємо сезон повністю (усі сходинки виконані І забрані) — далі компас має
// падати у хвіст ланцюжка: завдання дня → випробування тижня → випробування дня.
const infoA = await page.evaluate(async () => {
  const { ensureSeason, seasonSteps } = await import('/src/season.js');
  const g = window.__game;
  const season = ensureSeason(g.save, g._weekIndex());
  season.base = {};                       // рахуємо від нуля
  season.carry = [];
  g.save.stats = { ...(g.save.stats || {}), killed: 99999 };
  g.save.friends = { a: true, b: true, c: true };
  g.save.modeWins = { ...(g.save.modeWins || {}) };
  for (const step of seasonSteps(season.i)) if (step.mode) g.save.modeWins[step.mode] = 99;
  season.claimed = seasonSteps(season.i).map((step) => step.id);
  return g._nextActionInfo();
});
check(infoA.icon === '🎯' && /Завдання дня/.test(infoA.title),
  '_nextActionInfo: сезон закрито, невиконані завдання дня → 🎯', JSON.stringify(infoA));

const infoB = await page.evaluate(() => {
  const g = window.__game;
  for (const q of g.quests.list) q.done = true;
  return g._nextActionInfo();
});
check(infoB.icon === '🗓️' && /Випробування тижня/.test(infoB.title),
  '_nextActionInfo: всі завдання done → weekly-гілка 🗓️', JSON.stringify(infoB));

const infoC = await page.evaluate(() => {
  const g = window.__game;
  g.save.weekly = g.save.weekly || {};
  g.save.weekly['W' + g._weekIndex() + ':mode'] = true;
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
  return g._nextActionInfo();
});
check(!infoC.text.includes('Спробуй Шторм'), '_nextActionInfo: fallback більше не згадує «Спробуй Шторм»', JSON.stringify(infoC));

console.log('▸ Welcome-back тост після reload без fresh');
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true };
  g.saveGame();
});
await page.goto(`${BASE}/?test`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус після reload');
const gotWelcome = await waitFor(page, async () => {
  const toasts = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast, .toast')].map((el) => el.textContent));
  return toasts.some((t) => t.includes('З поверненням'));
}, 5000 * SLOW, 'welcome-back тост');
check(gotWelcome, 'welcome-back: тост з «З поверненням» зʼявився після reload з liberated>0');

await ctx.close();

console.log('▸ Тач-контекст: keyboard-grid/touch-legend, хінт глобуса без 🖱');
const touchCtx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const tpage = await touchCtx.newPage();
tpage.on('pageerror', (e) => errors.push(e.message));
tpage.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await tpage.goto(`${BASE}/?test&fresh&touch`, { waitUntil: 'domcontentloaded' });
await waitFor(tpage, async () => (await tpage.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус (тач)');

const touchInfo = await tpage.evaluate(() => {
  document.getElementById('overlay-start').classList.add('show');
  document.getElementById('overlay-pause').classList.add('show');
  const startKb = document.querySelector('#overlay-start .keyboard-grid');
  const pauseKb = document.querySelector('#overlay-pause .keyboard-grid');
  const legend = document.querySelector('.touch-legend');
  const hint = document.querySelector('.globe-hint');
  const res = {
    startKbDisplay: startKb ? getComputedStyle(startKb).display : null,
    pauseKbDisplay: pauseKb ? getComputedStyle(pauseKb).display : null,
    legendDisplay: legend ? getComputedStyle(legend).display : null,
    hintText: hint ? hint.textContent : '',
  };
  document.getElementById('overlay-start').classList.remove('show');
  document.getElementById('overlay-pause').classList.remove('show');
  return res;
});
check(touchInfo.startKbDisplay === 'none', 'тач: .keyboard-grid в overlay-start === none', JSON.stringify(touchInfo));
check(touchInfo.pauseKbDisplay === 'none', 'тач: .keyboard-grid в overlay-pause === none', JSON.stringify(touchInfo));
check(touchInfo.legendDisplay !== 'none', 'тач: .touch-legend НЕ none', JSON.stringify(touchInfo));
check(!touchInfo.hintText.includes('🖱'), 'тач: хінт глобуса без 🖱', JSON.stringify(touchInfo));

await touchCtx.close();

check(errors.length === 0, `no JS errors (${errors.slice(0, 3).join(' | ')})`);
console.log(failed === 0 ? '✅ loop-edges pass' : `❌ loop-edges failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
