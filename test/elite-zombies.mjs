// 👹 Елітні зомбі (v287): 🛡 щитоносець (фронтальний щит → флан/злам), 🪓 розділювач
// (по смерті — 2 міні), 💥 підривник (телеграф → вибух у радіусі), 👑 золотий (тікає,
// зникає за 12с, по смерті — скриня). Плюс еліт-декор (аура під ногами + іконка над головою).
import { openBrowserTest } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };

// POL: difficulty.dmg 1.15 > 1 — типовий «складніший» контекст
await page.goto(`${BASE}/?test&fresh&country=POL`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

// прибрати всіх зомбі — щоб міряти лише те, що спавнимо у тесті
async function clearAll() {
  await page.evaluate(() => {
    const Z = window.__game.level.zombies;
    for (const z of Z.list) { z.gone = true; Z.scene.remove(z.rig.group); Z.byNidMap.delete(z.nid); }
    Z.list = [];
  });
}

console.log('▸ Нові типи будуються без помилок + еліт-декор');
const build = await page.evaluate(() => {
  const out = { errors: [] };
  const Z = window.__game.level.zombies;
  try {
    const sp = Z.spawn('splitter', 20, 0, {});
    out.splitter = { type: sp.type, ztype: sp.rig.ztype, splits: !!sp.stats.splits, hp: sp.maxHp };
    const ex = Z.spawn('exploder', 24, 0, {});
    out.exploder = { type: ex.type, ztype: ex.rig.ztype, hasCore: !!ex.bombCore, fast: ex.stats.chaseSpeed };
    const el = Z.spawn('shield', 28, 0, { elite: true });
    out.elite = { isElite: !!el.elite, hasAura: !!el.eliteAura, hasIcon: !!el.eliteIcon };
  } catch (e) { out.errors.push(String(e && e.message || e)); }
  return out;
});
check(build.errors.length === 0, 'спавн splitter/exploder/elite без помилок', build.errors.join('|'));
check(build.splitter && build.splitter.ztype === 'splitter' && build.splitter.splits, '🪓 splitter: риг+прапорець splits', JSON.stringify(build.splitter));
check(build.exploder && build.exploder.ztype === 'exploder' && build.exploder.hasCore, '💥 exploder: риг + світний bombCore', JSON.stringify(build.exploder));
check(build.exploder && build.exploder.fast >= 5, '💥 exploder біжить швидше за всіх (chase≥5)', JSON.stringify(build.exploder));
check(build.elite && build.elite.isElite && build.elite.hasAura && build.elite.hasIcon, '👹 еліт-декор: аура + іконка', JSON.stringify(build.elite));

console.log('▸ 🛡 Щитоносець: фронт гасить кулі → флан/злам щита');
await clearAll();
const shield = await page.evaluate(() => {
  const out = { errors: [] };
  const Z = window.__game.level.zombies;
  const z = Z.spawn('shield', 30, 0, {});
  z.rig.group.rotation.y = 0; // фронт дивиться у -Z
  out.shieldMax = z.shieldMax;
  out.hp0 = z.hp;
  // постріл СПЕРЕДУ (dir у +Z, у фронтальний конус) — тіло не страждає, щит просідає
  const shBefore = z.shieldHp;
  z.damage(80, { x: 0, z: 1 }, false);
  out.afterFront = { hp: z.hp, shieldDropped: z.shieldHp < shBefore };
  // постріл ЗЗАДУ (dir у -Z) — б'є по тілу
  const hpBeforeFlank = z.hp;
  z.damage(15, { x: 0, z: -1 }, false);
  out.flankHurtBody = z.hp < hpBeforeFlank;
  // добиваємо щит купою фронтальних влучань — має ЗЛАМАТИСЬ
  for (let i = 0; i < 60; i++) z.damage(80, { x: 0, z: 1 }, false);
  out.shieldBroken = z.shieldHp <= 0 && !z.shieldObj;
  return out;
});
check(shield.shieldMax > 0, '🛡 щит має міцність', String(shield.shieldMax));
check(shield.afterFront.hp === shield.hp0 && shield.afterFront.shieldDropped, 'фронт: тіло ціле, щит просів', JSON.stringify(shield.afterFront));
check(shield.flankHurtBody, 'фланг/ззаду: удар доходить до тіла', String(shield.flankHurtBody));
check(shield.shieldBroken, 'щит ламається після достатніх влучань', String(shield.shieldBroken));

console.log('▸ 🪓 Розділювач: по смерті → рівно 2 міні-зомбі');
await clearAll();
const split = await page.evaluate(() => {
  const Z = window.__game.level.zombies;
  const z = Z.spawn('splitter', 30, 0, {});
  const before = Z.list.filter((e) => e.state !== 'dead').length;
  z.damage(999999, { x: 1, z: 0 }, false); // вбити
  const minis = Z.list.filter((e) => e.mini && e.state !== 'dead');
  return {
    before,
    dead: z.state === 'dead',
    miniCount: minis.length,
    miniType: minis[0] ? minis[0].type : null,
    miniSmaller: minis[0] ? minis[0].rig.group.scale.x < 0.7 : false,
    miniLowHp: minis[0] ? minis[0].maxHp <= 30 : false,
  };
});
check(split.dead, 'розділювача вбито', String(split.dead));
check(split.miniCount === 2, 'зʼявилось рівно 2 міні', String(split.miniCount));
check(split.miniSmaller && split.miniLowHp, 'міні дрібніші й слабкі', JSON.stringify(split));

console.log('▸ 💥 Підривник: телеграф → вибух шкодить гравцю в радіусі');
await clearAll();
const boom = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  p.respawnProtect = 0; p.armor = 0; p.health = p.maxHealth;
  const hp0 = p.health;
  // підривник за 3м від гравця (у радіусі телеграфу)
  const z = Z.spawn('exploder', p.pos.x + 3, p.pos.z, {});
  z.aggroed = true; z.state = 'chase';
  // сусідній зомбі — має загинути від вибуху (нагорода за кайтинг)
  const near = Z.spawn('walker', p.pos.x + 4, p.pos.z, {});
  let telegraphed = false;
  for (let i = 0; i < 12; i++) { // ~1.8с
    Z.update(0.15);
    if (z.explodeT > 0) telegraphed = true;
    if (z.exploded) break;
  }
  return {
    telegraphed,
    exploded: z.exploded === true,
    dead: z.state === 'dead',
    playerHurt: p.health < hp0,
    nearDead: near.state === 'dead' || near.hp <= 0,
  };
});
check(boom.telegraphed, 'підривник телеграфує перед вибухом', String(boom.telegraphed));
check(boom.exploded && boom.dead, 'підривник вибухає й гине', JSON.stringify(boom));
check(boom.playerHurt, 'вибух шкодить гравцю в радіусі', String(boom.playerHurt));
check(boom.nearDead, 'вибух добиває сусідніх зомбі', String(boom.nearDead));

