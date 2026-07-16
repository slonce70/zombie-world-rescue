// 🎲 Мутатор тижня в соло-реплеях кампанії: ніч форситься, магазин закривається,
// навала прискорює хвилі орди; перше проходження країни — без мутатора.
import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, captureConsole: false, pageErrorPrefix: '' });

const startCountry = async (mod, countryId) => {
  await page.evaluate(({ mod, countryId }) => {
    const g = window.__game;
    if (g.level) g.endLevel();
    g.weeklyModifierId = () => mod;
    g.startLevel(countryId);
  }, { mod, countryId });
  await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.player, null, { timeout: 45000 });
};

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated.UKR = true; // UKR звільнена → реплей; POL ні → перше проходження
  g.saveGame();
});

// 🌙 ніч: nightK форситься навіть у «денну» фазу циклу
await startCountry('night', 'UKR');
const night = await page.evaluate(() => {
  const g = window.__game;
  g.level.stats.time = 10; // день за циклом
  g._updateDayNight();
  return { modId: g.level.weeklyModId, k: g.level.nightK };
});
check(night.modId === 'night' && night.k >= 0.75, 'мутатор «ніч» форсить nightK у день', JSON.stringify(night));

// 🚫 без магазину: правило домержується у campaign, де магазин базово Є
const noshop = await page.evaluate(() => !window.__game.level.noShop);
check(noshop, 'кампанія без мутатора має магазин (контроль)', '');
await startCountry('noshop', 'UKR');
const ns = await page.evaluate(() => ({
  modId: window.__game.level.weeklyModId,
  noShop: window.__game.level.noShop,
  bodyClass: document.body.classList.contains('no-shop-mode'),
}));
check(ns.modId === 'noshop' && ns.noShop && ns.bodyClass, 'мутатор «без магазину» закриває магазин у реплеї', JSON.stringify(ns));

// 🧟 навала: кадеція 0.8 і пачка 6 замість 1.3/4; одночасний пул НЕ росте (hordePending)
await startCountry('horde', 'UKR');
const horde = await page.evaluate(() => {
  const g = window.__game;
  const zm = g.level.zombies;
  const run = () => {
    zm.hordeActive = true;
    zm.hordePending = 20;
    zm.hordeRemaining = 20;
    zm.hordeSpawnT = 0;
    const n0 = zm.list.length;
    zm._updateHordeWaves(0.01, [g.level.player], g.level.player);
    return { dN: zm.list.length - n0, resetT: zm.hordeSpawnT, pending: zm.hordePending };
  };
  const rush = run();
  g.level.weeklyMod = null; // контроль без мутатора
  const base = run();
  return { rush, base };
});
check(horde.rush.dN === 6 && Math.abs(horde.rush.resetT - 0.8) < 1e-9, 'навала: пачка 6, кадеція 0.8', JSON.stringify(horde.rush));
check(horde.base.dN === 4 && Math.abs(horde.base.resetT - 1.3) < 1e-9, 'без мутатора: пачка 4, кадеція 1.3 (контроль)', JSON.stringify(horde.base));
check(horde.rush.pending === 20 - 6, 'навала зливає той САМИЙ пул, не збільшує його', JSON.stringify(horde.rush.pending));

// перше проходження (POL не звільнена) — мутатор не застосовується
await startCountry('noshop', 'POL');
const first = await page.evaluate(() => ({
  weeklyMod: window.__game.level.weeklyMod,
  noShop: window.__game.level.noShop,
}));
check(first.weeklyMod === null && !first.noShop, 'перше проходження країни — без мутатора', JSON.stringify(first));

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 MODIFIERS OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail ? 1 : 0);
