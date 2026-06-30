import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&seed=26`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

const twelve = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true, DIN: true };

console.log('▸ Глава 2 відкривається після 12 країн');
const menu = await page.evaluate((all) => {
  const g = window.__game;
  g.save.liberated = { ...all };
  delete g.save.liberated.DIN;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="infected"]');
  g.save.liberated = all;
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="infected"]');
  return {
    beforeLocked: before && before.classList.contains('locked'),
    afterLocked: after && after.classList.contains('locked'),
    tab: after && after.closest('.solo-section')?.dataset.tabId,
    name: after && after.querySelector('.sm-name').textContent,
  };
}, twelve);
check(menu.beforeLocked && !menu.afterLocked && menu.tab === 'campaign' && /ГЛАВА 2/.test(menu.name),
  'режим Глава 2 є в Кампанії і відкривається на 12 країнах', JSON.stringify(menu));

console.log('▸ Старт зараженої країни');
await page.evaluate(async (all) => {
  const g = window.__game;
  g.save.liberated = all;
  g.save.infected = { cleared: {}, done: false };
  g.save.coins = 0;
  g.save.crystals = 0;
  g.save.titles = [];
  g.save.medals = [];
  await g.startInfected('UKR');
}, twelve);
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.infected, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  g._updateDayNight();
  const zs = g.level.zombies.list.filter((z) => z.state !== 'dead');
  return {
    infected: g.level.infected,
    diffStar: g.level.diffStar,
    nightK: g.level.nightK,
    robots: zs.filter((z) => z.type === 'robot').length,
    boxers: zs.filter((z) => z.type === 'boxer').length,
    noShop: g.level.noShop,
    noGadgets: g.level.noGadgets,
  };
});
check(started.infected && started.diffStar >= 3 && started.nightK >= 0.45,
  'заражений рівень має темний настрій і складність 3+', JSON.stringify(started));
check(started.robots >= 1 && started.boxers >= 2 && !started.noShop && !started.noGadgets,
  'додаються заражені загрози, магазин і гаджети лишаються як у кампанії', JSON.stringify(started));

console.log('▸ Перемога очищає країни і завершує Главу 2 після 3 очищень');
const reward = await page.evaluate(async () => {
  const g = window.__game;
  g._showVictory();
  const afterOne = {
    cleared: { ...g.save.infected.cleared },
    titles: [...g.save.titles],
    h1: document.querySelector('#overlay-victory h1').textContent,
    coins: g.save.coins,
  };
  g.endLevel();
  await g.startInfected('POL');
  g._showVictory();
  g.endLevel();
  await g.startInfected('DEU');
  g._showVictory();
  g.hq.render();
  return {
    afterOne,
    cleared: { ...g.save.infected.cleared },
    done: g.save.infected.done,
    medals: [...g.save.medals],
    titles: [...g.save.titles],
    coins: g.save.coins,
    crystals: g.save.crystals,
    hq: document.getElementById('hq-content').textContent,
  };
});
check(reward.afterOne.cleared.UKR && reward.afterOne.titles.includes('infection_cleaner')
  && /ЗАРАЖЕННЯ ОЧИЩЕНО/.test(reward.afterOne.h1) && reward.afterOne.coins >= 300,
  'перша заражена країна дає очищення, титул і монети', JSON.stringify(reward.afterOne));
check(reward.done && reward.medals.includes('infected') && Object.keys(reward.cleared).length === 3
  && reward.coins >= 2100 && reward.crystals >= 10,
  '3 очищені країни завершують Главу 2 і дають фінальну нагороду', JSON.stringify(reward));
check(/Глава 2|Заражені країни/.test(reward.hq) && /3\/3/.test(reward.hq),
  'Штаб показує прогрес Глави 2', reward.hq.slice(0, 180));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ГЛАВА 2 ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
