// 🎲 Прокачка 2.0: у соло-кампанії здана місія відкриває драфт; картки мають рідкість;
// вампіризм лікує за вбивство; екран перемоги показує збірку.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=1&country=UKR&draft`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.level && !!window.__game.level.missions, null, { timeout: 30000 });
await page.waitForTimeout(400);

// runBuild існує в соло-кампанії
const hasBuild = await page.evaluate(() => !!window.__game.level.runBuild);
check(hasBuild, 'runBuild створюється у соло-кампанії');

// здана місія → драфт відкрився, картки мають рідкість
const draft = await page.evaluate(() => {
  const g = window.__game;
  g.level.bus.emit('missionDone', { title: 'test', reward: 0 });
  const cards = [...document.querySelectorAll('#draft-grid .draft-card')];
  return {
    open: g.draft.isOpen,
    cards: cards.length,
    rarities: cards.map((c) => [...c.classList].find((k) => k.startsWith('rarity-')) || ''),
  };
});
check(draft.open, 'здана місія відкрила драфт у кампанії');
check(draft.cards === 3, 'драфт пропонує 3 картки', draft.cards);
check(draft.rarities.every((r) => /^rarity-(common|rare|epic)$/.test(r)), 'кожна картка має клас рідкості', JSON.stringify(draft.rarities));

// пік застосовується і закриває драфт
const picked = await page.evaluate(() => {
  const g = window.__game;
  g.draft.pick(0);
  return { open: g.draft.isOpen, picks: g.level.runBuild.picks.length };
});
check(!picked.open && picked.picks === 1, 'картку взято, драфт закрито', JSON.stringify(picked));

// 🧛 вампіризм: +HP за вбивство (хук у zombieKilled)
const vamp = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.lifeSteal = 5;
  p.health = 40;
  const z = g.test.spawnZombie('walker', p.pos.x + 3, p.pos.z);
  z.hp = 1;
  z.damage(999, null, false);
  return { health: p.health };
});
check(vamp.health === 45, 'вампіризм лікує +5 HP за вбивство', JSON.stringify(vamp));

// екран перемоги показує рядок «Твоя збірка»
const victory = await page.evaluate(() => {
  const g = window.__game;
  g.level.bossDefeated = true;
  g._showVictory();
  return {
    hasBuildRow: document.getElementById('victory-stats').innerHTML.includes(g.level.runBuild.summary()),
  };
});
check(victory.hasBuildRow, 'екран перемоги показує зібрану збірку');

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 DRAFT-CAMPAIGN OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
