// Тести оновлення 3: щитоносець, базука, магазин 2.0, броня, бафи, Німеччина, Франція
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
const state = () => page.evaluate(() => window.__game.test.state());
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}
async function loadCountry(c, extra = '') {
  await page.goto(`${BASE}/?test&fresh&country=${c}${extra}`);
  await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'рівень ' + c);
}

// ============ 🛡 ЩИТОНОСЕЦЬ ============
console.log('▸ Щитоносець');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const shieldFront = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('shield', p.x + 10, p.z);
  // знерухомлюємо і повертаємо обличчям до гравця
  z.anchor = { x: z.x, z: z.z, r: 0 };
  z.wanderT = 999;
  const dx = z.x - p.x, dz = z.z - p.z;
  const d = Math.hypot(dx, dz);
  const dir = { x: dx / d, y: 0, z: dz / d };
  z.rig.group.rotation.y = Math.atan2(dx, dz); // дивиться на гравця (фронт -Z → atan2(-(-dx), -(-dz)))
  const before = { shield: z.shieldHp, hp: z.hp };
  z.damage(200, dir, false); // 1000-200 = 800 (80%) — без тріщин
  const after100 = { shield: z.shieldHp, hp: z.hp, cracks1: z.shieldObj.cracks1.visible, cracks2: z.shieldObj.cracks2.visible };
  z.damage(360, dir, false); // 440 (44%) → стадії 1 (≤750) і 2 (≤500), але не 3 (>250)
  const after250 = { shield: z.shieldHp, hp: z.hp, cracks1: z.shieldObj.cracks1.visible, cracks2: z.shieldObj.cracks2.visible };
  z.damage(500, dir, false); // 440-500 ≤ 0 → щит ламається
  const broken = { shield: z.shieldHp, hp: z.hp, objGone: !z.shieldObj, state: z.state };
  z.damage(25, dir, false); // тепер тіло (20 HP) — смерть
  return { before, after100, after250, broken, dead: z.state === 'dead', maxHp: z.maxHp };
});
check(shieldFront.before.shield === 1000, `щит має 1000 міцності (${shieldFront.before.shield})`);
check(shieldFront.maxHp === 20, `тіло має 20 HP (${shieldFront.maxHp})`);
check(shieldFront.after100.shield === 800 && shieldFront.after100.hp === 20, `фронтальний постріл б'є щит, не тіло (щит 800: ${shieldFront.after100.shield}, HP: ${shieldFront.after100.hp})`);
check(!shieldFront.after100.cracks1, 'при 800/1000 тріщин ще нема');
check(shieldFront.after250.cracks1 && shieldFront.after250.cracks2, `при 440/1000 видно дві стадії тріщин (${shieldFront.after250.cracks1}, ${shieldFront.after250.cracks2})`);
check(shieldFront.broken.shield === 0 && shieldFront.broken.objGone, 'щит зламано і знято з зомбі');
check(shieldFront.broken.hp === 20 && shieldFront.broken.state !== 'dead', 'після зламу щита тіло ще ціле');
check(shieldFront.dead, 'без щита 25 шкоди вбивають (20 HP)');

const shieldRear = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('shield', p.x + 10, p.z + 3);
  z.anchor = { x: z.x, z: z.z, r: 0 };
  const dx = z.x - p.x, dz = z.z - p.z;
  const d = Math.hypot(dx, dz);
  const dir = { x: dx / d, y: 0, z: dz / d };
  // зомбі дивиться ВІД гравця — постріл у спину
  z.rig.group.rotation.y = Math.atan2(-dx, -dz);
  z.damage(25, dir, false);
  return { shield: z.shieldHp, dead: z.state === 'dead' };
});
check(shieldRear.shield === 1000 && shieldRear.dead, `постріл у спину минає щит і вбиває (щит ${shieldRear.shield})`);

// вибух приймає щит
const shieldBoom = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('shield', p.x - 10, p.z);
  z.anchor = { x: z.x, z: z.z, r: 0 };
  const before = z.shieldHp;
  z.damage(80, null, false); // null dir = вибух
  return { before, after: z.shieldHp, hp: z.hp };
});
check(shieldBoom.after === 920 && shieldBoom.hp === 20, `вибух б'є у щит (1000→${shieldBoom.after}), тіло ціле`);
await page.screenshot({ path: 'shots/u3-shield-zombie.png' });

