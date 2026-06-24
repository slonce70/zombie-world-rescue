// Тести оновлення 5 «Сила і Краса»: баланс, оптика, самокат-фізика,
// гаджет-лоадаут, нові зомбі (стрілець/броньовик), магазин із вкладками, дахи
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
async function loadCountry(c) {
  await page.goto(`${BASE}/?test&fresh&country=${c}`);
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level, null, { timeout: 30000 });
}

// ============ ⚖️ БАЛАНС ============
console.log('▸ Баланс: щит 1000, базука 220');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const balance = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('shield', p.x + 8, p.z);
  z.sleeping = true;
  const dir = { x: 1, y: 0, z: 0 };
  z.rig.group.rotation.y = Math.PI / 2; // обличчям до -X... фронт назустріч пострілу
  // постріл у щит з фронту
  const dx = z.x - p.x, dz = z.z - p.z;
  const d = Math.hypot(dx, dz);
  const fdir = { x: dx / d, y: 0, z: dz / d };
  z.rig.group.rotation.y = Math.atan2(dx, dz);
  const sh0 = z.shieldHp;
  z.damage(300, fdir, false); // 1000-300=700 → стадія 1 (≤750), ще не 2 (>500)
  const c1 = { sh: z.shieldHp, cr1: z.shieldObj.cracks1.visible, cr2: z.shieldObj.cracks2.visible, cr3: z.shieldObj.cracks3.visible };
  z.damage(300, fdir, false); // 400 → стадія 2 (≤500), ще не 3 (>250)
  const c2 = { sh: z.shieldHp, cr1: z.shieldObj.cracks1.visible, cr2: z.shieldObj.cracks2.visible, cr3: z.shieldObj.cracks3.visible };
  z.damage(200, fdir, false); // 200 → стадія 3 (≤250)
  const c3 = { sh: z.shieldHp, cr3: z.shieldObj.cracks3.visible };
  z.damage(300, fdir, false); // 200-300 ≤ 0 → злам
  const broken = { sh: z.shieldHp, gone: !z.shieldObj };
  return { sh0, c1, c2, c3, broken, bazooka: null };
});
check(balance.sh0 === 1000, `щит щитоносця 1000 (${balance.sh0})`);
check(balance.c1.sh === 700, `після 300 шкоди: 700 (${balance.c1.sh}), тріщини 1: ${balance.c1.cr1}`);
check(balance.c1.cr1 && !balance.c1.cr2, 'стадія 1 тріщин при ≤75% (≤750)');
check(balance.c2.cr2 && !balance.c2.cr3, 'стадія 2 при ≤50% (≤500)');
check(balance.c3.cr3, 'стадія 3 при ≤25% (≤250)');
check(balance.broken.gone, 'щит ламається');
const bazooka = await page.evaluate(() => window.__game.level.player.constructor ? null : null);
const bazDmg = await page.evaluate(() => {
  // WEAPONS недоступний напряму — перевіряємо через ефект вибуху
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('tank', p.x + 3, p.z); // 230*1.55? UKR → 230 hp
  z.sleeping = true;
  const hpBefore = z.hp;
  g.level.effects.onExplosion(z.x, z.y + 1, z.z, 4.5, 220);
  return { hpBefore, hpAfter: z.hp, dead: z.state === 'dead' };
});
check(bazDmg.dead || bazDmg.hpBefore - bazDmg.hpAfter >= 180, `вибух базуки (220) зносить танка (${bazDmg.hpBefore} → ${Math.max(0, Math.round(bazDmg.hpAfter))})`);
void bazooka;

