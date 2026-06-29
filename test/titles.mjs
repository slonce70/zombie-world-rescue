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

console.log('▸ Титули в Гардеробі');
const ui = await page.evaluate(async () => {
  const { saveHasProgress } = await import('/src/net/cloudsave.js');
  const g = window.__game;
  const card = (id) => document.querySelector(`.ward-card[data-kind="title"][data-id="${id}"]`);
  g._wardrobeTab = 'titles';
  g.save.stats.killed = 554;
  g.save.stats.coinsSpent = 49999;
  g.save.titles = [];
  g.save.activeTitle = null;
  g.renderWardrobe();
  const lockedZombie = card('zombie_killer').classList.contains('locked');
  const lockedCoins = card('zero_coins').classList.contains('locked');
  g.save.stats.killed = 555;
  g.save.stats.coinsSpent = 50000;
  g.renderWardrobe();
  const unlockedZombie = !card('zombie_killer').classList.contains('locked');
  const unlockedCoins = !card('zero_coins').classList.contains('locked');
  card('zero_coins').click();
  const profile = g.coop.lobbyNet._profile();
  const progress = saveHasProgress({ ...g._newSave(), titles: ['zero_coins'], activeTitle: 'zero_coins' });
  return {
    lockedZombie, lockedCoins, unlockedZombie, unlockedCoins,
    activeTitle: g.save.activeTitle,
    profileTitle: profile.title,
    titleProgress: progress,
  };
});
check(ui.lockedZombie && ui.lockedCoins, 'до вимог титули заблоковані', JSON.stringify(ui));
check(ui.unlockedZombie && ui.unlockedCoins, 'після вимог титули відкриті', JSON.stringify(ui));
check(ui.activeTitle === 'zero_coins' && ui.profileTitle === '0 монет', 'титул екіпірується і йде в profile', JSON.stringify(ui));
check(ui.titleProgress, 'saveHasProgress бачить відкриті титули');

console.log('▸ Витрачені монети рахуються в магазині');
const spent = await page.evaluate(() => {
  const g = window.__game;
  g.save.stats.coinsSpent = 49965;
  g.test.giveCoins(1000);
  g.test.shopBuy('grenade');
  g.save.activeTitle = null;
  g.renderWardrobe();
  const unlocked = g.save.titles.includes('zero_coins');
  return { coinsSpent: g.save.stats.coinsSpent, unlocked };
});
check(spent.coinsSpent === 50000 && spent.unlocked, 'покупка за монети відкриває титул 0 монет', JSON.stringify(spent));
check(errors.length === 0, 'без console/page errors', errors.join(' | '));

await browser.close();
console.log('');
console.log(failed === 0 ? '🎉 ТИТУЛИ ПРАЦЮЮТЬ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
