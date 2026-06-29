// v46 «Лазер і вогнемет»: паливо-балон (5с безперервної дії), безперервна шкода,
// руйнування щита вогнеметом (+маркер типу «вогонь» для v47), поповнення, HUD-паливо.
// Headless RAF буває 1-3 fps — тому дренаж і reload перевіряємо детермінованими
// кроками _fireContinuous(), а не wall-clock очікуванням браузерного кадру.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

await page.goto(`${BASE}/?test&fresh&country=UKR`);
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

// видаємо обидві паливні зброї
const setup = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveWeapon('laser');
  g.test.giveWeapon('flamethrower');
  g.test.god();
  const pl = g.level.player;
  return {
    hasLaser: pl.weapons.includes('laser'),
    hasFlame: pl.weapons.includes('flamethrower'),
    fuelLaser: pl.fuel.laser,
    fuelFlame: pl.fuel.flamethrower,
  };
});
console.log('SETUP:', JSON.stringify(setup));
check(setup.hasLaser && setup.hasFlame, 'гравець отримав лазер і вогнемет');
check(setup.fuelLaser === 5 && setup.fuelFlame === 5, 'старт — повний балон 5.0с у кожної');

// ============ (а) безперервна стрільба дренажить паливо ============
console.log('▸ (а) дренаж палива при безперервній стрільбі');
await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.switchWeapon('laser');
  g.test.teleport(0, 0);
  const z = g.test.spawnZombie('walker', pl.pos.x, pl.pos.z - 8);
  z.maxHp = z.hp = 999999; // не помре — лишається ціллю для всіх пульсів
  window.__zHp0 = z.hp; window.__zNid = z.nid;
});
const fuelBefore = await page.evaluate(() => window.__game.level.player.fuel.laser);
const fuelAfterPulse = await page.evaluate(() => {
  const g = window.__game;
  g.test.aimAtNearestZombie();
  g.level.player._fireContinuous(0.25, true);
  return g.level.player.fuel.laser;
});
console.log(`  fuel ${fuelBefore.toFixed(2)} → ${fuelAfterPulse.toFixed(2)}`);
check(fuelAfterPulse < fuelBefore - 0.05, `паливо лазера зменшилось за крок безперервної стрільби (${fuelBefore.toFixed(2)}→${fuelAfterPulse.toFixed(2)})`);

// дренаж до НУЛЯ: жорстко проганяємо ~5.2с стрільби кадрами (компенсує повільний RAF)
console.log('▸ (а2) балон вичерпується до нуля → стрільба зупиняється');
const drained = await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.fuel.laser = 5.0;
  // симулюємо ~5.2с безперервного утримання вогню фіксованими кадрами
  let frames = 0;
  pl._contWasEmpty = false;
  for (let acc = 0; acc < 5.2; acc += 0.05) { pl._fireContinuous(0.05, true); frames++; }
  const afterEmpty = pl.fuel.laser;
  // ще кадр при порожньому балоні: паливо лишається 0, шкоди немає
  const z = g.level.zombies.byNid(window.__zNid);
  const hpBeforeEmpty = z ? z.hp : 0;
  pl._fireContinuous(0.05, true);
  const hpAfterEmpty = z ? z.hp : 0;
  return { afterEmpty, frames, noDamageWhenEmpty: hpBeforeEmpty === hpAfterEmpty };
});
console.log('  DRAINED:', JSON.stringify(drained));
check(drained.afterEmpty <= 0.001, `~5.2с утримання вичерпує балон до 0 (${drained.afterEmpty.toFixed(3)})`);
check(drained.noDamageWhenEmpty, 'при порожньому балоні стрільба не завдає шкоди');

// ============ (б) шкода зомбі (лазер) ============
console.log('▸ (б) лазер завдає шкоди зомбі');
const dmgRes = await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.fuel.laser = 5.0;
  const z = g.level.zombies.byNid(window.__zNid);
  const hp0 = z.hp;
  for (let i = 0; i < 10; i++) pl._fireContinuous(0.05, true); // ~0.5с
  return { hp0, hp1: z.hp, dropped: hp0 - z.hp };
});
console.log('  LASER DMG:', JSON.stringify(dmgRes));
check(dmgRes.dropped > 0, `лазер знизив hp зомбі (−${dmgRes.dropped.toFixed(1)})`);

// ============ (в) вогнемет руйнує звичайний щит (+маркер «вогонь») ============
console.log('▸ (в) вогнемет ламає звичайний щит щитоносця + маркер типу «вогонь»');
const shieldRes = await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.switchWeapon('flamethrower');
  pl.fuel.flamethrower = 5.0;
  g.test.teleport(20, 20);
  const z = g.test.spawnZombie('shield', pl.pos.x, pl.pos.z - 3.5);
  z.rig.group.rotation.y = Math.PI; // щит дивиться на гравця
  g.test.aimAtNearestZombie();
  const sh0 = z.shieldHp;
  // достатньо кадрів зблизька, щоб розбити щит (з v47 міцність 1000 → треба більше вогню)
  let broke = false;
  for (let i = 0; i < 320 && !broke; i++) {
    g.test.aimAtNearestZombie();
    pl._fireContinuous(0.05, true);
    if (!z.shieldObj || z.shieldHp <= 0) broke = true;
    if (i % 20 === 0) pl.fuel.flamethrower = 5.0; // не даємо балону скінчитись у симуляції
  }
  return { sh0, shNow: z.shieldHp, broke, shieldFireMarker: !!z.shieldFire };
});
console.log('  SHIELD:', JSON.stringify(shieldRes));
check(shieldRes.sh0 === 1000, 'щитоносець стартує з 1000 міцності щита (v47)');
check(shieldRes.broke, 'вогнемет зблизька руйнує звичайний щит (нічого не блокуємо у v46)');
check(shieldRes.shieldFireMarker, 'тип шкоди «вогонь» проведено до щита (z.shieldFire=true) — гак для v47');

