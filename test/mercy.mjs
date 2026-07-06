// 🕊️ R3 (v289) «Невидиме милосердя»: 2+ смерті поспіль на одній країні кампанії → наступний
// забіг там дістає тихі послаблення (+50% аптечок, −1 еліт у хвилі, −10% HP зомбі).
// КЛЮЧОВЕ: жодного UI («easy mode» ображає дитину). Перемога скидає лічильник.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '  ✅' : '  ❌') + ' ' + m, x); if (!c) fail++; };
const errors = [];

const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function startRun(country) {
  await page.evaluate((c) => {
    const g = window.__game;
    if (g.level) g.endLevel();
    g.victoryShown = false;
    g.startLevel(c);
  }, country);
  await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && !!window.__game.level.missions, null, { timeout: 30000 });
  await page.waitForTimeout(120);
}

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// ---------- перший забіг: милосердя НЕ активне ----------
console.log('▸ Перший забіг UKR — милосердя вимкнене');
await startRun('UKR');
const first = await page.evaluate(() => window.__game.test.mercyState());
check(first.active === false && first.deaths === null, 'свіжий забіг → mercy off, лічильник 0', JSON.stringify(first));

// ---------- 2 смерті поспіль у UKR ----------
console.log('▸ 2 смерті поспіль на UKR → лічильник = 2');
const counted = await page.evaluate(() => {
  const g = window.__game;
  g._onPlayerDied();
  const after1 = g.test.mercyState().deaths;
  g.deathT = -1; g.level.player.health = g.level.player.maxHealth; // «встав» — симуляція респавну
  g._onPlayerDied();
  const after2 = g.test.mercyState().deaths;
  return { after1, after2 };
});
check(counted.after1 && counted.after1.cid === 'UKR' && counted.after1.n === 1, 'після 1-ї смерті n=1', JSON.stringify(counted.after1));
check(counted.after2 && counted.after2.n === 2, 'після 2-ї смерті n=2', JSON.stringify(counted.after2));

// ---------- наступний забіг UKR: милосердя АКТИВНЕ + модифікатори ----------
console.log('▸ Наступний забіг UKR — милосердя активне (модифікатори застосовано)');
await startRun('UKR');
const mercy = await page.evaluate(() => {
  const g = window.__game;
  const st = g.test.mercyState();
  const Z = g.level.zombies;
  // −10% HP звичайних зомбі
  const hpMercy = Z.hpWithSettings(100);
  // −1 еліт у хвилі (запит 4 → 3, мін. 1)
  for (const z of [...Z.list]) { z.gone = true; Z.scene.remove(z.rig.group); Z.byNidMap.delete(z.nid); }
  Z.list = [];
  const wave = Z.spawnEliteWave(4);
  return { st, hpMercy, waveCount: wave.length };
});
check(mercy.st.active === true, 'level.mercy активний на наступному забігу', JSON.stringify(mercy.st));
check(mercy.st.mercy && mercy.st.mercy.hpMult === 0.9 && mercy.st.mercy.medkitMult === 1.5 && mercy.st.mercy.eliteMinus === 1,
  'модифікатори: hp×0.9, аптечки×1.5, −1 еліт', JSON.stringify(mercy.st.mercy));
check(mercy.hpMercy === 90, 'HP звичайного зомбі −10% (100→90)', String(mercy.hpMercy));
check(mercy.waveCount === 3, 'елітна хвиля −1 (запит 4 → 3)', String(mercy.waveCount));

// ---------- КРИТИЧНО (v294): милосердя НЕ зменшує HP боса ----------
console.log('▸ Милосердя НЕ зменшує maxHp боса (лише звичайних зомбі)');
const bossHp = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies;
  const active = !!g.level.mercy;                 // милосердя активне на цьому забігу
  const b1 = Z.spawnBoss(); const withMercy = b1.maxHp; Z.despawnBoss();
  const normalMercy = Z.hpWithSettings(100);      // контраст: звичайний −10%
  const saved = g.level.mercy; g.level.mercy = null;
  const b2 = Z.spawnBoss(); const noMercy = b2.maxHp; Z.despawnBoss();
  const normalNoMercy = Z.hpWithSettings(100);
  g.level.mercy = saved;
  return { active, withMercy, noMercy, normalMercy, normalNoMercy };
});
check(bossHp.active, 'милосердя активне (передумова тесту)', String(bossHp.active));
check(bossHp.withMercy === bossHp.noMercy, 'maxHp боса ІДЕНТИЧНИЙ з милосердям і без нього', JSON.stringify(bossHp));
check(bossHp.normalMercy === 90 && bossHp.normalNoMercy === 100, 'звичайний зомбі −10% (контроль — флаг boss працює)', JSON.stringify(bossHp));

// ---------- КРИТИЧНО: жодного видимого UI милосердя ----------
console.log('▸ КРИТИЧНО: жодного видимого «easy mode» / банера / тексту про милосердя');
const noUi = await page.evaluate(() => {
  const g = window.__game;
  g.hud.update(0.016);
  const RE = /милосерд|easy|легше|слабш|mercy|спрощен/i;
  const banner = document.getElementById('banner');
  const bannerShown = banner && banner.classList.contains('show');
  const bannerText = (document.getElementById('banner-title').textContent + ' ' + document.getElementById('banner-sub').textContent);
  const toasts = [...document.querySelectorAll('#toasts .toast, .toast')].map((el) => el.textContent).join(' ');
  const missionText = document.getElementById('mission-list').textContent;
  return {
    bannerMercy: bannerShown && RE.test(bannerText),
    toastMercy: RE.test(toasts),
    missionMercy: RE.test(missionText),
    hasMercyEl: !!document.querySelector('[class*="mercy"], #mercy, [id*="mercy"]'),
  };
});
check(!noUi.bannerMercy, 'банер не згадує милосердя/easy', JSON.stringify(noUi));
check(!noUi.toastMercy, 'тости не згадують милосердя/easy', JSON.stringify(noUi));
check(!noUi.missionMercy, 'панель місій не згадує милосердя/easy', JSON.stringify(noUi));
check(!noUi.hasMercyEl, 'у DOM немає жодного елемента милосердя', JSON.stringify(noUi));

// ---------- кап: більше смертей не підсилюють ефект ----------
console.log('▸ Кап: 4-та смерть не підсилює модифікатори (бінарні)');
const capped = await page.evaluate(() => {
  const g = window.__game;
  g._onPlayerDied(); g.deathT = -1;
  g._onPlayerDied();
  return { n: g.test.mercyState().deaths.n, mercy: { ...g.level.mercy } };
});
check(capped.n >= 2 && capped.mercy.hpMult === 0.9, 'ще смерті → лічильник росте, але ефект той самий', JSON.stringify(capped));

// ---------- перемога скидає милосердя ----------
console.log('▸ Перемога в UKR скидає лічильник милосердя');
const reset = await page.evaluate(() => {
  const g = window.__game;
  g.level.secondaryObjective && (g.level.secondaryObjective.done = false);
  g.level.stats.deaths = 3;
  g.victoryShown = false;
  g._showVictory();
  return g.test.mercyState().deaths;
});
check(reset === null, 'після перемоги mercyDeaths скинуто (null)', JSON.stringify(reset));

console.log('▸ Забіг після перемоги — милосердя знову вимкнене');
await startRun('UKR');
const afterWin = await page.evaluate(() => window.__game.test.mercyState().active);
check(afterWin === false, 'наступний забіг без милосердя', String(afterWin));

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 3).join(' | '));
console.log(fail === 0 ? '\n🎉 МИЛОСЕРДЯ OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
