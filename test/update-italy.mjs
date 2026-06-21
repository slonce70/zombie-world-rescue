// v49 «Італія» — headless-перевірки нової країни ITA:
//  (1) карта/біом/нагорода/розташування в кампанії правильні;
//  (2) унікальні лендмарки збудовано (Колізей, похила вежа, римські руїни, фонтан, олива);
//  (3) 🛡️ gladiator спавниться і вміє розганятись у випад (charger);
//  (4) 👑 ЦЕЗАР-бос виходить (style gladiator, 7500 HP, дальня атака пілумами);
//  (5) арена-бос виходить на ЧИСТУ землю Колізею (прохідність — не застряг у геометрії);
//  (6) звільнення ITA дає ЛАЗЕР.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
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

// ===== Конфіг країни =====
console.log('▸ Конфіг ITA');
await page.goto(`${BASE}/?test&fresh`);
await waitFor(page, () => window.__game && window.__game.state === 'globe', 25000, 'глобус');
const cfg = await page.evaluate(async () => {
  const mod = await import('/src/countries.js');
  const C = mod.COUNTRIES.ITA;
  const order = mod.CAMPAIGN_ORDER;
  return {
    exists: !!C, biome: C && C.biome, reward: C && C.weaponReward, coin: C && C.coinReward,
    extra: C && C.extraZombie, bossStyle: C && C.boss.style, bossHp: C && C.boss.hp,
    diff: C && C.difficulty, hasBiome: !!mod.BIOMES[C && C.biome],
    order, idx: order.indexOf('ITA'),
    espDiff: mod.COUNTRIES.ESP.difficulty, turDiff: mod.COUNTRIES.TUR.difficulty,
  };
});
check(cfg.exists, 'COUNTRIES.ITA існує');
check(cfg.biome === 'italyMed' && cfg.hasBiome, 'біом italyMed зареєстровано', cfg.biome);
// v53: ITA більше НЕ дає зброю (лазер — за зірковий рівень 28), а дає МОНЕТИ
check(!cfg.reward, 'ITA більше не має weaponReward (лазер — за зірковий рівень)', cfg.reward || '—');
check(cfg.coin === 600, 'нагорода — 600 МОНЕТ (coinReward)', cfg.coin);
check(cfg.extra === 'gladiator', 'extraZombie = gladiator', cfg.extra);
check(cfg.bossStyle === 'gladiator' && cfg.bossHp === 7500, `бос gladiator, ${cfg.bossHp} HP`);
check(cfg.idx === 5 && cfg.order[4] === 'ESP' && cfg.order[6] === 'TUR',
  `ITA стоїть після ESP, перед TUR: ${cfg.order.join('→')}`);
// монотонність складності ESP < ITA < TUR
const mono = cfg.espDiff.hp < cfg.diff.hp && cfg.diff.hp < cfg.turDiff.hp
  && cfg.espDiff.dmg < cfg.diff.dmg && cfg.diff.dmg < cfg.turDiff.dmg
  && cfg.espDiff.counts < cfg.diff.counts && cfg.diff.counts < cfg.turDiff.counts;
check(mono, `крива складності монотонна (ESP ${cfg.espDiff.hp} < ITA ${cfg.diff.hp} < TUR ${cfg.turDiff.hp})`);

// ===== Завантажуємо рівень ITA =====
console.log('▸ Рівень ITA завантажується');
await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; });
await page.evaluate(() => window.__game.startLevel('ITA'));
await waitFor(page, () => window.__game.state === 'level' && window.__game.level
  && !document.getElementById('overlay-level-loading').classList.contains('show'), 30000, 'рівень ITA');
await page.evaluate(() => window.__game.test.god());
await page.waitForTimeout(500);

// унікальні лендмарки збудовано
const world = await page.evaluate(() => {
  const w = window.__game.level.world;
  return {
    country: window.__game.level.countryId,
    fountain: !!w.fountain,                 // ⛲ площа з фонтаном
    floors: w.floors.length,                // яруси Колізею + аттик арки + будинки
    loot: w.lootSpots.length,
    landmarks: window.__game.level.country.map.landmarks,
  };
});
check(world.country === 'ITA', 'граємо ITA');
check(world.fountain, '⛲ фонтан на площі руїн збудовано');
check(world.landmarks.includes('colosseum') && world.landmarks.includes('leaningTower')
  && world.landmarks.includes('romanRuins') && world.landmarks.includes('plazaFountain'),
  `унікальні лендмарки: ${world.landmarks.join(', ')}`);
check(world.floors >= 8, `яруси Колізею + аттик арки додають поверхні (${world.floors})`);

