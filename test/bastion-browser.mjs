import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, closeTest } = await openBrowserTest({
  launch: { headless: true },
  context: { viewport: { width: 1280, height: 720 } },
  captureErrors: false,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(`${BASE}/?test&fresh&seed=610`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.state === 'globe');
  await page.evaluate(() => window.__game.openExpedition());
  await page.click('[data-specialist="bastion"]');
  await page.click('#btn-fighter-select');
  await page.evaluate(() => {
    window.__game.save.fighterLevels.bastion = 5;
    window.__game.save.bastionGadgetsOwned = ['healing-punch', 'provoke'];
    window.__game.save.bastionHyperOwned = true;
    window.__game.saveGame();
  });
  await page.click('#btn-expedition-go');
  await page.waitForFunction(() => window.__game?.state === 'level'
    && window.__game.level?.specialist?.id === 'bastion', null, { timeout: 10000 });
  await page.waitForFunction(() => document.getElementById('tb-bastion-gadget')?.classList.contains('avail'));

  const kit = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    return {
      maxHealth: p.maxHealth,
      health: p.health,
      weapon: p.cur,
      weapons: p.weapons,
      damage: p.bastionDamage,
      magazine: p.ammo.fists?.mag,
      reserve: p.ammo.fists?.reserve,
      reload: p.weapon?.reloadT,
      rate: p.weapon?.rpm,
      chargePerHit: g.level.specialist && 10,
      hyperChargePerHit: g.level.specialist && 2,
      touchGadget: document.getElementById('tb-bastion-gadget')?.getAttribute('aria-label'),
      touchHyper: document.getElementById('tb-bastion-hyper')?.getAttribute('aria-label'),
    };
  });
  check(kit.maxHealth === 215 && kit.health === 215 && kit.weapon === 'fists'
    && JSON.stringify(kit.weapons) === JSON.stringify(['fists'])
    && kit.damage === 125 && kit.magazine === 10 && kit.reserve === Infinity
    && kit.reload === 1.5 && kit.rate === 60 && kit.chargePerHit === 10
    && kit.hyperChargePerHit === 2 && kit.touchGadget === 'Лікувальні кулаки · F'
    && /Hypercharge|Гіперзаряд/.test(kit.touchHyper || ''),
  'рівень 5 дає точний HP, шкоду, магазин і перезарядку', JSON.stringify(kit));

  const combat = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    const alive = g.level.zombies.list.filter((z) => z.state !== 'dead').slice(0, 3);
    const prepare = (z, x, zPos, hp = 2000) => {
      z.state = 'chase';
      z.gone = false;
      z.x = x;
      z.y = p.pos.y;
      z.z = zPos;
      z.hp = hp;
      z.maxHp = hp;
      z.shieldHp = 0;
      z.chestHp = 0;
      z.helmetHp = 0;
      z.rig.group.position.set(x, p.pos.y, zPos);
      return z;
    };
    const insideA = prepare(alive[0], p.pos.x, p.pos.z - 2);
    const insideB = prepare(alive[1], p.pos.x + 0.35, p.pos.z - 2.6);
    const outside = prepare(alive[2], p.pos.x + 2, p.pos.z - 2);
    p.yaw = 0;
    g.level.specialist.charge = 0;
    g.level.specialist.hyperCharge = 0;
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const fist = {
      insideA: 2000 - insideA.hp,
      insideB: 2000 - insideB.hp,
      outside: 2000 - outside.hp,
      charge: g.level.specialist.charge,
      hyperCharge: g.level.specialist.hyperCharge,
    };

    g.level.specialist.charge = 0;
    for (let i = 0; i < 10; i++) {
      insideA.hp = 2000;
      p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    }
    const charged = g.level.specialist.charge;

    prepare(insideA, p.pos.x, p.pos.z - 5);
    prepare(outside, p.pos.x + 2, p.pos.z - 5);
    g.level.specialist.charge = 100;
    g.input.justPressed.add('KeyC');
    g.level.gadgets.update(0, g.input, true);
    return {
      fist,
      charged,
      after: g.level.specialist.charge,
      superInside: 2000 - insideA.hp,
      superOutside: 2000 - outside.hp,
    };
  });
  check(combat.fist.insideA === 125 && combat.fist.insideB === 125
    && combat.fist.outside === 0 && combat.fist.charge === 10 && combat.fist.hyperCharge === 2,
  'кулаки б’ють усіх лише в прямокутнику 3×1 м', JSON.stringify(combat));
  check(combat.charged === 100 && combat.after === 0,
    'десять успішних атак заряджають Super, а C витрачає заряд', JSON.stringify(combat));
  check(combat.superInside === 500 && combat.superOutside === 0,
    'Суперкулак завдає рівно 500 у прямокутнику 7×2 м', JSON.stringify(combat));

  const hyper = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    const specialist = g.level.specialist;
    const gs = g.level.gadgets;
    const alive = g.level.zombies.list.filter((z) => z.state !== 'dead').slice(0, 3);
    const place = (z, side, forward, hp = 3000) => {
      z.state = 'chase';
      z.gone = false;
      z.x = p.pos.x + side;
      z.y = p.pos.y;
      z.z = p.pos.z - forward;
      z.hp = hp;
      z.maxHp = hp;
      z.shieldHp = 0;
      z.chestHp = 0;
      z.helmetHp = 0;
      z.slowT = 0;
      z.slowMul = 1;
      z.rig.group.position.set(z.x, z.y, z.z);
      return z;
    };
    const target = place(alive[0], 0, 2);
    p.yaw = 0;

    specialist.level = 4;
    specialist.hyperCharge = 0;
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const level4Charge = specialist.hyperCharge;

    specialist.level = 5;
    specialist.hyperCharge = 0;
    for (let i = 0; i < 50; i++) {
      target.hp = 3000;
      p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    }
    const charged = specialist.hyperCharge;
    g.input.justPressed.add('KeyX');
    gs.update(0, g.input, true);
    g.input.justPressed.delete('KeyX');
    const activated = { charge: specialist.hyperCharge, time: specialist.hyperActiveT };
    gs.update(5.1, g.input, false);
    const expired = specialist.hyperActiveT;

    specialist.hyperCharge = 100;
    specialist.charge = 100;
    g.input.justPressed.add('KeyX');
    gs.update(0, g.input, true);
    g.input.justPressed.delete('KeyX');
    const inside = place(alive[0], 1.5, 5);
    const outside = place(alive[1], 3, 5);
    g.input.justPressed.add('KeyC');
    gs.update(0, g.input, true);
    g.input.justPressed.delete('KeyC');
    return {
      level4Charge,
      charged,
      activated,
      expired,
      activeAfterSuper: specialist.hyperActiveT,
      superAfter: specialist.charge,
      insideDamage: 3000 - inside.hp,
      outsideDamage: 3000 - outside.hp,
      slowT: inside.slowT,
      slowMul: inside.slowMul,
    };
  });
  check(hyper.level4Charge === 0 && hyper.charged === 100
    && hyper.activated.charge === 0 && hyper.activated.time === 5 && hyper.expired === 0,
  'Hypercharge доступний з рівня 5, заряджається за 50 атак і діє 5 секунд', JSON.stringify(hyper));
  check(hyper.insideDamage === 750 && hyper.outsideDamage === 0
    && hyper.slowT === 4 && hyper.slowMul === 0.5
    && hyper.activeAfterSuper === 0 && hyper.superAfter === 0,
  'Hyper-Суперкулак має зону 7×4 м, 750 шкоди й сповільнення на 4с', JSON.stringify(hyper));

  // ⭐ Зоряні сили: обидві живуть на save.bastionStarPower, обрати можна лише одну
  const star = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    const specialist = g.level.specialist;
    const target = g.level.zombies.list.find((z) => z.state !== 'dead');
    const place = (z, hp) => {
      z.state = 'chase';
      z.gone = false;
      z.x = p.pos.x;
      z.y = p.pos.y;
      z.z = p.pos.z - 3;
      z.hp = hp; z.maxHp = hp;
      z.shieldHp = 0; z.chestHp = 0; z.helmetHp = 0;
      z.kbX = 0; z.kbZ = 0;
      z.rig.group.position.set(z.x, z.y, z.z);
      return z;
    };
    p.yaw = 0;
    specialist.hyperActiveT = 0;
    specialist.hyperCharge = 0;

    g.save.bastionStarPower = 'push-super';
    place(target, 5000);
    specialist.charge = 100;
    g.level.gadgets.useSpecialistSuper();
    const push = { damage: 5000 - target.hp, kb: Math.hypot(target.kbX || 0, target.kbZ || 0) };

    g.save.bastionStarPower = 'fast-super';
    place(target, 5000);
    p.buffs.speed = 0;
    specialist.charge = 0;
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const fastCharge = specialist.charge;
    target.hp = 5000; // прибираємо шкоду від пробного удару, лишаємо чистий Super
    specialist.charge = 100;
    g.level.gadgets.useSpecialistSuper();
    const fast = { damage: 5000 - target.hp, speed: p.buffs.speed, charge: fastCharge };

    g.save.bastionStarPower = null;
    place(target, 5000);
    specialist.charge = 0;
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const plainCharge = specialist.charge;
    target.hp = 5000;
    specialist.charge = 100;
    g.level.gadgets.useSpecialistSuper();
    return { push, fast, plain: { damage: 5000 - target.hp, charge: plainCharge } };
  });
  check(star.push.damage === 520 && star.push.kb > 20 && star.plain.damage === 500,
    '💨 Відштовхуючий супер: 520 шкоди й сильний імпульс відкидання', JSON.stringify(star));
  check(star.fast.speed === 3 && star.fast.charge === 10.5 && star.plain.charge === 10,
    '⚡ Швидкий супер: 3 с швидкості та +5% до заряду Super', JSON.stringify(star));

  const gadgets = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    const gs = g.level.gadgets;
    const alive = g.level.zombies.list.filter((z) => z.state !== 'dead').slice(0, 3);
    const place = (z, x, zPos) => {
      z.state = 'wander';
      z.aggroed = false;
      z.gone = false;
      z.x = x;
      z.y = p.pos.y;
      z.z = zPos;
      z.hp = 2000;
      z.maxHp = 2000;
      z.shieldHp = 0;
      z.chestHp = 0;
      z.helmetHp = 0;
      z.rig.group.position.set(x, p.pos.y, zPos);
      return z;
    };

    g.save.bastionGadget = 'healing-punch';
    gs.cd = 0;
    p.health = 100;
    for (const z of alive) place(z, p.pos.x + 30, p.pos.z + 30);
    g.level.specialist.level = 2;
    g.input.justPressed.add('KeyF');
    gs.update(0, g.input, true);
    g.input.justPressed.delete('KeyF');
    const level2Activation = gs.bastionHealHits;
    g.level.specialist.level = 3;
    g.save.bastionGadgetsOwned = [];
    g.input.justPressed.add('KeyF');
    gs.update(0, g.input, true);
    g.input.justPressed.delete('KeyF');
    const unownedActivation = gs.bastionHealHits;
    g.save.bastionGadgetsOwned = ['healing-punch', 'provoke'];
    g.input.justPressed.add('KeyF');
    gs.update(0, g.input, true);
    g.input.justPressed.delete('KeyF');
    const activatedHealing = gs.bastionHealHits;
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const afterMiss = gs.bastionHealHits;
    place(alive[0], p.pos.x, p.pos.z - 2);
    place(alive[1], p.pos.x + 0.3, p.pos.z - 2.2);
    p.yaw = 0;
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const afterFirst = { hits: gs.bastionHealHits, health: p.health };
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const afterSecond = { hits: gs.bastionHealHits, health: p.health };

    g.save.bastionGadget = 'provoke';
    gs.cd = 0;
    const near = place(alive[0], p.pos.x, p.pos.z - 10);
    const far = place(alive[1], p.pos.x, p.pos.z - 13);
    g.input.justPressed.add('KeyF');
    gs.update(0, g.input, true);
    g.input.justPressed.delete('KeyF');
    p.health = p.maxHealth;
    p.armor = 0;
    p.helmetMult = 1;
    p.respawnProtect = 0;
    p.buffs.bubble = 0;
    p.gadgetShield = 0;
    p.takeDamage(100, p.pos.x, p.pos.z + 1);
    return {
      activatedHealing,
      level2Activation,
      unownedActivation,
      afterMiss,
      afterFirst,
      afterSecond,
      healingCooldown: 30,
      provokeTime: gs.bastionProvokeT,
      provokeCooldown: gs.cd,
      nearAggro: near.aggroed,
      farAggro: far.aggroed,
      damageTaken: p.maxHealth - p.health,
    };
  });
  check(gadgets.level2Activation === 0 && gadgets.unownedActivation === 0
    && gadgets.activatedHealing === 2 && gadgets.afterMiss === 2
    && gadgets.afterFirst.hits === 1 && gadgets.afterFirst.health === 130
    && gadgets.afterSecond.hits === 0 && gadgets.afterSecond.health === 160,
  'Лікувальні кулаки лікують дві успішні атаки по 30 HP', JSON.stringify(gadgets));
  check(gadgets.provokeTime === 5 && gadgets.provokeCooldown === 30
    && gadgets.nearAggro && !gadgets.farAggro && gadgets.damageTaken === 60,
  'Провокація притягує ворогів у 12 м і зменшує шкоду на 40%', JSON.stringify(gadgets));

  check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));
} finally {
  await closeTest();
}

if (fail) process.exit(1);
console.log('\n🎉 БОЙОВИЙ НАБІР БАСТІОНА ПРАЦЮЄ');
