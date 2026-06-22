// Відбита хвиля Шторму відкриває драфт; екран кінця забігу показує зібрану збірку.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
// Шторм рано-return, доки країну не звільнено — сідаємо звільнення (як у test/draft.mjs)
await page.evaluate(() => { window.__game.save.liberated.UKR = true; window.__game.saveGame(); });
// Шторм стартуємо явно (URL ?storm НЕ обробляється; патерн із test/update4.mjs:324)
await page.evaluate(() => window.__game.test.startStorm('UKR'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.storm, null, { timeout: 30000 });
await page.waitForTimeout(400);

// очищаємо хвилю: вбиваємо всіх зомбі хвилі, потім жени сим напряму, доки драфт не відкриється
const draftOpened = await page.evaluate(async () => {
  const g = window.__game;
  for (const z of g.level.zombies.list) { if (z._stormWave) { z.state = 'dead'; z.hp = 0; } }
  // драйв симуляції напряму (RAF у headless майже стоїть): storm.update бачить alive===0 → драфт
  for (let i = 0; i < 30 && !g.draft.isOpen; i++) g.level.storm.update(0.1);
  return g.draft.isOpen;
});
check(draftOpened, 'відбита хвиля відкрила драфт');

// беремо картку
await page.evaluate(() => window.__game.draft.pick(0));
const afterPick = await page.evaluate(() => ({ open: window.__game.draft.isOpen, picks: window.__game.level.runBuild.picks.length }));
check(!afterPick.open && afterPick.picks === 1, 'картку взято, драфт закрито', JSON.stringify(afterPick));

// завершуємо забіг (смерть) → екран кінця показує рядок «Твоя збірка»
const ended = await page.evaluate(() => {
  const g = window.__game;
  g.level.player.health = 0;
  g.level.bus.emit('playerDied');
  return {
    shown: document.getElementById('overlay-storm-end').classList.contains('show'),
    hasBuild: document.getElementById('storm-stats').innerHTML.includes(g.level.runBuild.summary()),
  };
});
check(ended.shown, 'екран кінця Шторму показано');
check(ended.hasBuild, 'екран кінця показує зібрану збірку');

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 DRAFT-STORM OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