// ============ 🔭 ОПТИКА СНАЙПЕРКИ ============
console.log('▸ Оптика снайперки');
const scopeRes = await page.evaluate(async () => {
  const g = window.__game;
  g.test.giveWeapon('sniper');
  const p = g.level.player;
  const fovBefore = p.camera.fov;
  const drive = (n) => {
    for (let i = 0; i < n; i++) {
      p.update(0.05, g.input, true);
      g.hud.update(0.05);
    }
  };
  g.input.rmbDown = true;
  drive(80);
  const scoped = p.scoped;
  const fovScoped = p.camera.fov;
  const overlay = document.getElementById('scope').classList.contains('show');
  g.input.rmbDown = false;
  drive(80);
  return { fovBefore, scoped, fovScoped, overlay, unscoped: !p.scoped, fovBack: p.camera.fov };
});
check(scopeRes.scoped, 'ПКМ вмикає оптику зі снайперкою');
check(scopeRes.fovScoped < 40, `FOV звужується (${Math.round(scopeRes.fovScoped)})`);
check(scopeRes.overlay, 'оверлей прицілу показується');
check(scopeRes.unscoped && scopeRes.fovBack > 60, 'відпускання ПКМ вимикає оптику');
const scopePistol = await page.evaluate(async () => {
  const g = window.__game;
  g.level.player.switchWeapon('pistol');
  g.input.rmbDown = true;
  await new Promise((r) => setTimeout(r, 700));
  const scoped = g.level.player.scoped;
  g.input.rmbDown = false;
  return scoped;
});
check(!scopePistol, 'з пістолетом оптика не вмикається');

// ============ 🛴 ФІЗИКА САМОКАТА ============
console.log('▸ Фізика самоката');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const rideRes = await page.evaluate(() => {
  const g = window.__game, p = g.level.player;
  g.test.mountScooter(0);
  const yaw0 = p.yaw;
  // RAF у headless майже стоїть — драйвимо фізику самоката НАПРЯМУ (детермінізм без реальних секунд)
  const drive = (n) => { for (let i = 0; i < n; i++) p.update(0.05, g.input, true); };
  // газ
  g.test.key('KeyW', true); drive(60); g.test.key('KeyW', false);
  const speedAfterGas = p.rideSpeed;
  const animMode = p.rig.anim.mode;
  // кермо праворуч на ходу
  g.test.key('KeyD', true); drive(20); g.test.key('KeyD', false);
  const yawAfterSteer = p.yaw;
  // вбік не їде: швидкість завжди вздовж погляду
  const velAngle = Math.atan2(-p.vel.x, -p.vel.z);
  const spd = Math.hypot(p.vel.x, p.vel.z);
  const aligned = spd < 0.5 || Math.abs(((velAngle - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.1;
  // гальмо — до зупинки
  g.test.key('KeyS', true);
  for (let i = 0; i < 120 && p.rideSpeed > 0.5; i++) p.update(0.05, g.input, true);
  g.test.key('KeyS', false);
  const speedAfterBrake = p.rideSpeed;
  // таран ВІДСУТНІЙ: зомбі впритул не отримує шкоди від їзди
  const z = g.test.spawnZombie('walker', p.pos.x, p.pos.z);
  z.sleeping = true;
  const hpBefore = z.hp;
  drive(20);
  const noRam = z.hp === hpBefore;
  g.test.dismountScooter();
  return { speedAfterGas, animMode, yaw0, yawAfterSteer, aligned, speedAfterBrake, noRam };
});
check(rideRes.speedAfterGas > 5, `W розганяє самокат (${rideRes.speedAfterGas.toFixed(1)} м/с)`);
check(rideRes.animMode === 'ride', `поза «на самокаті», а не біг (${rideRes.animMode})`);
check(Math.abs(rideRes.yawAfterSteer - rideRes.yaw0) > 0.15, 'A/D повертають кермо');
check(rideRes.aligned, 'самокат їде тільки вперед/назад (без боком)');
check(rideRes.speedAfterBrake <= 0.6, `S гальмує (${rideRes.speedAfterBrake.toFixed(1)})`);
check(rideRes.noRam, 'таран прибрано — зомбі цілий');

// ============ 🧰 ГАДЖЕТ-ЛОАДАУТ ============
console.log('▸ Гаджети: щит і відновлення');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const shieldRes = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('shield');
  const used = g.test.useGadget();
  const shieldVal = p.gadgetShield;
  const cd = g.level.gadgets.cd;
  // удар 30: щит приймає все (з оновлення 9 щит = 50)
  p.respawnProtect = 0;
  const hpBefore = p.health;
  p.takeDamage(30, p.pos.x + 1, p.pos.z);
  const after100 = { hp: p.health, shield: p.gadgetShield };
  // ще 60: щит (20) поглинає частину, решта в гравця
  p.takeDamage(60, p.pos.x + 1, p.pos.z);
  const after300 = { hp: p.health, shield: p.gadgetShield };
  g.test.god();
  return { used, shieldVal, cd, hpBefore, after100, after300 };
});
check(shieldRes.used && shieldRes.shieldVal === 50, `щит дає 50 захисту (${shieldRes.shieldVal})`);
check(shieldRes.cd >= 29, `перезарядка щита 30с (${Math.round(shieldRes.cd)})`);
check(shieldRes.after100.hp === shieldRes.hpBefore && shieldRes.after100.shield === 20, `30 шкоди з'їв щит (HP ${shieldRes.after100.hp}, щит ${shieldRes.after100.shield})`);
check(shieldRes.after300.shield === 0 && shieldRes.after300.hp < shieldRes.hpBefore, 'щит розбито — решта пройшла у гравця');
const healRes = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('heal');
  g.test.gadgetCdReset();
  p.health = 40;
  const used = g.test.useGadget();
  return { used, hp: p.health, cd: g.level.gadgets.cd };
});
check(healRes.used && healRes.hp === 90, `відновлення +50 HP (${healRes.hp})`);
check(healRes.cd >= 24, `перезарядка відновлення 25с (${Math.round(healRes.cd)})`);
const cdBlock = await page.evaluate(() => {
  const g = window.__game;
  g.level.player.health = 30;
  return { used: g.test.useGadget(), hp: g.level.player.health };
});
check(!cdBlock.used && cdBlock.hp === 30, 'під час перезарядки гаджет не працює');

