import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Мега-квест: Бос Радіації');
const result = await page.evaluate(async () => {
  const { MEGA_QUEST_MIN_LEVEL, xpForLevel } = await import('/src/progress.js');
  const { TITLES } = await import('/src/titles.js');
  const xpToLevel = (level) => {
    let xp = 0;
    for (let n = 1; n < level; n++) xp += xpForLevel(n);
    return xp;
  };
  const g = window.__game;
  g.save.xp = xpToLevel(MEGA_QUEST_MIN_LEVEL);
  g.save.crystals = 0;
  g.save.titles = [];
  g.save.activeTitle = null;
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests();

  const meta = g.quests.megaList.find((q) => q.id === 'radiationBoss5');
  g.test.questEvent('radiationBoss', { bossId: 'ice' });
  const afterWrong = { ...g.save.megaQuests.radiationBoss5 };
  g.test.questEvent('radiationBoss', { bossId: 'radiation', n: 4 });
  const beforeDone = {
    q: { ...g.save.megaQuests.radiationBoss5 },
    crystals: g.save.crystals,
    titles: [...g.save.titles],
  };
  g.test.questEvent('radiationBoss', { bossId: 'radiation' });
  g.renderWardrobe();
  const card = document.querySelector('.ward-card[data-kind="title"][data-id="radiation_player"]');
  return {
    meta: meta && { id: meta.id, target: meta.target, rewardText: meta.rewardText, title: meta.title },
    titleMeta: TITLES.radiation_player && { icon: TITLES.radiation_player.icon, name: TITLES.radiation_player.name() },
    afterWrong,
    beforeDone,
    afterDone: {
      q: { ...g.save.megaQuests.radiationBoss5 },
      crystals: g.save.crystals,
      titles: [...g.save.titles],
      cardText: card ? card.textContent : '',
      cardLocked: card ? card.classList.contains('locked') : null,
    },
  };
});

check(result.meta && result.meta.target === 5 && result.meta.rewardText.includes('3') && result.meta.title.includes('Радіації'),
  'квест є у списку мега-квестів: 5 босів Радіації', JSON.stringify(result.meta));
check(result.titleMeta && result.titleMeta.name === 'Радіаційний гравець',
  'титул Радіаційний гравець є у реєстрі титулів', JSON.stringify(result.titleMeta));
check(result.afterWrong.progress === 0 && !result.afterWrong.done,
  'інші світові боси не просувають квест Радіації', JSON.stringify(result.afterWrong));
check(result.beforeDone.q.progress === 4 && !result.beforeDone.q.done && result.beforeDone.crystals === 0 && !result.beforeDone.titles.includes('radiation_player'),
  'на 4/5 нагорода ще не видана', JSON.stringify(result.beforeDone));
check(result.afterDone.q.done && result.afterDone.q.progress === 5 && result.afterDone.crystals === 3
  && result.afterDone.titles.includes('radiation_player') && result.afterDone.cardText.includes('Радіаційний гравець') && result.afterDone.cardLocked === false,
  'на 5/5 видає титул Радіаційний гравець і 3 кристали', JSON.stringify(result.afterDone));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 МЕГА-КВЕСТ РАДІАЦІЇ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
