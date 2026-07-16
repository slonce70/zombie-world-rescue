// 🎲 Прокачка 2.0: у соло-кампанії здана місія відкриває драфт; картки мають рідкість;
// вампіризм лікує за вбивство; екран перемоги показує збірку.
import { openBrowserTest } from './_browser.mjs';

let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, captureConsole: false, pageErrorPrefix: '' });

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

// 🧛 +HP за вбивство: збільшує запас здоров'я, а не тільки лікує до старої стелі
const vamp = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.lifeSteal = 1;
  p.maxHealth = 100;
  p.health = 100;
  const z = g.test.spawnZombie('walker', p.pos.x + 3, p.pos.z);
  z.hp = 1;
  z.damage(999, null, false);
  return { health: p.health, maxHealth: p.maxHealth };
});
check(vamp.health === 101 && vamp.maxHealth === 101, '+1 HP за вбивство збільшує max/current HP', JSON.stringify(vamp));

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
await closeTest();
process.exit(fail ? 1 : 0);