// ============ (г) поповнення відновлює балон ============
console.log('▸ (г) поповнення (addFuel/addAmmo/refillFuel) відновлює балон');
const refill = await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.fuel.laser = 1.0; pl.fuel.flamethrower = 1.0;
  pl.addFuel(2.0);                       // фіксоване поповнення
  const afterFuel = { l: pl.fuel.laser, f: pl.fuel.flamethrower };
  pl.fuel.laser = 0.5; pl.fuel.flamethrower = 0.5;
  pl.addAmmo(90);                        // пікап набоїв теж доливає паливо
  const afterAmmo = { l: pl.fuel.laser, f: pl.fuel.flamethrower };
  pl.fuel.laser = 0;
  pl.refillFuel('laser');               // повний балон
  const afterRefill = pl.fuel.laser;
  return { afterFuel, afterAmmo, afterRefill, max: 5.0 };
});
console.log('  REFILL:', JSON.stringify(refill));
check(refill.afterFuel.l > 2.5 && refill.afterFuel.f > 2.5, 'addFuel(2) долив паливо обом');
check(refill.afterAmmo.l > 0.5 && refill.afterAmmo.f > 0.5, 'addAmmo (пікап набоїв) долив паливо');
check(refill.afterRefill === 5.0, 'refillFuel наповнює балон повністю (5.0)');
check(refill.afterFuel.l <= 5.0 && refill.afterAmmo.l <= 5.0, 'паливо не перевищує максимум 5.0');

// ============ (д) HUD показує паливо, а не mag/reserve ============
console.log('▸ (д) HUD показує ПАЛИВО для паливних зброй');
const hud = await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.switchWeapon('laser');
  pl.fuel.laser = 4.2;
  g.hud.update(0.016); // оновлюємо HUD один кадр
  return {
    mag: document.getElementById('ammo-mag').textContent,
    reserve: document.getElementById('ammo-reserve').textContent,
    name: document.getElementById('weapon-name').textContent,
  };
});
console.log('  HUD:', JSON.stringify(hud));
check(/🔋/.test(hud.mag), 'HUD-іконка mag = 🔋 для паливної зброї');
check(/4\.2/.test(hud.reserve) && /с|s/.test(hud.reserve), `HUD показує секунди палива (${hud.reserve})`);

// контроль: звичайна зброя показує числа, а не паливо
const hudGun = await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.switchWeapon('pistol');
  g.hud.update(0.016);
  return { mag: document.getElementById('ammo-mag').textContent, reserve: document.getElementById('ammo-reserve').textContent };
});
check(!/🔋/.test(hudGun.mag) && (/^\d+$/.test(hudGun.mag) || hudGun.mag === '⟳'), `звичайна зброя показує патрони, не паливо (${hudGun.mag}/${hudGun.reserve})`);

// ============ (е) ПЕРЕЗАРЯДКА балона (магазин на 5с, не фінітне паливо) ============
console.log('▸ (е) балон перезаряджається: вичерпав → reload → знову повний (5с)');
const reloadCycle = await page.evaluate(() => {
  const g = window.__game; const pl = g.level.player;
  pl.switchWeapon('laser');
  // АВТО: вичерпуємо балон → авто-перезарядка → доводимо update-ами → повний
  pl.fuel.laser = 0; pl.reloading = 0; pl._contWasEmpty = false;
  pl._fireContinuous(0.05, true);                                   // порожній → startReload
  const autoStart = pl.reloading;
  for (let i = 0; i < 30; i++) pl.update(0.1, g.input, true);       // > reloadT (2.0)
  const autoDone = pl.fuel.laser;
  // РУЧНА: частковий балон + перезарядка → повний
  pl.fuel.laser = 2.0; pl.reloading = 0;
  pl.startReload();
  const manStart = pl.reloading;
  for (let i = 0; i < 30; i++) pl.update(0.1, g.input, true);
  const manDone = pl.fuel.laser;
  // ПОВНИЙ балон → перезарядка НЕ стартує (марно)
  pl.fuel.laser = 5.0; pl.reloading = 0; pl.startReload();
  const fullNoReload = pl.reloading;
  // HUD під час перезарядки показує ⟳
  pl.fuel.laser = 1.0; pl.reloading = 1.5; g.hud.update(0.016);
  const hudMag = document.getElementById('ammo-mag').textContent;
  return { autoStart, autoDone, manStart, manDone, fullNoReload, reloadT: pl.weapon.reloadT, hudMag };
});
console.log('  RELOAD:', JSON.stringify(reloadCycle));
check(reloadCycle.autoStart > 0, `вичерпаний балон → авто-перезарядка стартує (${reloadCycle.autoStart}с)`);
check(reloadCycle.autoDone === 5.0, `після перезарядки балон знову повний (${reloadCycle.autoDone})`);
check(reloadCycle.manStart > 0 && reloadCycle.manDone === 5.0, 'ручна перезарядка з часткового балона → повний');
check(reloadCycle.fullNoReload === 0, 'повний балон не перезаряджається даремно');
check(reloadCycle.hudMag === '⟳', `HUD під час перезарядки показує ⟳ (${reloadCycle.hudMag})`);

// ============ ПІДСУМОК ============
console.log('');
check(errs.length === 0, `без JS-помилок (${errs.length})`);
if (errs.length) for (const e of errs.slice(0, 8)) console.log('   ', e);
console.log(failed === 0 ? '🎉 ПАЛИВО-ЗБРОЇ ПРАЦЮЮТЬ' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
