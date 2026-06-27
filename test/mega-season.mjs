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

console.log('▸ Сезон мега-квестів');
const meta = await page.evaluate(() => {
  const g = window.__game;
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests();
  return {
    ids: g.quests.megaList.map((q) => q.id),
    targets: Object.fromEntries(g.quests.megaList.map((q) => [q.id, q.target])),
    rewards: Object.fromEntries(g.quests.megaList.map((q) => [q.id, q.rewardText])),
    pending: g.quests.pendingCount,
    dailyCount: g.quests.list.length,
  };
});

const expectedIds = ['damage10000', 'kills500', 'headshots150', 'bosses10', 'megabox10', 'countries8'];
check(expectedIds.every((id) => meta.ids.includes(id)) && meta.ids.length === expectedIds.length,
  'є 6 мега-квестів сезону', JSON.stringify(meta.ids));
check(meta.targets.damage10000 === 10000 && meta.targets.kills500 === 500 && meta.targets.headshots150 === 150,
  'цілі шкоди, перемог і хедшотів правильні', JSON.stringify(meta.targets));
check(meta.targets.bosses10 === 10 && meta.targets.megabox10 === 10 && meta.targets.countries8 === 8,
  'цілі босів, мегабоксів і країн правильні', JSON.stringify(meta.targets));
check(meta.rewards.kills500.includes('Щит') && meta.rewards.countries8.includes('Клон'),
  'нагороди показують конкретні гіперзаряди', JSON.stringify(meta.rewards));
check(meta.pending >= meta.dailyCount + 6,
  'бейдж квестів рахує щоденні і мега-квести', JSON.stringify({ pending: meta.pending, dailyCount: meta.dailyCount }));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 СЕЗОН МЕГА-КВЕСТІВ: МЕТА ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