// ============ 🪂 АЕРОДРОП З БАЗУКОЮ ============
console.log('▸ Аеродроп приносить базуку');
await page.evaluate(() => window.__game.test.airdropNow());
// чекаємо появу ящика і прискорюємо посадку (повний спуск ~20 ігрових секунд —
// у повільному headless це хвилини реального часу)
await waitFor(async () => await page.evaluate(() => !!window.__game.level.effects.airdrop), 20000, 'аеродроп з\'явився');
await page.evaluate(() => {
  const ad = window.__game.level.effects.airdrop;
  ad.g.position.y = ad.gy + 1.5;
});
const dropLanded = await waitFor(async () =>
  await page.evaluate(() => window.__game.level.effects.airdrop && window.__game.level.effects.airdrop.landed), 40000, 'аеродроп приземлився');
check(dropLanded, 'аеродроп приземлився');
const hasBazookaDrop = await page.evaluate(() =>
  window.__game.level.effects.coins.some((c) => c.type === 'bazooka'));
check(hasBazookaDrop, 'у першому аеродропі лежить БАЗУКА');
// підбираємо
await page.evaluate(() => {
  const g = window.__game;
  const bz = g.level.effects.coins.find((c) => c.type === 'bazooka');
  g.test.teleport(bz.mesh.position.x, bz.mesh.position.z);
});
await waitFor(async () => (await state()).player.weapons.includes('bazooka'), 12000, 'базука підібрана');
let s = await state();
check(s.player.weapons.includes('bazooka'), 'базука в арсеналі');
check(s.player.rockets >= 3, `ракети нараховано (${s.player.rockets})`);

// ============ 🚀 ПОСТРІЛ БАЗУКОЮ ============
console.log('▸ Базука: могутній вибух');
const bazookaShot = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  // чисте місце: спавнимо ціль за 12 м (спить — не втече з радіусу вибуху)
  g.test.teleport(60, 120);
  const z = g.test.spawnZombie('walker', 60, 108);
  z.sleeping = true;
  p.switchWeapon('bazooka');
  g.test.aimAtNearestZombie();
  return { hpBefore: z.hp, cur: p.cur };
});
check(bazookaShot.cur === 'bazooka', 'базука в руках (клавіша 7)');
// RAF у headless майже стоїть — драйвимо симуляцію НАПРЯМУ (пастка таймінг-тестів), а не реальні секунди
const bazookaResult = await page.evaluate(() => {
  const g = window.__game, p = g.level.player;
  g.test.mouse(true);
  let flew = false;
  for (let i = 0; i < 40 && !flew; i++) {
    p.update(0.05, g.input, true);
    g.level.effects.update(0.05);
    if (g.level.effects.rockets.length) flew = true;
  }
  g.test.mouse(false);
  for (let i = 0; i < 120 && g.level.effects.rockets.length; i++) {
    g.level.effects.update(0.05);
    g.level.zombies.update(0.05);
  }
  const z = g.level.zombies.list.find((zz) => zz.type === 'walker' && Math.hypot(zz.x - 60, zz.z - 108) < 8);
  return { flew, hp: z ? z.hp : null, maxHp: z ? z.maxHp : null, gone: !z };
});
check(bazookaResult.flew, 'ракета вилетіла');
check(bazookaResult.gone || (bazookaResult.maxHp != null && bazookaResult.hp < bazookaResult.maxHp - 30),
  `вибух ракети зносить ціль (${bazookaResult.gone ? 'ціль знищено' : bazookaResult.maxHp + '→' + Math.round(bazookaResult.hp)})`);
await page.screenshot({ path: 'shots/u3-bazooka.png' });

