import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
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
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
await page.evaluate(async () => {
  const { MEGA_QUEST_MIN_LEVEL, xpForLevel } = await import('/src/progress.js');
  let xp = 0;
  for (let n = 1; n < MEGA_QUEST_MIN_LEVEL; n++) xp += xpForLevel(n);
  window.__megaQuestXpBase = xp;
});

console.log('▸ Мега-квест: 10000 шкоди');
const res = await page.evaluate(() => {
  const g = window.__game;
  g.save.xp = window.__megaQuestXpBase;
  g.save.crystals = 0;
  g.save.gadgetHypers = [];
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests?.();

  const p = g.level.player.pos;
  const z = g.test.spawnZombie('tank', p.x + 8, p.z);
  z.hp = 12000;
  z.maxHp = 12000;

  z.damage(9999, null, false);
  const mid = {
    q: g.save.megaQuests && { ...g.save.megaQuests.damage10000 },
    crystals: g.save.crystals,
    xp: g.save.xp - window.__megaQuestXpBase,
    hypers: [...(g.save.gadgetHypers || [])],
  };

  z.damage(1, null, false);
  const done = {
    q: g.save.megaQuests && { ...g.save.megaQuests.damage10000 },
    crystals: g.save.crystals,
    xp: g.save.xp - window.__megaQuestXpBase,
    hypers: [...(g.save.gadgetHypers || [])],
  };

  z.damage(500, null, false);
  const after = {
    q: g.save.megaQuests && { ...g.save.megaQuests.damage10000 },
    crystals: g.save.crystals,
    xp: g.save.xp - window.__megaQuestXpBase,
    hypers: [...(g.save.gadgetHypers || [])],
  };

  g.renderQuestsPanel();
  return {
    mid, done, after,
    html: document.getElementById('quest-list').textContent,
  };
});

check(res.mid.q && res.mid.q.progress === 9999 && !res.mid.q.done,
  '9999 шкоди рахується, але нагорода ще не видана', JSON.stringify(res.mid));
check(res.mid.crystals === 0 && res.mid.xp === 0 && !res.mid.hypers.includes('heal'),
  'до 10000 нагород нема', JSON.stringify(res.mid));
check(res.done.q && res.done.q.progress === 10000 && res.done.q.done,
  'на 10000 шкоди мега-квест виконано', JSON.stringify(res.done));
check(res.done.crystals === 10 && res.done.xp === 250 && res.done.hypers.includes('heal'),
  'нагорода damage10000: heal hypercharge, 10 кристалів, 250 XP', JSON.stringify(res.done));
check(res.after.crystals === 10 && res.after.xp === 250 && res.after.hypers.filter((x) => x === 'heal').length === 1,
  'після виконання нагорода не дублюється', JSON.stringify(res.after));
check(res.html.includes('МЕГА') && res.html.includes('10000') && res.html.includes('250 XP'),
  'мега-квест видно у вікні квестів', res.html);

const capped = await page.evaluate(() => {
  const g = window.__game;
  g.save.xp = window.__megaQuestXpBase;
  g.save.megaQuests = null;
  g.save.crystals = 0;
  g.save.gadgetHypers = [];
  g.quests.ensureMegaQuests();
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('tank', p.x + 10, p.z);
  z.hp = 123;
  z.maxHp = 123;
  z.damage(99999, null, false);
  return {
    q: { ...g.save.megaQuests.damage10000 },
    crystals: g.save.crystals,
    hypers: [...(g.save.gadgetHypers || [])],
  };
});
check(capped.q.progress === 123 && !capped.q.done && capped.crystals === 0 && !capped.hypers.includes('heal'),
  'overkill рахує тільки реальні HP, не сирі 99999 шкоди', JSON.stringify(capped));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 МЕГА-КВЕСТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
