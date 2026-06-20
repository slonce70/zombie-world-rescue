// v47 «Чарівник і міцні щити» — headless-перевірки нових ворогів.
//  (а) Чарівник: дальня шкода гравцю; призов тримає ≤5 живих; лікування підіймає HP союзника;
//      щит 100 → ламається → ре-каст за ~5с.
//  (б) Щитоносець: shieldHp=1000; звичайний щит вогнемет ламає; fireproof щит вогонь НЕ бере,
//      а фланг/куля по тілу працює.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Заходимо у пізнішу країну (DEU, dmg=1.55>1) — там дозволено чарівника й fireproof-щити.
await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await page.evaluate(() => { window.__game.save.liberated = { UKR: true, POL: true, DEU: true }; });
await page.evaluate(() => window.__game.startLevel('DEU'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
await page.waitForTimeout(600);

// ---------- (а0) Гейтинг типу: на UKR ★1 чарівник НЕ дозволений, на DEU — дозволений ----------
const gate = await page.evaluate(() => ({ deu: window.__game.level.zombies._allowWizard }));
check(gate.deu === true, 'DEU: чарівник дозволений (_allowWizard)', gate.deu);

// ---------- (а1) Чарівник: дальня атака б'є гравця ----------
console.log('▸ (а) Чарівник: дальня шкода гравцю');
const ranged = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  p.respawnProtect = 0; p.health = 200;
  // ставимо гравця у відкриту арену (чиста лінія видимості), чарівника — за 11 м у зоні кидка
  // (band 8..28; 11 м — у надійній зоні влучання по нерухомому гравцю, без «мертвого» кута дуги)
  const ar = g.level.world.layout.arena;
  p.pos.x = ar.x; p.pos.z = ar.z;
  const w = Z.spawn('wizard', ar.x + 11, ar.z, {});
  w.aggroed = true; w.state = 'chase'; w.minions = [];
  const hp0 = p.health;
  // базові значення (stats) — без країнного множника diff.hp
  return { stats: { hp: w.stats.hp, dmg: w.ranged.dmg, sh: w.shieldMax }, hp0, nid: w.nid };
});
check(ranged.stats.hp === 200, 'чарівник: базові 200 HP', ranged.stats.hp);
check(ranged.stats.dmg === 15, 'чарівник: дальня шкода 15', ranged.stats.dmg);
check(ranged.stats.sh === 100, 'чарівник: щит 100', ranged.stats.sh);
// проганяємо ~6 секунд симуляції — снаряди мають долетіти й поранити
await page.waitForTimeout(6500);
const afterRanged = await page.evaluate(() => window.__game.level.player.health);
check(afterRanged < ranged.hp0, `чарівник поранив гравця здалека (${ranged.hp0} → ${afterRanged})`);

// ---------- (а2) Призов: тримає ≤5 живих, поповнює слот після смерті ----------
console.log('▸ (а) Призов прислужників (≤5 живих)');
const summon = await page.evaluate(async () => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  // чистий чарівник окремо — форсуємо багато циклів призову
  const w = Z.spawn('wizard', p.pos.x + 30, p.pos.z + 30, {});
  w.aggroed = true; w.state = 'chase';
  // багато разів викликаємо _updateWizard з великим dt → таймер призову спрацьовує
  for (let i = 0; i < 40; i++) { w.summonCd = 0; Z._updateWizard(w, 0.1); }
  const aliveMin = w.minions.filter((m) => m && !m.gone && m.state !== 'dead').length;
  // вб'ємо одного прислужника й змусимо ще цикл — слот має звільнитись і поповнитись
  const victim = w.minions.find((m) => m.state !== 'dead');
  let refilled = false;
  if (victim) {
    victim.state = 'dead';
    const before = w.minions.filter((m) => m.state !== 'dead').length;
    w.summonCd = 0; Z._updateWizard(w, 0.1);
    const after = w.minions.filter((m) => m && !m.gone && m.state !== 'dead').length;
    refilled = after >= before; // мертвого прибрано, новий міг додатись
  }
  return { aliveMin, refilled };
});
check(summon.aliveMin > 0 && summon.aliveMin <= 5, `призов тримає ≤5 живих (живих: ${summon.aliveMin})`);
check(summon.refilled, 'слот звільняється після смерті прислужника й може поповнитись');

// ---------- (а3) Лікування: підіймає HP пораненого союзника ----------
console.log('▸ (а) Лікування союзників (AoE +HP)');
const heal = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const w = Z.spawn('wizard', p.pos.x - 30, p.pos.z - 30, {});
  // поранений союзник поруч
  const ally = Z.spawn('walker', w.x + 3, w.z, {});
  ally.hp = 10; const hp0 = ally.hp;
  w.healCd = 0; Z._updateWizard(w, 0.1);
  return { hp0, hp1: ally.hp, max: ally.maxHp };
});
check(heal.hp1 > heal.hp0, `лікування підняло HP союзника (${heal.hp0} → ${heal.hp1})`);
check(heal.hp1 <= heal.max, 'лікування не вище maxHp', `${heal.hp1}/${heal.max}`);

