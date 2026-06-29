// 🤖 Зомбі-робот (мех із пілотом): 1255 HP, меч 20 зблизька + гармата 10 здаля,
// при смерті ВИБУХАЄ й б'є гравця 157 по площі (~6м).
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

// FRA: difficulty.hp 1.8 >= 1.5 → робот дозволений (гейт важких ворогів)
await page.goto(`${BASE}/?test&fresh&country=FRA`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Знаходжуваність: гарантований спавн');
const found = await page.evaluate(() => ({
  robots: window.__game.level.zombies.list.filter((z) => z.type === 'robot').length,
}));
check(found.robots === 3, 'у дозволеній країні (FRA) рівно 3 роботи на рівні', JSON.stringify(found));

console.log('▸ Зомбі-робот: стати + дві атаки');
const cfg = await page.evaluate(() => {
  const out = { errors: [] };
  const g = window.__game; const Z = g.level.zombies;
  out.allowRobot = Z._allowRobot; // у FRA має бути true
  try {
    const z = Z.spawn('robot', g.level.player.pos.x + 24, g.level.player.pos.z, {});
    out.built = z.type === 'robot' && z.rig.ztype === 'robot';
    out.maxHp = z.maxHp;                 // 1255 × diff.hp(1.8) ≈ 2259
    out.meleeDmg = z.stats.dmg;          // меч = 20
    out.hasRanged = !!z.ranged;          // гармата
    out.cannonDmg = z.ranged && z.ranged.dmg; // 10
  } catch (e) { out.errors.push('robot: ' + e.message); }
  return out;
});
check(cfg.allowRobot === true, 'робот дозволений у FRA (країна ≠ Україна)', String(cfg.allowRobot));
check(cfg.built, 'spawn(robot) будує риг меха', cfg.errors.join('|'));
check(cfg.maxHp >= 1255, 'робот ~1255 HP (×складність)', String(cfg.maxHp));
check(cfg.meleeDmg === 20, 'меч зблизька — 20 шкоди', String(cfg.meleeDmg));
check(cfg.hasRanged && cfg.cannonDmg === 10, 'гармата здаля — 10 шкоди (ranged)', String(cfg.cannonDmg));

console.log('▸ Вибух при смерті: 157 по площі');
const boom = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  p.maxHealth = 400; p.health = 400; p.armor = 0; p.gadgetShield = 0; p.respawnProtect = 0;
  // робот ВПРИТУЛ (у радіусі вибуху 6м). 1-й удар ламає щит, 2-й (вже без щита) вбиває → вибух
  const zNear = g.level.zombies.spawn('robot', p.pos.x + 3, p.pos.z, {});
  const hp0 = p.health;
  zNear.damage(999999, null, false); // ламає щит (тіло ціле)
  zNear.damage(999999, null, false); // щита немає → тіло гине → вибух
  const nearDrop = hp0 - p.health, nearDead = zNear.state === 'dead';
  // робот ДАЛЕКО (поза радіусом вибуху)
  p.health = 400; p.respawnProtect = 0;
  const zFar = g.level.zombies.spawn('robot', p.pos.x + 12, p.pos.z, {});
  const hp1 = p.health;
  zFar.damage(999999, null, false); // ламає щит
  zFar.damage(999999, null, false); // вбиває → вибух (але гравець за 12м)
  const farDrop = hp1 - p.health;
  return { nearDrop, nearDead, farDrop };
});
check(boom.nearDead, 'робот гине від смертельної шкоди', JSON.stringify(boom));
check(boom.nearDrop === 157, 'вибух завдав РІВНО 157 гравцю в радіусі', JSON.stringify(boom));
check(boom.farDrop === 0, 'гравець за межами радіуса (12м) НЕ постраждав від вибуху', JSON.stringify(boom));

console.log('▸ Щит-гаджет: 555, поглинання, перекаст');
const sh = await page.evaluate(() => {
  const Z = window.__game.level.zombies;
  const z = Z.spawn('robot', window.__game.level.player.pos.x + 30, window.__game.level.player.pos.z, {});
  const start = { shieldHp: z.shieldHp, hasShield: !!z.shieldObj, bodyHp: z.hp };
  z.damage(100, null, false);            // удар у щит (null dir → завжди в щит); тіло ціле
  const afterHit = { shieldHp: z.shieldHp, bodyHp: z.hp };
  z.damage(9999, null, false);           // ламаємо щит
  const afterBreak = { shieldObj: !!z.shieldObj, recast: z.shieldRecastCd, bodyHp: z.hp };
  Z._updateRobotShield(z, 9);            // спливає ~8с таймера → новий щит
  const afterRecast = { shieldHp: z.shieldHp, hasShield: !!z.shieldObj };
  return { start, afterHit, afterBreak, afterRecast };
});
check(sh.start.shieldHp === 555 && sh.start.hasShield, 'робот стартує зі щитом 555', JSON.stringify(sh.start));
check(sh.afterHit.shieldHp === 455 && sh.afterHit.bodyHp === sh.start.bodyHp, 'щит поглинає шкоду, тіло ціле', JSON.stringify(sh.afterHit));
check(!sh.afterBreak.shieldObj && sh.afterBreak.recast === 8 && sh.afterBreak.bodyHp === sh.start.bodyHp, 'щит ламається (555 поглинуто) → перекаст 8с, тіло ще ціле', JSON.stringify(sh.afterBreak));
check(sh.afterRecast.hasShield && sh.afterRecast.shieldHp === 555, 'через ~8с робот ставить НОВИЙ щит 555', JSON.stringify(sh.afterRecast));

console.log('▸ Гейт: туторіал-Україна без робота');
await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const ukr = await page.evaluate(() => ({
  allow: window.__game.level.zombies._allowRobot,
  robots: window.__game.level.zombies.list.filter((z) => z.type === 'robot').length,
}));
check(ukr.allow === false && ukr.robots === 0, 'в Україні ★1 робота немає (туторіал чистий)', JSON.stringify(ukr));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ЗОМБІ-РОБОТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