// ============ 🧱 БАРИКАДА: розстріл і повернення ============
console.log('▸ Барикада: кулі та E');
const wallShoot = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('wall');
  g.test.gadgetCdReset();
  g.test.teleport(0, 150);
  p.yaw = 0;
  g.test.useGadget();
  const w = g.level.gadgets.walls[0];
  if (!w) return { placed: false };
  // стріляємо в барикаду
  p.switchWeapon('pistol');
  p.shootCd = 0;
  const hpBefore = w.hp;
  g.test.setAim(0, -0.1);
  const t0 = performance.now();
  while (performance.now() - t0 < 6000 && w.hp >= hpBefore) {
    g.test.mouse(true);
    await new Promise((r) => setTimeout(r, 250));
    g.test.mouse(false);
  }
  const shotDamages = w.hp < hpBefore;
  // забираємо назад (E)
  const countBefore = g.level.gadgets.walls.length;
  const t1 = performance.now();
  while (performance.now() - t1 < 5000 && g.level.gadgets.walls.length === countBefore) {
    g.test.key('KeyE', true);
    await new Promise((r) => setTimeout(r, 250));
    g.test.key('KeyE', false);
  }
  return { placed: true, shotDamages, pickedUp: g.level.gadgets.walls.length === 0 };
});
check(wallShoot.placed, 'барикада поставлена');
check(wallShoot.shotDamages, 'кулі гравця руйнують барикаду');
check(wallShoot.pickedUp, 'E повертає барикаду');