// ===== 🛡️ gladiator: спавн + розгін (charger) =====
console.log('▸ 🛡️ Зомбі-гладіатор gladiator');
const glad = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  p.respawnProtect = 1e9;
  const ar = g.level.world.layout.arena;
  p.pos.x = ar.x; p.pos.z = ar.z;
  const z = Z.spawn('gladiator', ar.x + 16, ar.z, {});
  z.aggroed = true; z.state = 'chase';
  return { hp: z.stats.hp, charger: z.charger, ztype: z.rig.ztype };
});
check(glad.hp === 175 && glad.charger, `gladiator: 175 HP, charger=${glad.charger}`);
check(glad.ztype === 'gladiator', 'gladiator має власний вигляд (шолом+меч+щит)', glad.ztype);
// gladiator мусить телеграфувати випад і виконати його (чиста лінія видимості в арені)
const charged = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const ar = g.level.world.layout.arena;
  const z = Z.list.find((q) => q.type === 'gladiator' && q.state !== 'dead');
  z.chargeCd = 0;
  let sawTelegraph = false, sawCharge = false;
  for (let i = 0; i < 60; i++) {
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
  `gladiator телеграфує/виконує випад мечем (tg=${charged.sawTelegraph}, charge=${charged.sawCharge})`);

const haveGladInWorld = await page.evaluate(() =>
  window.__game.level.zombies.list.some((z) => z.type === 'gladiator'));
check(haveGladInWorld, 'gladiator присутній у списку зомбі рівня');

// ===== 👑 ЦЕЗАР-бос =====
console.log('▸ 👑 ЦЕЗАР-бос');
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
let bossUnlocked = false;
const tH = Date.now();
while (Date.now() - tH < 60000) {
  const stH = await page.evaluate(() => ({
    active: window.__game.level.zombies.hordeActive,
    unlocked: window.__game.level.missions.bossUnlocked,
  }));
  if (stH.unlocked) { bossUnlocked = true; break; }
  if (stH.active) await page.evaluate(() => window.__game.test.finishHorde());
  await page.waitForTimeout(400);
}
check(bossUnlocked, 'після місій/орд відкривається арена Колізею');
await page.evaluate(() => {
  const a = window.__game.level.world.layout.arena;
  window.__game.test.teleport(a.x, a.z);
});
await waitFor(page, () => window.__game.level.missions.bossStarted, 30000, 'бос вийшов');
const boss = await page.evaluate(() => {
  const b = window.__game.level.zombies.boss;
  return b ? { style: b.bossStyle, hp: b.maxHp, ranged: !!b.ranged, name: window.__game.level.country.boss.name } : null;
});
check(boss && boss.style === 'gladiator', `бос стиль gladiator (${boss && boss.name})`);
check(boss && boss.hp >= 7500, `бос 7500 HP (${boss && boss.hp})`);
check(boss && boss.ranged, 'бос має дальню атаку (пілуми)');

// ===== прохідність: бос на ЧИСТІЙ землі Колізею (не застряг у геометрії) =====
// КРИТИЧНО (анти-баг гробниці EGY): центр арени-Колізею має бути ВІЛЬНИЙ від
// колайдерів-перешкод, бос стоїть рівно на землі (не «вгруз» у суцільну геометрію)
// і може зрушити з місця при погоні. Перевіряємо все три умови.
const reachable = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const w = g.level.world; const ar = w.layout.arena; const b = Z.boss;
  // 1) колайдерів у самому центрі арени немає (пісок чистий — пілони ярусів далеко)
  let collInCore = 0;
  for (const c of w.colliders) if (Math.hypot(c.x - ar.x, c.z - ar.z) < 8) collInCore++;
  // 2) бос рівно на землі (не провалився / не виштовхнутий угору геометрією)
  b.x = ar.x; b.z = ar.z; b.rig.group.position.set(b.x, b.y, b.z);
  await new Promise((r) => setTimeout(r, 120));
  const gh = w.groundH(b.x, b.z);
  const onGround = Math.abs(b.y - gh) < 1.5;
  // 3) бос зрушує до гравця (інтер'єр прохідний; чисто — нема ривків/телеграфу під час заміру)
  p.pos.x = ar.x + 24; p.pos.z = ar.z; p.respawnProtect = 1e9;
  b.aggroed = true; b.state = 'chase'; b.leashed = false; b.chargeCd = 99;
  const x0 = b.x, z0 = b.z;
  for (let i = 0; i < 40; i++) { b.chargeCd = 99; await new Promise((r) => setTimeout(r, 80)); }
  const moved = Math.hypot(b.x - x0, b.z - z0);
  return { collInCore, onGround, moved };
});
check(reachable.collInCore === 0 && reachable.onGround && reachable.moved > 1.0,
  `бос на чистому інтер'єрі Колізею (колайдерів у центрі ${reachable.collInCore}, на землі=${reachable.onGround}, зрушив ${reachable.moved.toFixed(1)}м)`);

// перемагаємо боса → звільнення → +600 МОНЕТ (лазер тепер за зірковий рівень, не за ITA)
const coinsBefore = await page.evaluate(() => window.__game.save.coins);
await page.evaluate(() => window.__game.test.damageBoss(999999));
const win = await waitFor(page, () => window.__game.victoryShown, 30000, 'перемога');
check(win, 'ITA звільнено!');
const st = await page.evaluate(() => window.__game.test.state());
check(st.liberated.includes('ITA'), 'ITA записано в сейв');
check(!st.player.weapons.includes('laser'), 'звільнення ITA НЕ дає лазер (він за зірковий рівень 28)');
check(st.coins >= coinsBefore + 600, `звільнення ITA дало +600 монет (${coinsBefore} → ${st.coins})`);

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  fail += errors.length;
}
console.log(fail === 0 ? '🎉 ІТАЛІЯ (ITA) ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