// ============ 🛒 МАГАЗИН 2.0 ============
console.log('▸ Магазин: зброя і спорядження');
await page.evaluate(() => window.__game.test.giveCoins(3000));
for (const id of ['smg', 'magnum', 'sniper', 'vest', 'helmet', 'sneakers']) {
  await page.evaluate((i) => window.__game.test.shopBuy(i), id);
}
s = await state();
check(s.player.weapons.includes('smg') && s.player.weapons.includes('magnum') && s.player.weapons.includes('sniper'),
  `куплено 3 нові пушки (${s.player.weapons.join(', ')})`);
const gear = await page.evaluate(() => ({
  up: window.__game.save.upgrades,
  maxArmor: window.__game.level.player.maxArmor,
  armor: window.__game.level.player.armor,
  jump: window.__game.level.player.jumpPower,
  helmetMult: window.__game.level.player.helmetMult,
  attached: window.__game.level.player.gearAttached,
}));
check(gear.up.vest === 1 && gear.up.helmet === 1 && gear.up.sneakers === 1, 'спорядження куплено');
check(gear.maxArmor === 100, `бронежилет: макс. броня 100 (${gear.maxArmor})`);
check(gear.armor === 50, `броня нарахована (+50: ${gear.armor})`);
check(gear.jump > 8 && gear.helmetMult < 1, 'кросівки і шолом діють');
check(gear.attached.vest && gear.attached.helmet && gear.attached.sneakers, 'спорядження видно на герої');
// бронепластина
await page.evaluate(() => window.__game.test.shopBuy('armorplate'));
s = await state();
check(s.player.armor === 90, `бронепластина +40 (${s.player.armor})`);
// ракета в магазині доступна, бо базука вже є
await page.evaluate(() => window.__game.test.shopBuy('rocket'));
const rocketsAfterBuy = (await state()).player.rockets;
check(rocketsAfterBuy >= 3, `ракету докуплено (${rocketsAfterBuy})`);

// броня поглинає шкоду (60%), шолом ріже 15%
const dmgTest = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.respawnProtect = 0;
  const before = { hp: p.health, armor: p.armor };
  p.takeDamage(20, p.pos.x + 1, p.pos.z);
  return { before, after: { hp: p.health, armor: p.armor } };
});
const expectedHpLoss = 20 * 0.85 * 0.4; // шолом → броня поглинає 60%
check(Math.abs((dmgTest.before.hp - dmgTest.after.hp) - expectedHpLoss) < 0.5,
  `шолом+броня: втрачено ${(dmgTest.before.hp - dmgTest.after.hp).toFixed(1)} HP замість 20`);
check(dmgTest.after.armor < dmgTest.before.armor, `броня витратилась (${dmgTest.before.armor}→${dmgTest.after.armor.toFixed(1)})`);

// ============ 🎯 СНАЙПЕРКА: ПРОБИТТЯ ============
console.log('▸ Снайперка пробиває наскрізь');
const pierceSetup = await page.evaluate(() => {
  const g = window.__game;
  // арена — гарантовано рівне, порожнє місце
  const a = g.level.world.layout.arena;
  g.test.killZombiesNear(a.x, a.z, 40);
  g.test.teleport(a.x, a.z + 8);
  const targets = [];
  for (const dz of [-4, -7.5, -11]) {
    const z = g.test.spawnZombie('walker', a.x, a.z + dz);
    z.sleeping = true; // стоять рівно, не женуться
    targets.push(z.maxHp);
  }
  const p = g.level.player;
  p.switchWeapon('sniper');
  p.shootCd = 0; // базука лишила довгий кулдаун — тест не про нього
  g.test.aimAtNearestZombie();
  return targets.length;
});
check(pierceSetup === 3, 'три зомбі в чергу');
await page.evaluate(() => window.__game.test.mouse(true));
await page.waitForTimeout(150);
await page.evaluate(() => window.__game.test.mouse(false));
await page.waitForTimeout(800);
const pierceResult = await page.evaluate(() => {
  const g = window.__game;
  const a = g.level.world.layout.arena;
  return g.level.zombies.list
    .filter((z) => z.type === 'walker' && Math.abs(z.x - a.x) < 4 && z.z > a.z - 13 && z.z < a.z - 2)
    .map((z) => ({ hp: z.hp, maxHp: z.maxHp, dead: z.state === 'dead' }));
});
const hurtCount = pierceResult.filter((r) => r.dead || r.hp < r.maxHp).length;
check(hurtCount >= 2, `куля пробила ${hurtCount}/3 зомбі наскрізь (${JSON.stringify(pierceResult.map((r) => r.hp))})`);