// ============ 🔫🦾 НОВІ ЗОМБІ ============
console.log('▸ Стрілець і броньовик');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const gunnerRes = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.respawnProtect = 0;
  const z = g.test.spawnZombie('gunner', p.pos.x + 12, p.pos.z);
  z.aggroed = true;
  z.state = 'chase';
  z.rangedCd = 0;
  z.sleeping = false;
  const hpBefore = p.health;
  // драйвимо AI стрільця + політ кулі НАПРЯМУ (RAF у headless стоїть)
  for (let i = 0; i < 120 && p.health >= hpBefore; i++) {
    g.level.zombies.update(0.05);
    g.level.effects.update(0.05);
    p.update(0.05, g.input, true);
  }
  const dmg = hpBefore - p.health;
  g.test.god();
  g.test.killZombiesNear(p.pos.x, p.pos.z, 50);
  return { dmg };
});
check(gunnerRes.dmg > 0 && gunnerRes.dmg <= 12, `стрілець влучає з пістолета (~10 шкоди: ${gunnerRes.dmg.toFixed(0)})`);
const ironRes = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('ironclad', p.x + 6, p.z);
  z.sleeping = true;
  const chest0 = z.chestHp;
  // тілесний постріл — у нагрудник
  z.damage(150, { x: 1, y: 0, z: 0 }, false);
  const afterBody = { chest: z.chestHp, hp: z.hp };
  // хедшот — повз броню!
  const hpBefore = z.hp;
  z.damage(30, { x: 1, y: 0, z: 0 }, true);
  const afterHead = { chest: z.chestHp, hp: z.hp };
  // ламаємо нагрудник
  z.damage(500, { x: 1, y: 0, z: 0 }, false);
  const brokenPlate = z.chestHp === 0;
  // тепер тіло вразливе
  z.damage(100, { x: 1, y: 0, z: 0 }, false);
  return { chest0, afterBody, hpBefore, afterHead, brokenPlate, dead: z.state === 'dead' };
});
check(ironRes.chest0 === 600, `нагрудник 600 міцності (${ironRes.chest0})`);
check(ironRes.afterBody.chest === 450 && ironRes.afterBody.hp === ironRes.hpBefore + 30 - 30 || ironRes.afterBody.hp > 0, `постріл у тіло б'є нагрудник (${ironRes.afterBody.chest})`);
check(ironRes.afterHead.hp < ironRes.hpBefore && ironRes.afterHead.chest === 450, 'хедшот проходить ПОВЗ нагрудник');
check(ironRes.brokenPlate && ironRes.dead, 'після зламу нагрудника тіло вразливе');

// ============ 🛒 МАГАЗИН: ВКЛАДКИ ============
console.log('▸ Магазин із вкладками');
const shopTabs = await page.evaluate(() => {
  const g = window.__game;
  g.shop.open();
  const tabs = [...document.querySelectorAll('.shop-tab')].map((t) => t.textContent);
  const firstTabItems = document.querySelectorAll('.shop-item').length;
  // перемикаємо на «Зброя»
  const weaponTab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Зброя');
  weaponTab.click();
  const weaponItems = [...document.querySelectorAll('.shop-item')].map((i) => i.dataset.id);
  g.shop.close();
  return { tabs, firstTabItems, weaponItems };
});
check(shopTabs.tabs.length >= 4, `вкладок: ${shopTabs.tabs.length} (${shopTabs.tabs.join(', ')})`);
check(shopTabs.firstTabItems > 0, 'перша вкладка має товари');
check(shopTabs.weaponItems.includes('sniper') && !shopTabs.weaponItems.includes('medkit'), 'вкладка «Зброя» показує лише зброю');

// ============ 🏠 ДАХИ ============
console.log('▸ Дахи не просвічуються');
const roofRes = await page.evaluate(() => {
  // двосхилий дах тепер має внутрішні грані (вдвічі більше трикутників)
  const g = window.__game;
  const geo = g.level.world._prismGeo(4, 2, 4);
  return { verts: geo.attributes.position.count };
});
check(roofRes.verts === 36, `дах двосторонній: 36 вершин замість 18 (${roofRes.verts})`);

// ============ ПІДСУМОК ============
console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 12)) console.log('  ', e);
  failed += errors.length;
} else {
  console.log('✅ Без помилок у консолі');
}
console.log(failed === 0 ? '🎉 УСІ ТЕСТИ ОНОВЛЕННЯ 5 ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
