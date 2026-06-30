// v48 «Іспанія» — headless-перевірки нової країни ESP:
//  (1) карта/біом/нагорода/розташування в кампанії правильні;
//  (2) унікальні лендмарки збудовано (арена-корида, фонтан, оливи, собор);
//  (3) 🐂 toro спавниться і вміє розганятись (charger);
//  (4) 👑 МАТАДОР-бос виходить (style matador, HP з конфігу, дальня атака бандерильями);
//  (5) звільнення ESP дає ВОГНЕМЕТ.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '  ✅' : '  ❌') + ' ' + m, x); if (!c) fail++; };
async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// ===== Конфіг країни (без браузера читаємо через імпорт у сторінці) =====
console.log('▸ Конфіг ESP');
await page.goto(`${BASE}/?test&fresh`);
await waitFor(page, () => window.__game && window.__game.state === 'globe', 25000, 'глобус');
const cfg = await page.evaluate(async () => {
  const mod = await import('/src/countries.js');
  const C = mod.COUNTRIES.ESP;
  const order = mod.CAMPAIGN_ORDER;
  return {
    exists: !!C, biome: C && C.biome, reward: C && C.weaponReward, coin: C && C.coinReward,
    extra: C && C.extraZombie, bossStyle: C && C.boss.style, bossHp: C && C.boss.hp,
    diff: C && C.difficulty, hasBiome: !!mod.BIOMES[C && C.biome],
    order, idx: order.indexOf('ESP'),
    fraDiff: mod.COUNTRIES.FRA.difficulty, turDiff: mod.COUNTRIES.TUR.difficulty,
  };
});
check(cfg.exists, 'COUNTRIES.ESP існує');
check(cfg.biome === 'spainSun' && cfg.hasBiome, 'біом spainSun зареєстровано', cfg.biome);
// v53: ESP більше НЕ дає зброю (вогнемет — за зірковий рівень 25), а дає МОНЕТИ
check(!cfg.reward, 'ESP більше не має weaponReward (вогнемет — за зірковий рівень)', cfg.reward || '—');
check(cfg.coin === 600, 'нагорода — 600 МОНЕТ (coinReward)', cfg.coin);
check(cfg.extra === 'toro', 'extraZombie = toro', cfg.extra);
check(cfg.bossStyle === 'matador' && cfg.bossHp > 0, `бос matador, ${cfg.bossHp} HP`);
check(cfg.idx === 4 && cfg.order[3] === 'FRA' && cfg.order.indexOf('TUR') > cfg.idx,
  `ESP стоїть після FRA, перед TUR (між ними тепер PRT/ITA): ${cfg.order.join('→')}`);
// монотонність складності FRA < ESP < TUR
const mono = cfg.fraDiff.hp < cfg.diff.hp && cfg.diff.hp < cfg.turDiff.hp
  && cfg.fraDiff.dmg < cfg.diff.dmg && cfg.diff.dmg < cfg.turDiff.dmg
  && cfg.fraDiff.counts < cfg.diff.counts && cfg.diff.counts < cfg.turDiff.counts;
check(mono, `крива складності монотонна (FRA ${cfg.fraDiff.hp} < ESP ${cfg.diff.hp} < TUR ${cfg.turDiff.hp})`);

// ===== Завантажуємо рівень ESP =====
console.log('▸ Рівень ESP завантажується');
await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; });
await page.evaluate(() => window.__game.startLevel('ESP'));
await waitFor(page, () => window.__game.state === 'level' && window.__game.level
  && !document.getElementById('overlay-level-loading').classList.contains('show'), 30000, 'рівень ESP');
await page.evaluate(() => window.__game.test.god());
await page.waitForTimeout(500);

// унікальні лендмарки збудовано
const world = await page.evaluate(() => {
  const w = window.__game.level.world;
  return {
    country: window.__game.level.countryId,
    fountain: !!w.fountain,                 // ⛲ площа з фонтаном
    floors: w.floors.length,                // трибуни кориди + дах собору + будинки
    loot: w.lootSpots.length,
    landmarks: window.__game.level.country.map.landmarks,
  };
});
check(world.country === 'ESP', 'граємо ESP');
check(world.fountain, '⛲ фонтан на площі збудовано');
check(world.landmarks.includes('bullring') && world.landmarks.includes('cathedral')
  && world.landmarks.includes('oliveGrove') && world.landmarks.includes('plazaFountain'),
  `унікальні лендмарки: ${world.landmarks.join(', ')}`);
check(world.floors >= 8, `трибуни кориди + дах собору додають поверхні (${world.floors})`);

