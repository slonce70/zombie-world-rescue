// 🦖 Загублений Острів (LOST) — фінальний бонус-рівень поза CAMPAIGN_ORDER.
// Перевіряє: карту lostisland.js + біом prehistoric + вулкан-ландмарк + боса rex +
// нагороду-лазер + ГЕЙТ розблокування (лише коли звільнено всі країни кампанії).
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(350); }
  console.log(`  ⚠️ Таймаут: ${label}`); return false;
}

console.log('▸ Острів Динозаврів (LOST)');
await page.goto(`${BASE}/?test&fresh&country=LOST`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

const cfg = await page.evaluate(async () => {
  const out = { errors: [] };
  const { COUNTRIES, CAMPAIGN_ORDER, BIOMES, isCountryOpen } = await import('/src/countries.js');
  const { makeBoss } = await import('/src/characters.js');
  out.inLevel = window.__game.level && window.__game.level.countryId;
  out.inOrder = CAMPAIGN_ORDER.includes('LOST');     // має бути false (бонус поза кампанією)
  out.count = CAMPAIGN_ORDER.length;                 // лишається 10
  const L = COUNTRIES.LOST;
  out.exists = !!L;
  out.extra = L && L.extraZombie;
  out.bossStyle = L && L.boss.style;
  out.bossHp = L && L.boss.hp;
  out.biome = L && L.biome;
  out.hasBiome = !!(L && BIOMES[L.biome]);
  out.reward = L && L.weaponReward;
  out.landmarks = window.__game.level.country.map.landmarks;
  out.zombies = window.__game.level.zombies.list.length;
  // 🔒 ГЕЙТ: закрито, поки не звільнено всі країни кампанії; відкрито лише з повним світом
  const all = {}; for (const c of CAMPAIGN_ORDER) all[c] = true;
  const partial = { UKR: true, POL: true };
  out.openPartial = isCountryOpen(partial, 'LOST');  // false
  out.openAll = isCountryOpen(all, 'LOST');           // true
  out.openMissingOne = isCountryOpen({ ...all, JPN: false }, 'LOST'); // false
  try { const rig = makeBoss('rex'); out.rexBuilt = !!(rig && rig.group && rig.ztype === 'boss'); }
  catch (e) { out.errors.push('makeBoss(rex): ' + e.message); }
  return out;
});

check(cfg.inLevel === 'LOST', 'рівень Острова завантажився', JSON.stringify({ inLevel: cfg.inLevel, zombies: cfg.zombies }));
check(cfg.exists, 'COUNTRIES.LOST існує');
check(!cfg.inOrder && cfg.count >= 10, 'LOST — бонус ПОЗА CAMPAIGN_ORDER (не рахується в кампанії)', JSON.stringify({ inOrder: cfg.inOrder, count: cfg.count }));
check(cfg.hasBiome && cfg.biome === 'prehistoric', 'біом prehistoric існує', cfg.biome);
check(cfg.bossStyle === 'rex', 'бос — стиль rex (тиранозавр)', cfg.bossStyle);
check(cfg.rexBuilt, 'makeBoss(rex) будує риг без помилок', cfg.errors.join('|'));
check(cfg.bossHp > 7200, 'бос — найміцніший (фінал, > JPN)', String(cfg.bossHp));
check(cfg.reward === 'laser', 'нагорода — ЛАЗЕР', cfg.reward);
check(cfg.extra === 'toro', 'унікальний моб — toro (стадо)', cfg.extra);
check(Array.isArray(cfg.landmarks) && cfg.landmarks.includes('volcano'), 'вулкан-ландмарк на карті', JSON.stringify(cfg.landmarks));
check(cfg.zombies > 0, 'зомбі на острові', String(cfg.zombies));
// гейт розблокування
check(cfg.openPartial === false, '🔒 закрито з частковим прогресом (UKR+POL)');
check(cfg.openMissingOne === false, '🔒 закрито, якщо бракує хоч однієї країни (JPN)');
check(cfg.openAll === true, '🔓 відкрито лише коли звільнено всі країни кампанії');

// ===== наскрізний прохід: місії → орди → ТИРАНОЗАВР → перемога → ЛАЗЕР =====
console.log('▸ Наскрізний прохід фіналу');
await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
let bossOk = false; const tH = Date.now();
while (Date.now() - tH < 90000) {
  if (await page.evaluate(() => window.__game.level.missions.bossUnlocked)) { bossOk = true; break; }
  await page.evaluate(() => window.__game.test.finishHorde());
  await page.waitForTimeout(400);
}
check(bossOk, 'після місій (та орд) відкривається арена боса');
await page.evaluate(() => { const a = window.__game.level.world.layout.arena; window.__game.test.teleport(a.x, a.z); });
await waitFor(() => window.__game.level.missions.bossStarted, 30000, 'бос вийшов');
const boss = await page.evaluate(() => {
  const b = window.__game.level.zombies.boss;
  const a = window.__game.level.world.layout.arena;
  return b ? { style: b.bossStyle, hp: b.maxHp, yOk: isFinite(b.y), nearArena: Math.hypot(b.x - a.x, b.z - a.z) < 40 } : null;
});
check(boss && boss.style === 'rex' && boss.yOk && boss.nearArena, 'ТИРАНОЗАВР на чистій арені', JSON.stringify(boss));
await page.evaluate(() => window.__game.test.damageBoss(999999));
const win = await waitFor(() => window.__game.victoryShown, 30000, 'перемога');
check(win, 'Острів Динозаврів звільнено!');
const st = await page.evaluate(() => window.__game.test.state());
check(st.liberated.includes('LOST'), 'LOST записано в сейв');
check(st.player.weapons.includes('laser'), 'ЛАЗЕР у арсеналі після перемоги', (st.player.weapons || []).join(','));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ОСТРІВ ДИНОЗАВРІВ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
