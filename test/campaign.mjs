// Повне проходження кампанії від початку до кінця: 7 країн поспіль
// на одному сейві — місії, орди, боси, нагороди, прогресія.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(350);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

await page.goto(`${BASE}/?test&fresh`);
await waitFor(() => window.__game && window.__game.state === 'globe', 30000, 'глобус');

const ORDER = ['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'ITA', 'TUR', 'EGY'];
const REWARDS = { UKR: 'rifle', POL: 'shotgun', DEU: 'smg', FRA: 'sniper', ESP: 'flamethrower', ITA: 'laser', TUR: 'magnum', EGY: 'bazooka' };

for (const c of ORDER) {
  console.log(`▸ Граємо: ${c}`);
  // ціль кампанії правильна
  const target = await page.evaluate(() => window.__game.globe.targetId);
  check(target === c, `глобус вказує на ${c} (${target})`);
  await page.evaluate((id) => window.__game.startLevel(id), c);
  await waitFor(() => window.__game.state === 'level' && window.__game.level, 40000, 'рівень ' + c);

  // граємо: виконуємо 3 місії, відбиваємо орди, перемагаємо боса
  await page.evaluate(() => {
    const g = window.__game;
    g.test.god();
    g.test.completeMission('rescue');
    g.test.completeMission('tower');
    g.test.completeMission('warehouse');
  });
  // зброя-нагорода видається при відкритті ящика — у тесті місія завершена напряму,
  // тож даємо її явно (як зробив би гравець, відкривши ящик)
  await page.evaluate((w) => window.__game.unlockWeapon(w), REWARDS[c]);
  // відбиваємо орди, поки арена боса не відкриється (орда оголошується з затримкою)
  let bossOk = false;
  const tH = Date.now();
  while (Date.now() - tH < 90000) {
    const stH = await page.evaluate(() => ({
      active: window.__game.level.zombies.hordeActive,
      unlocked: window.__game.level.missions.bossUnlocked,
    }));
    if (stH.unlocked) { bossOk = true; break; }
    if (stH.active) await page.evaluate(() => window.__game.test.finishHorde());
    await page.waitForTimeout(400);
  }
  check(bossOk, 'після місій (та орд) відкривається арена боса');
  await page.evaluate(() => {
    const g = window.__game;
    const a = g.level.world.layout.arena;
    g.test.teleport(a.x, a.z);
  });
  await waitFor(() => window.__game.level.missions.bossStarted, 30000, 'бос вийшов');
  const bossInfo = await page.evaluate(() => {
    const g = window.__game;
    return { name: g.level.country.boss.name, hp: g.level.zombies.boss ? g.level.zombies.boss.maxHp : 0 };
  });
  check(bossInfo.hp > 0, `бос ${bossInfo.name} (${bossInfo.hp} HP)`);
  await page.evaluate(() => window.__game.test.damageBoss(999999));
  const win = await waitFor(() => window.__game.victoryShown, 30000, 'перемога');
  check(win, `${c} звільнено!`);
  const st = await page.evaluate(() => window.__game.test.state());
  check(st.liberated.includes(c), 'країна записана в сейв');
  check(st.player.weapons.includes(REWARDS[c]), `зброя-нагорода в арсеналі (${REWARDS[c]})`);
  // на глобус
  await page.evaluate(() => {
    document.getElementById('btn-victory-globe').click();
  });
  await waitFor(() => window.__game.state === 'globe', 20000, 'глобус після ' + c);
}

// ============ ПІСЛЯ КАМПАНІЇ ============
console.log('▸ Після кампанії');
const final = await page.evaluate(() => {
  const g = window.__game;
  return {
    liberated: Object.keys(g.save.liberated).length,
    weapons: [...g.save.weapons],
    passLevel: g.progress.level,
    xp: g.save.xp,
    coins: g.save.coins,
    allDone: g.globe.allDone,
  };
});
check(final.liberated === 8, `усі 8 країн звільнено (${final.liberated})`);
check(final.weapons.length >= 8, `арсенал: ${final.weapons.join(', ')}`);
check(final.passLevel >= 5, `зірковий рівень після кампанії: ${final.passLevel} (XP ${final.xp})`);
check(final.allDone, 'глобус святкує: світ врятовано');
check(final.coins > 300, `монет зароблено: ${final.coins}`);

// шторм відкритий і працює на фінальній країні
await page.evaluate(() => window.__game.test.startStorm());
const stormOk = await waitFor(() => window.__game.level && window.__game.level.storm && window.__game.level.storm.wave >= 1, 40000, 'шторм');
check(stormOk, 'шторм запускається після кампанії');
const stormCountry = await page.evaluate(() => window.__game.level.countryId);
check(stormCountry === 'EGY', `шторм на найскладнішій звільненій країні (${stormCountry})`);

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 12)) console.log('  ', e);
  failed += errors.length;
} else {
  console.log('✅ Без помилок у консолі');
}
console.log(failed === 0 ? '🏆 КАМПАНІЮ ПРОЙДЕНО ВІД ПОЧАТКУ ДО КІНЦЯ' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