// ============ ⚡ БАФИ ============
console.log('▸ Тимчасові підсилення');
const buffTest = await page.evaluate(() => {
  const g = window.__game;
  g.level.effects.onPickup('rage', 1);
  g.level.effects.onPickup('speed', 1);
  g.level.effects.onPickup('magnet', 1);
  return { ...g.level.player.buffs };
});
check(buffTest.rage > 14 && buffTest.speed > 19 && buffTest.magnet > 24,
  `бафи активні (💪${Math.round(buffTest.rage)}с ⚡${Math.round(buffTest.speed)}с 🧲${Math.round(buffTest.magnet)}с)`);
const buffUIShown = await waitFor(async () =>
  (await page.evaluate(() => document.getElementById('buffs').children.length)) >= 3, 8000, 'бафи на HUD');
check(buffUIShown, 'бафи видно на HUD');

// ============ 🇩🇪 НІМЕЧЧИНА ============
console.log('▸ Німеччина: осінь, щитоносці, Залізний Барон');
await loadCountry('DEU');
await page.evaluate(() => window.__game.test.god());
s = await state();
check(s.country === 'DEU', 'країна DEU завантажилась');
const deu = await page.evaluate(() => {
  const g = window.__game;
  const types = {};
  for (const z of g.level.zombies.list) types[z.type] = (types[z.type] || 0) + 1;
  return {
    types,
    leaffall: !!g.level.world.leafMesh,
    carRoofs: g.level.world.floors.filter((f) => Math.abs(f.top - g.level.world.groundH(f.x, f.z) - 1.18) < 0.3).length,
    gateFloor: g.level.world.floors.some((f) => f.top > 7 && Math.abs(f.x) < 2 && Math.abs(f.z - 64) < 3),
    walkerHp: (g.level.zombies.list.find((z) => z.type === 'walker') || {}).maxHp,
  };
});
check((deu.types.shield || 0) >= 4, `щитоносці на карті: ${deu.types.shield}`);
check(deu.leaffall, '🍂 листопад іде');
check(deu.carRoofs >= 5, `автобан: машини з дахами (${deu.carRoofs})`);
check(deu.gateFloor, 'верх міської брами — доступна поверхня');
check(deu.walkerHp === Math.round(70 * 1.55), `складність DEU: HP волоцюги ${deu.walkerHp}`);
await page.screenshot({ path: 'shots/u3-germany.png' });

// бос
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
await waitFor(async () => {
  await page.evaluate(() => window.__game.test.finishHorde());
  return await page.evaluate(() => window.__game.level.missions.bossUnlocked);
}, 150000, 'арена DEU');
await page.evaluate(() => {
  const a = window.__game.level.world.layout.arena;
  window.__game.test.teleport(a.x, a.z);
});
await waitFor(async () => (await state()).bossStarted, 15000, 'бос стартував');
s = await state();
check(s.bossHp === 3200, `Залізний Барон: ${s.bossHp} HP`);
const baronName = await page.evaluate(() => document.getElementById('boss-name').textContent);
check(baronName.includes('БАРОН'), `ім'я боса: "${baronName}"`);
// при 75% HP кличе щитоносців
await page.evaluate(() => window.__game.test.damageBoss(900));
await page.waitForTimeout(4000);
const baronMinions = await page.evaluate(() => {
  const a = window.__game.level.world.layout.arena;
  return window.__game.level.zombies.list.filter((z) => z.type === 'shield' && z.state !== 'dead'
    && Math.hypot(z.x - a.x, z.z - a.z) < 30).length;
});
check(baronMinions > 0, `Барон прикликав щитоносців: ${baronMinions}`);
await page.screenshot({ path: 'shots/u3-iron-baron.png' });

