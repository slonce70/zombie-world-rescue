import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!cond) failed++;
};

await page.goto(`${BASE}/?test&fresh&lang=uk`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Play compass: new player');
await page.click('#btn-solo');
let compass = await page.textContent('#player-compass').catch(() => '');
check(/Україна/.test(compass || ''), 'новому гравцю компас радить Україну', compass || '');

console.log('▸ Mission preview does not mutate missionRuns');
await page.click('.solo-mode[data-mode="campaign"]');
let preview = await page.evaluate(() => ({
  missionRuns: { ...window.__game.save.missionRuns },
  chips: [...document.querySelectorAll('#country-list .country-item[data-id="UKR"] .mission-preview span')].map((el) => el.textContent.trim()),
  expected: window.__game.test.rollMissions('UKR', 1234, 0),
}));
check(preview.chips.join('') === '🆘📡🛡️🛡️', 'preview показує всі 4 місії України', JSON.stringify(preview));
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

await page.evaluate(() => {
  const g = window.__game;
  g.save.goal = 'shield';
  g.save.coins = 100;
  g.renderSoloMenu();
});
compass = await page.textContent('#player-compass').catch(() => '');
check(/ще\s+\d+/.test(compass || '') && /Щит|ціл/i.test(compass || ''), 'активна shop-ціль показує залишок', compass || '');

await page.evaluate(() => {
  const g = window.__game;
  g.save.goal = null;
  g.save.liberated = Object.fromEntries(['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT', 'ITA', 'TUR', 'SWE', 'EGY', 'JPN', 'CHN'].map((id) => [id, true]));
  g.renderSoloMenu();
});
compass = await page.textContent('#player-compass').catch(() => '');
check(/Глава 2|Острів Динозаврів/.test(compass || ''), 'після кампанії компас радить Chapter 2 або Dinosaur Island', compass || '');

console.log('');
const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.slice(0, 8).join('\n'));

console.log(failed === 0 ? '🎉 STAGED PROJECT IMPROVEMENTS ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
