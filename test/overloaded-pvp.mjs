import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&seed=11`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Тумблер 💀 Перегруженого ПВП зʼявляється після 8 звільнених країн');
const menu = await page.evaluate(() => {
  const g = window.__game;
  const seven = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true };
  const eight = { ...seven, TUR: true };
  g.save.liberated = seven;
  g.renderSoloMenu();
  const before = document.querySelector('.sm-skull[data-hard="overloaded-pvp"]');
  g.save.liberated = eight;
  g.renderSoloMenu();
  const after = document.querySelector('.sm-skull[data-hard="overloaded-pvp"]');
  const normal = document.querySelector('.solo-mode[data-mode="pvp"]');
  return {
    beforeExists: !!before,
    afterExists: !!after,
    normalExists: !!normal,
    normalLockedAt8: normal && normal.classList.contains('locked'),
  };
});
check(!menu.beforeExists, 'до 8 країн тумблера 💀 немає', JSON.stringify(menu));
check(menu.afterExists, 'після 8 країн картка ПВП має тумблер 💀 Складно', JSON.stringify(menu));
check(menu.normalExists && !menu.normalLockedAt8, 'звичайне ПВП відкрите разом із тумблером (з 8 країн)', JSON.stringify(menu));

console.log('▸ Старт Перегруженого ПВП: 35x35, 2500 HP, гармата+меч, зомбі 3000 HP');
await page.evaluate(() => window.__game.test.startOverloadedPvp());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.pvp, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(9999);
  g.shop.open();
  const p = g.level.player;
  p.health = 1200;
  for (const type of ['speed', 'rage', 'bubble', 'magnet', 'medkit', 'ammo']) g.level.effects.onPickup(type);
  const shield0 = p.gadgetShield;
  const used = g.test.useGadget();
  const usedAgain = g.test.useGadget();
  const z = g.level.zombies.list.find((x) => x.pvp);
  const meshBounds = (root) => {
    root.updateWorldMatrix(true, true);
    const Vec3 = p.pos.constructor;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    root.traverse((o) => {
      const a = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      if (!o.isMesh || !a) return;
      const v = new Vec3();
      for (let i = 0; i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
        min.x = Math.min(min.x, v.x); min.y = Math.min(min.y, v.y); min.z = Math.min(min.z, v.z);
        max.x = Math.max(max.x, v.x); max.y = Math.max(max.y, v.y); max.z = Math.max(max.z, v.z);
      }
    });
    return {
      x: +(max.x - min.x).toFixed(3),
      y: +(max.y - min.y).toFixed(3),
      z: +(max.z - min.z).toFixed(3),
    };
  };
  const oldCur = p.cur;
  p.cur = 'sword';
  p._applyView();
  const fpSwordShape = meshBounds(p.fpArms.sword.group);
  p.cur = oldCur;
  p._applyView();
  return {
    mode: g.level.pvp.variant,
    roomSize: g.level.pvp.roomSize,
    alive: g.level.zombies.list.filter((x) => x.state !== 'dead' && x.pvp).length,
    zombieType: z && z.type,
    zombieHp: z && z.hp,
    zombieMaxHp: z && z.maxHp,
    zombieDmg: z && z.stats.dmg,
    zombieRanged: z && z.ranged && { dmg: z.ranged.dmg, cd: z.ranged.cd },
    zombieShield: z && { hp: z.shieldHp, max: z.shieldMax, recast: z.shieldRecastCd },
    playerMaxHp: p.maxHealth,
    playerHp: p.health,
    weapons: [...p.weapons],
    cur: p.cur,
    cannon: window.__game.test.weapon('cannon'),
    sword: window.__game.test.weapon('sword'),
    swordModel: {
      fp: !!(p.fpArms.sword && p.fpArms.sword.group.getObjectByName('sword-blade')),
      tp: !!(p.tpGuns.sword && p.tpGuns.sword.group.getObjectByName('sword-blade')),
      fpSwordShape,
    },
    shopOpen: g.shop.isOpen,
    shield0,
    shieldAfterUse: p.gadgetShield,
    gadgetCd: g.level.gadgets.cd,
    used,
    usedAgain,
    buffs: { ...p.buffs },
    pet: !!g.level.pet,
    noGadgets: g.level.noGadgets,
    noShop: g.level.noShop,
    noPickups: g.level.noPickups,
  };
});
check(started.mode === 'overloaded' && started.roomSize === 35, 'режим стартує у кімнаті 35x35', JSON.stringify(started));
check(started.alive === 1 && started.zombieHp === 3000 && started.zombieMaxHp === 3000,
  'у кімнаті один зомбі з 3000 HP', JSON.stringify(started));
check(started.zombieType === 'robot' && started.zombieDmg === 300 && started.zombieRanged.dmg === 350 && started.zombieRanged.cd === 2.5,
  'зомбі має меч 300 і гармату 350/2.5с', JSON.stringify(started));
check(started.zombieShield.hp === 1000 && started.zombieShield.max === 1000,
  'зомбі стартує зі щитом 1000 HP', JSON.stringify(started));
check(started.playerMaxHp === 2500 && started.playerHp === 1200,
  'гравець має 2500 max HP, пікапи/аптечка вимкнені', JSON.stringify(started));
check(JSON.stringify(started.weapons) === JSON.stringify(['cannon', 'sword']) && started.cur === 'cannon',
  'гравець має рівно гармату і меч, активна гармата', JSON.stringify(started));
check(started.cannon && started.cannon.dmg === 350 && started.cannon.reloadT === 2.5 && started.sword && started.sword.dmg === 300,
  'параметри зброї відповідають режиму', JSON.stringify(started));
check(started.swordModel.fp && started.swordModel.tp,
  'меч має видиму модель у руках, а не fallback-пістолет', JSON.stringify(started.swordModel));
check(started.swordModel.fpSwordShape.y > started.swordModel.fpSwordShape.z * 0.7,
  'меч у першій особі стоїть як меч, а не як ствол гармати', JSON.stringify(started.swordModel));
check(!started.shopOpen && started.noShop && started.noPickups && started.noGadgets,
  'магазин, пікапи і загальні гаджети вимкнені', JSON.stringify(started));
check(started.used === true && started.usedAgain === false && started.shield0 === 0 && started.shieldAfterUse === 1000 && Math.ceil(started.gadgetCd) === 45,
  'є тільки режимний щит 1000 HP з 45с cooldown', JSON.stringify(started));
check(Object.values(started.buffs).every((n) => n === 0) && !started.pet, 'бафи і pet не вмикаються', JSON.stringify(started));
const shieldTick = await page.evaluate(() => {
  const g = window.__game;
  const before = g.level.gadgets.cd;
  g._step(0.2, true);
  return {
    before,
    after: g.level.gadgets.cd,
    active: g.level.gadgets.active,
    chip: document.getElementById('gadget-chips')?.textContent || '',
  };
});
check(shieldTick.active === 'shield' && /🛡/.test(shieldTick.chip),
  'режимний щит видно в HUD як єдиний гаджет', JSON.stringify(shieldTick));
check(shieldTick.after <= shieldTick.before - 0.19,
  'cooldown режимного щита тікає в noGadgets-режимі', JSON.stringify(shieldTick));

console.log('▸ Перевірка реальної дуелі: щит, гармата, меч');
const mechanics = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const z = g.level.zombies.list.find((x) => x.pvp);
  const ground = (x, zz) => g.level.world.groundH(x, zz);
  const place = (dist) => {
    p.pos.set(g.level.pvp.cx, ground(g.level.pvp.cx, g.level.pvp.cz + 6), g.level.pvp.cz + 6);
    p.yaw = 0;
    p.pitch = 0;
    z.x = p.pos.x;
    z.z = p.pos.z - dist;
    z.y = ground(z.x, z.z);
    z.rig.group.position.set(z.x, z.y, z.z);
    z.state = 'chase';
    z.hp = z.maxHp = 3000;
  };
  z.damage(1000, null, false);
  const zombieShieldBreak = { hp: z.shieldHp, has: !!z.shieldObj, recast: z.shieldRecastCd };

  place(8);
  p.cur = 'cannon';
  p._applyView();
  p.ammo.cannon.mag = 1;
  p.shootCd = 0;
  p.reloading = 0;
  p._shoot();
  const cannon = { damage: 3000 - z.hp, cd: Math.round(p.shootCd * 10) / 10, mag: p.ammo.cannon.mag };

  place(2);
  p.cur = 'sword';
  p._applyView();
  p.ammo.sword.mag = p.weapon.mag;
  p.shootCd = 0;
  p.reloading = 0;
  p._shoot();
  const sword = { damage: 3000 - z.hp, mag: String(p.ammo.sword.mag) };

  let flash = 0, shell = 0, shot = 0;
  const oldFlash = g.level.effects.muzzleFlash;
  const oldShell = g.level.effects.ejectShell;
  const oldShot = g.level.audio.shot;
  g.level.effects.muzzleFlash = () => { flash++; };
  g.level.effects.ejectShell = () => { shell++; };
  g.level.audio.shot = () => { shot++; };
  place(2);
  p.cur = 'sword';
  p._applyView();
  p.ammo.sword.mag = p.weapon.mag;
  p.shootCd = 0;
  p.reloading = 0;
  p._shoot();
  g.level.effects.muzzleFlash = oldFlash;
  g.level.effects.ejectShell = oldShell;
  g.level.audio.shot = oldShot;
  const swordFx = { flash, shell, shot };

  p.health = p.maxHealth;
  p.armor = 0;
  p.gadgetShield = 1000;
  p.takeDamage(350, p.pos.x, p.pos.z - 8);
  const playerShield = { hp: p.health, shield: p.gadgetShield };
  return { zombieShieldBreak, cannon, sword, swordFx, playerShield };
});
check(mechanics.zombieShieldBreak.hp === 0 && !mechanics.zombieShieldBreak.has && mechanics.zombieShieldBreak.recast === 45,
  'щит зомбі ламається і перезаряджається 45с', JSON.stringify(mechanics));
check(mechanics.cannon.damage === 350 && mechanics.cannon.cd === 2.5 && mechanics.cannon.mag === 0,
  'гармата реально наносить 350 і йде на 2.5с перезарядку', JSON.stringify(mechanics));
check(mechanics.sword.damage === 300 && mechanics.sword.mag === 'Infinity',
  'меч реально бʼє зблизька на 300 і не витрачає патрони', JSON.stringify(mechanics));
check(mechanics.swordFx.flash === 0 && mechanics.swordFx.shell === 0 && mechanics.swordFx.shot === 0,
  'меч не показує і не звучить як постріл', JSON.stringify(mechanics.swordFx));
check(mechanics.playerShield.hp === 2500 && mechanics.playerShield.shield === 650,
  'щит гравця поглинає шкоду від гармати', JSON.stringify(mechanics));

console.log('▸ Звичайне ПВП не змінене');
await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  await g.test.startPvp();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.pvp, null, { timeout: 30000 });
const normal = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const z = g.level.zombies.list.find((x) => x.pvp);
  return { roomSize: g.level.pvp.roomSize, hp: p.maxHealth, weapons: [...p.weapons], cur: p.cur, zombieHp: z && z.maxHp };
});
check(normal.roomSize === 30 && normal.hp === 50 && normal.weapons.length === 1 && normal.weapons[0] === 'staff'
  && normal.cur === 'staff' && normal.zombieHp === 250,
  'нормальне ПВП лишилось 30x30, 50 HP, посох, зомбі 250 HP', JSON.stringify(normal));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 OVERLOADED PVP OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