console.log('▸ 💥 Постріл ЗДАЛЕКУ підриває на місці — гравець неушкоджений');
await clearAll();
const shootFar = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  p.respawnProtect = 0; p.armor = 0; p.health = p.maxHealth;
  const hp0 = p.health;
  const z = Z.spawn('exploder', p.pos.x + 40, p.pos.z, {}); // далеко
  z.damage(999999, { x: 1, z: 0 }, false); // застрелили до детонації
  return { exploded: z.exploded === true, dead: z.state === 'dead', playerSafe: p.health === hp0 };
});
check(shootFar.exploded && shootFar.dead, 'постріл підриває підривника на місці', JSON.stringify(shootFar));
check(shootFar.playerSafe, 'здалеку вибух безпечний для гравця', String(shootFar.playerSafe));

console.log('▸ 👑 Золотий (мапний, без opts): тікає, БЕЗ TTL, по смерті — скриня');
await clearAll();
const golden = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const z = Z.spawn('walker', p.pos.x + 10, p.pos.z, { golden: true });
  const out = { isGolden: !!z.golden, ttl0: z.goldenTtl };
  // близько до гравця → тікає
  Z.update(0.1);
  out.flees = z.state === 'flee';
  // скриня по вбивству (solo): подія goldenChest
  let chest = null;
  g.level.bus.on('goldenChest', (d) => { chest = d; });
  z.damage(999999, { x: 1, z: 0 }, false);
  out.dead = z.state === 'dead';
  out.chest = chest;
  return out;
});
// 🩹 v294: мапні/populate/коопні золоті НЕ мають TTL — роумлять, поки їх не вб'ють.
check(golden.isGolden && golden.ttl0 === undefined, '👑 мапний золотий БЕЗ TTL (роумить до вбивства)', JSON.stringify({ g: golden.isGolden, t: golden.ttl0 }));
check(golden.flees, 'золотий тікає від гравця', String(golden.flees));
check(golden.dead && golden.chest && typeof golden.chest.x === 'number', 'по смерті золотий дарує скриню (goldenChest)', JSON.stringify(golden.chest));

console.log('▸ 👑 Мапний золотий ВИЖИВАЄ >12с симуляції (без TTL)');
await clearAll();
const survives = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const z = Z.spawn('walker', p.pos.x + 60, p.pos.z, { golden: true }); // далеко — не тікає активно
  const nid = z.nid;
  for (let i = 0; i < 30; i++) Z.update(0.5); // 15с > старий 12с TTL
  return { alive: !!Z.byNid(nid), ttl: z.goldenTtl };
});
check(survives.alive && survives.ttl === undefined, 'мапний золотий живий після 15с (жодного TTL)', JSON.stringify(survives));

console.log('▸ 👑 Амбієнтний золотий (spawnGolden(true)): TTL 25с і зникає');
await clearAll();
const ambient = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies;
  const z = Z.spawnGolden(true); // v287-подія: спавн 30–60м ВІД гравця + TTL 25с
  const nid = z.nid;
  const ttl0 = z.goldenTtl;
  const p = g.level.player;
  const dist = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
  for (let i = 0; i < 60; i++) Z.update(0.5); // 30с > 25с TTL
  return { ttl0, dist, gone: !Z.byNid(nid) };
});
check(ambient.ttl0 === 25, 'амбієнтний золотий має TTL 25с', String(ambient.ttl0));
check(ambient.dist >= 25 && ambient.dist <= 65, 'амбієнтний золотий спавниться 30–60м від гравця (досяжно)', String(ambient.dist));
check(ambient.gone, 'амбієнтний золотий зник за ~25с без вбивства', String(ambient.gone));

console.log('▸ Бестіарій рахує нові види як звичайні');
const bestiary = await page.evaluate(async () => {
  const { BESTIARY_TYPE_IDS } = await import('/src/zombies.js');
  return { hasSplitter: BESTIARY_TYPE_IDS.includes('splitter'), hasExploder: BESTIARY_TYPE_IDS.includes('exploder') };
});
check(bestiary.hasSplitter && bestiary.hasExploder, 'splitter/exploder у BESTIARY_TYPE_IDS', JSON.stringify(bestiary));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ЕЛІТНІ ЗОМБІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