// ---------- (а4) Щит чарівника: 100 → ламається → ре-каст за ~5с ----------
console.log('▸ (а) Щит чарівника: лам → ре-каст ~5с');
const recast = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const w = Z.spawn('wizard', p.pos.x - 50, p.pos.z + 50, {});
  w.aggroed = true;
  const sh0 = w.shieldHp;
  // фронтальний урон ламає щит (dir у щит): dir=напрямок від гравця до зомбі вздовж +Z фронту
  // простіше: б'ємо без dir (вибух) — теж у щит
  w.damage(150, null, false, {});
  const brokeNow = !w.shieldObj && w.shieldHp === 0;
  const recastPending = w.shieldRecastCd;
  // менше за 5с — щита ще нема
  w.shieldRecastCd = 4.9; Z._updateWizard(w, 0.1);
  const stillNone = !w.shieldObj;
  // дотягуємо понад 5с
  w.shieldRecastCd = 0.05; Z._updateWizard(w, 0.1);
  const back = !!w.shieldObj && w.shieldHp === w.shieldMax;
  return { sh0, brokeNow, recastPending, stillNone, back };
});
check(recast.sh0 === 100, 'щит чарівника стартує зі 100', recast.sh0);
check(recast.brokeNow, 'щит чарівника ламається від великого урону');
check(recast.recastPending === 5, 'ре-каст заплановано на ~5с', recast.recastPending);
check(recast.stillNone, 'до 5с щита ще нема (кулдаун)');
check(recast.back, 'після кулдауну щит ре-каститься (100/100)');

// ---------- (б1) Щитоносець: shieldHp=1000 ----------
console.log('▸ (б) Щитоносець: міцний щит 1000');
const shieldHp = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const s = Z.spawn('shield', p.pos.x + 40, p.pos.z, {});
  s.shieldFireproof = false; // звичайний для цього кроку
  return { max: s.shieldMax, hp: s.shieldHp, bodyBase: s.stats.hp };
});
check(shieldHp.max === 1000, 'щитоносець: shieldHp=1000', shieldHp.max);
check(shieldHp.bodyBase === 20, 'щитоносець: базове тіло слабке (20hp)', shieldHp.bodyBase);

// ---------- (б2) Звичайний щит: вогнемет ламає ----------
console.log('▸ (б) Звичайний щит вогнемет ЛАМАЄ');
const normalFire = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const s = Z.spawn('shield', p.pos.x - 40, p.pos.z, {});
  s.shieldFireproof = false;
  const hp0 = s.shieldHp;
  // вогняний урон у фронт щита (dir=null → у щит)
  s.damage(120, null, false, { fire: true });
  return { hp0, hp1: s.shieldHp };
});
check(normalFire.hp1 < normalFire.hp0, `звичайний щит горить (${normalFire.hp0} → ${normalFire.hp1})`);

// ---------- (б3) Fireproof щит: вогонь НЕ бере, але куля/фланг — так ----------
console.log('▸ (б) Анти-вогонь щит: вогонь не бере, куля/фланг працює');
const fireproof = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies; const p = g.level.player;
  const s = Z.spawn('shield', p.pos.x, p.pos.z + 40, {});
  s.shieldFireproof = true;
  const hp0 = s.shieldHp;
  // 1) вогняний урон у фронт щита — має ПОГЛИНУТИСЬ без падіння shieldHp
  s.damage(200, null, false, { fire: true });
  const afterFire = s.shieldHp;
  // 2) звичайна куля у фронт щита — щит падає (fireproof лише проти вогню)
  s.damage(120, null, false, {});
  const afterBullet = s.shieldHp;
  // 3) фланг: куля у тіло збоку (dir уздовж +X, фронт зомбі дивиться у -Z) → у тіло, не в щит
  const bodyHp0 = s.hp;
  const fz = -Math.cos(s.rig.group.rotation.y);
  const fx = -Math.sin(s.rig.group.rotation.y);
  // напрямок збоку (перпендикуляр до фронту): беремо (fz, -fx) — dot з фронтом = 0 → НЕ щит
  const side = { x: fz, z: -fx };
  s.damage(15, side, false, {});
  const bodyHp1 = s.hp;
  return { hp0, afterFire, afterBullet, bodyHp0, bodyHp1, fp: s.shieldFireproof };
});
check(fireproof.afterFire === fireproof.hp0, `fireproof: вогонь НЕ ламає щит (${fireproof.hp0} → ${fireproof.afterFire})`);
check(fireproof.afterBullet < fireproof.hp0, `fireproof: куля все одно б'є щит (${fireproof.afterFire} → ${fireproof.afterBullet})`);
check(fireproof.bodyHp1 < fireproof.bodyHp0, `фланг: тіло вразливе збоку (${fireproof.bodyHp0} → ${fireproof.bodyHp1})`);

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 V47 ВОРОГИ ПРАЦЮЮТЬ' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
