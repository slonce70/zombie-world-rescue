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

const rewards = await page.evaluate(() => {
  const g = window.__game;
  g.save.xp = 0;
  g.save.crystals = 0;
  g.save.gadgetHypers = [];
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests();
  for (const q of g.quests.list) q.done = true;

  const drive = (ev, n) => g.test.questEvent(ev, { n });
  drive('kill', 499);
  const beforeKillDone = {
    q: { ...g.save.megaQuests.kills500 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };
  drive('kill', 1);
  const afterKillDone = {
    q: { ...g.save.megaQuests.kills500 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('boss', 10);
  const afterBosses = {
    q: { ...g.save.megaQuests.bosses10 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('megabox', 10);
  const afterMegaboxes = {
    q: { ...g.save.megaQuests.megabox10 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('country', 8);
  const afterCountries = {
    q: { ...g.save.megaQuests.countries8 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('country', 8);
  const afterDuplicateCountry = {
    q: { ...g.save.megaQuests.countries8 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  return { beforeKillDone, afterKillDone, afterBosses, afterMegaboxes, afterCountries, afterDuplicateCountry };
});

check(rewards.beforeKillDone.q.progress === 499 && !rewards.beforeKillDone.q.done
  && rewards.beforeKillDone.crystals === 0 && rewards.beforeKillDone.xp === 0,
  'kills500 не видає нагороду на 499/500', JSON.stringify(rewards.beforeKillDone));
check(rewards.afterKillDone.q.done && rewards.afterKillDone.hypers.includes('shield')
  && rewards.afterKillDone.crystals === 8 && rewards.afterKillDone.xp === 250,
  'kills500 видає shield hyper, 8 crystals, 250 XP', JSON.stringify(rewards.afterKillDone));
check(rewards.afterBosses.q.done && rewards.afterBosses.hypers.includes('turret')
  && rewards.afterBosses.crystals === 23 && rewards.afterBosses.xp === 650,
  'bosses10 додає turret hyper, 15 crystals, 400 XP', JSON.stringify(rewards.afterBosses));
check(rewards.afterMegaboxes.q.done && rewards.afterMegaboxes.hypers.includes('goldapple')
  && rewards.afterMegaboxes.crystals === 35 && rewards.afterMegaboxes.xp === 1000,
  'megabox10 додає goldapple hyper, 12 crystals, 350 XP', JSON.stringify(rewards.afterMegaboxes));
check(rewards.afterCountries.q.done && rewards.afterCountries.hypers.includes('clone')
  && rewards.afterCountries.crystals === 55 && rewards.afterCountries.xp === 1500,
  'countries8 додає clone hyper, 20 crystals, 500 XP', JSON.stringify(rewards.afterCountries));
check(rewards.afterDuplicateCountry.crystals === 55 && rewards.afterDuplicateCountry.xp === 1500
  && rewards.afterDuplicateCountry.hypers.filter((x) => x === 'clone').length === 1,
  'countries8 не дублює нагороду після done', JSON.stringify(rewards.afterDuplicateCountry));

const countryHook = await page.evaluate(() => {
  const g = window.__game;
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests();
  g.save.megaQuests.countries8.progress = 7;
  g.save.megaQuests.countries8.done = false;
  g.save.crystals = 0;
  g.save.xp = 0;
  g.save.gadgetHypers = [];
  g.level.country = { ...g.level.country, id: 'UKR', name: 'Україна', coinReward: 0 };
  g._showVictory();
  return {
    q: { ...g.save.megaQuests.countries8 },
    crystals: g.save.crystals,
    xp: g.save.xp,
    hypers: [...g.save.gadgetHypers],
  };
});
check(countryHook.q.done && countryHook.q.progress === 8 && countryHook.crystals === 20
  && countryHook.xp >= 500 && countryHook.hypers.includes('clone'),
  '_showVictory просуває country мега-квест', JSON.stringify(countryHook));

const ui = await page.evaluate(() => {
  const g = window.__game;
  g.renderQuestsPanel();
  return {
    text: document.getElementById('quest-list').textContent,
    megaRows: document.querySelectorAll('#quest-list .quest-row.mega').length,
    headers: [...document.querySelectorAll('#quest-list .quest-section-title')].map((x) => x.textContent),
  };
});
check(ui.headers.some((x) => x.includes('Мега-квести')),
  'у панелі є секція Мега-квести', JSON.stringify(ui.headers));
check(ui.headers.some((x) => x.includes('Щоденні')),
  'у панелі є секція Щоденні', JSON.stringify(ui.headers));
check(ui.megaRows === 6,
  'усі 6 мега-квестів мають окремий mega row клас', JSON.stringify({ megaRows: ui.megaRows }));
check(ui.text.indexOf('Мега-квести') < ui.text.indexOf('Щоденні'),
  'мега-квести показані перед щоденними', ui.text);

await page.evaluate(() => localStorage.setItem('zr-lang', 'en'));
await page.reload({ waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const enMegaText = await page.evaluate(() => {
  window.__game.renderQuestsPanel();
  return document.getElementById('quest-list')?.textContent || '';
});
check(enMegaText.includes('Mega') || enMegaText.includes('MEGA:'),
  'мега-квести можуть відрендеритись англійською', enMegaText.slice(0, 160));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 СЕЗОН МЕГА-КВЕСТІВ: МЕТА ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