// ============ 🇫🇷 ФРАНЦІЯ ============
console.log('▸ Франція: Ейфелева вежа, плювака, Шеф Багет');
await loadCountry('FRA');
await page.evaluate(() => window.__game.test.god());
s = await state();
check(s.country === 'FRA', 'країна FRA завантажилась');
const fra = await page.evaluate(() => {
  const g = window.__game;
  const types = {};
  for (const z of g.level.zombies.list) types[z.type] = (types[z.type] || 0) + 1;
  return {
    types,
    eiffelFloors: g.level.world.floors.filter((f) => f.top - g.level.world.groundH(f.x, f.z) > 9).length,
    balloon: !!g.level.world.balloon,
    pads: g.level.world.jumpPads.length,
  };
});
check((fra.types.spitter || 0) >= 3, `плюваки на карті: ${fra.types.spitter}`);
check(fra.eiffelFloors >= 2, `Ейфелева вежа: яруси-платформи (${fra.eiffelFloors})`);
check(fra.balloon, '🎈 повітряна куля літає');
check(fra.pads >= 4, `батути на карті (${fra.pads})`);

// плювака плює — драйвимо AI зомбі напряму (RAF у headless стоїть)
const spitFlew = await page.evaluate(() => {
  const g = window.__game;
  const sp = g.level.zombies.list.find((z) => z.type === 'spitter');
  if (!sp) return false;
  g.test.teleport(sp.x + 11, sp.z);
  sp.aggroed = true;
  sp.state = 'chase';
  sp.rangedCd = 0.1;
  sp.sleeping = false;
  for (let i = 0; i < 80; i++) {
    g.level.zombies.update(0.05);
    g.level.effects.update(0.05);
    if (g.level.effects.projectiles.some((p) => p.color === 0x9be84e)) return true;
  }
  return false;
});
check(spitFlew, 'плювака плюється отрутою');
await page.screenshot({ path: 'shots/u3-france.png' });

// Шеф Багет
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue');
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
await waitFor(async () => {
  await page.evaluate(() => window.__game.test.finishHorde());
  return await page.evaluate(() => window.__game.level.missions.bossUnlocked);
}, 150000, 'арена FRA');
await page.evaluate(() => {
  const a = window.__game.level.world.layout.arena;
  window.__game.test.teleport(a.x, a.z);
});
await waitFor(async () => (await state()).bossStarted, 15000, 'бос стартував');
s = await state();
check(s.bossHp === 4200, `Шеф Багет: ${s.bossHp} HP`);
const chefName = await page.evaluate(() => document.getElementById('boss-name').textContent);
check(chefName.includes('БАГЕТ'), `ім'я боса: "${chefName}"`);
const chefThrew = await waitFor(async () => {
  return await page.evaluate(() => {
    const g = window.__game;
    const b = g.level.zombies.boss;
    if (b) {
      const d = Math.hypot(b.x - g.level.player.pos.x, b.z - g.level.player.pos.z);
      if (d < 12 || d > 35) {
        const a = g.level.world.layout.arena;
        g.test.teleport(b.x, Math.min(b.z + 18, a.z + a.r - 4));
      }
    }
    return g.level.effects.projectiles.some((p) => p.color === 0xd9a35e);
  });
}, 90000, 'багет летить');
check(chefThrew, '🥖 Шеф кидає багети');
await page.screenshot({ path: 'shots/u3-chef-baguette.png' });

// ============ КАМПАНІЯ: КРАЇНИ ============
console.log('▸ Кампанія');
const campaign = await page.evaluate(async () => {
  const mod = await import('/src/countries.js');
  return { order: mod.CAMPAIGN_ORDER, names: mod.CAMPAIGN_ORDER.map((id) => mod.COUNTRIES[id].name) };
});
// стійко до додавання нових країн: ≥8, старт з України, без дублів (а не жорстке число)
check(campaign.order.length >= 8 && campaign.order[0] === 'UKR' && new Set(campaign.order).size === campaign.order.length,
  `кампанія: ${campaign.order.length} країн, з України: ${campaign.names.join(' → ')}`);

console.log('');
console.log(failed === 0 ? '🎉 УСІ ТЕСТИ ОНОВЛЕННЯ 3 ПРОЙДЕНО' : `❌ ПРОВАЛЕНО: ${failed}`);
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