// ===== 🐂 toro: спавн + розгін (charger) =====
console.log('▸ 🐂 Зомбі-бик toro');
const toro = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  p.respawnProtect = 1e9;
  const ar = g.level.world.layout.arena;
  p.pos.x = ar.x; p.pos.z = ar.z;
  const z = Z.spawn('toro', ar.x + 16, ar.z, {});
  z.aggroed = true; z.state = 'chase';
  return { hp: z.stats.hp, charger: z.charger, ztype: z.rig.ztype, x0: z.x };
});
check(toro.hp === 130 && toro.charger, `toro: 130 HP, charger=${toro.charger}`);
check(toro.ztype === 'toro', 'toro має власний вигляд (рогатий риг)', toro.ztype);
// toro мусить телеграфувати ривок і виконати його. Тримаємо дистанцію ~15 м у
// відкритій арені (чиста лінія видимості) і скидаємо chargeCd, щоб не чекати.
const charged = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const ar = g.level.world.layout.arena;
  const z = Z.list.find((q) => q.type === 'toro' && q.state !== 'dead');
  z.chargeCd = 0;
  let sawTelegraph = false, sawCharge = false;
  for (let i = 0; i < 60; i++) {
    // утримуємо гравця на місці й toro у зоні ривка (6..26 м) до старту телеграфу
    p.pos.x = ar.x; p.pos.z = ar.z;
    if (z.telegraph <= 0 && z.charging <= 0) {
      z.x = ar.x + 15; z.z = ar.z;
      z.aggroed = true; z.state = 'chase';
      z.chargeCd = Math.min(z.chargeCd, 0);
    }
    if (z.telegraph > 0) sawTelegraph = true;
    if (z.charging > 0) sawCharge = true;
    await new Promise((r) => setTimeout(r, 110));
    if (sawCharge) break;
  }
  return { sawTelegraph, sawCharge, alive: z.state !== 'dead' };
});
check(charged.sawTelegraph || charged.sawCharge,
  `toro телеграфує/виконує ривок рогами (tg=${charged.sawTelegraph}, charge=${charged.sawCharge})`);

// extraZombie у популяції: десь на карті є toro серед спавну
const haveToroInWorld = await page.evaluate(() =>
  window.__game.level.zombies.list.some((z) => z.type === 'toro'));
check(haveToroInWorld, 'toro присутній у списку зомбі рівня');

// ===== 👑 МАТАДОР-бос =====
console.log('▸ 👑 МАТАДОР-бос');
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
// відбиваємо орди, поки арена боса не відкриється
let bossUnlocked = false;
const tH = Date.now();
while (Date.now() - tH < 60000) {
  const stH = await page.evaluate(() => ({
    active: window.__game.level.zombies.hordeActive,
    unlocked: window.__game.level.missions.bossUnlocked,
  }));
  if (stH.unlocked) { bossUnlocked = true; break; }
  await page.evaluate(() => window.__game.test.finishHorde());
  await page.waitForTimeout(400);
}
check(bossUnlocked, 'після місій/орд відкривається арена кориди');
await page.evaluate(() => {
  const a = window.__game.level.world.layout.arena;
  window.__game.test.teleport(a.x, a.z);
});
await waitFor(page, () => window.__game.level.missions.bossStarted, 30000, 'бос вийшов');
const boss = await page.evaluate(() => {
  const b = window.__game.level.zombies.boss;
  return b ? { style: b.bossStyle, hp: b.maxHp, cfgHp: window.__game.level.country.boss.hp, ranged: !!b.ranged, name: window.__game.level.country.boss.name } : null;
});
check(boss && boss.style === 'matador', `бос стиль matador (${boss && boss.name})`);
check(boss && boss.hp === boss.cfgHp, `бос HP = конфіг (${boss && boss.hp})`);
check(boss && boss.ranged, 'бос має дальню атаку (бандерильї)');

// перемагаємо боса → звільнення → +600 МОНЕТ (вогнемет тепер за зірковий рівень, не за ESP)
const coinsBefore = await page.evaluate(() => window.__game.save.coins);
await page.evaluate(() => window.__game.test.damageBoss(999999));
const win = await waitFor(page, () => window.__game.victoryShown, 30000, 'перемога');
check(win, 'ESP звільнено!');
const st = await page.evaluate(() => window.__game.test.state());
check(st.liberated.includes('ESP'), 'ESP записано в сейв');
check(!st.player.weapons.includes('flamethrower'), 'звільнення ESP НЕ дає вогнемет (він за зірковий рівень 25)');
check(st.coins >= coinsBefore + 600, `звільнення ESP дало +600 монет (${coinsBefore} → ${st.coins})`);

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  fail += errors.length;
}
console.log(fail === 0 ? '🎉 ІСПАНІЯ (ESP) ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail === 0 ? 0 : 1);
