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

console.log('▸ Скін «Лицар» — за зірковий шлях 30');
const knight = await page.evaluate(async () => {
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const g = window.__game;
  const before = g.save.skins.includes('knight');
  g.test.addXp(999999); // піднімаємо зірковий рівень до максимуму (≥30)
  const lvl = g.progress.level;
  const granted = g.save.skins.includes('knight');
  let built = false;
  try { built = !!makeHero('knight', g.save.hero).group; } catch (e) { built = false; }
  return { inRegistry: !!HERO_SKINS.knight, before, lvl, granted, built };
});
check(knight.inRegistry, 'knight у HERO_SKINS');
check(knight.lvl >= 30, `зірковий рівень досяг 30 (${knight.lvl})`);
check(!knight.before && knight.granted, 'knight видається на рівні 30');
check(knight.built, 'makeHero("knight") будується без помилок');

console.log('▸ Скіни башти: камʼяна (Франція) і золота (2344)');
const tower = await page.evaluate(async () => {
  const { TOWER_SKINS } = await import('/src/extras.js');
  const g = window.__game;
  const ids = Object.keys(TOWER_SKINS);
  // золота — покупка за 2344
  g.test.giveCoins(5000);
  const c0 = g.save.coins;
  g.shop.buy('tower_gold');
  const goldOwned = g.save.towerSkins.includes('gold');
  const spent = c0 - g.save.coins;
  const goldActive = g.save.activeTowerSkin === 'gold';
  // камʼяна — за Францію (динамічно): без FRA не належить, з FRA — належить
  const stoneNoFra = !!(g.save.liberated && g.save.liberated.FRA);
  g.save.liberated = Object.assign({}, g.save.liberated, { FRA: true });
  // ставимо башту з активним золотим скіном — має зʼявитися без помилок
  g.test.unlockGadget('watchtower');
  g.test.gadgetCdReset();
  g.test.teleport(0, 150);
  g.save.activeTowerSkin = 'gold';
  const used = g.test.useGadget();
  const towerN = g.level.gadgets.towers.length;
  return { ids, spent, goldOwned, goldActive, stoneNoFra, used, towerN };
});
check(tower.ids.length === 3 && tower.ids.includes('stone') && tower.ids.includes('gold'), 'TOWER_SKINS: default/stone/gold', tower.ids.join(','));
check(tower.spent === 2344 && tower.goldOwned && tower.goldActive, 'золота башта: -2344, owned, активна', JSON.stringify(tower));
check(tower.stoneNoFra === false, 'до Франції камʼяна НЕ належить (динамічно)');
check(tower.used && tower.towerN === 1, 'башту з золотим скіном поставлено без помилок', JSON.stringify(tower));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ:'); for (const e of errors.slice(0, 8)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 СКІНИ (ЛИЦАР + БАШТА) ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
