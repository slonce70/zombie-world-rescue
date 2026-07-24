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
      chargePerHit: g.level.specialist && 20,
      touchGadget: document.getElementById('tb-bastion-gadget')?.getAttribute('aria-label'),
    };
  });
  check(kit.maxHealth === 215 && kit.health === 215 && kit.weapon === 'fists'
    && JSON.stringify(kit.weapons) === JSON.stringify(['fists'])
    && kit.damage === 125 && kit.magazine === 10 && kit.reserve === Infinity
    && kit.reload === 1.5 && kit.rate === 60 && kit.chargePerHit === 20
    && kit.touchGadget === 'Лікувальні кулаки · F',
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
    p._resolveMeleeSwing({ weaponId: 'fists', dmgMult: 1 });
    const fist = {
      insideA: 2000 - insideA.hp,
      insideB: 2000 - insideB.hp,
      outside: 2000 - outside.hp,
      charge: g.level.specialist.charge,
    };

    g.level.specialist.charge = 0;
    for (let i = 0; i < 5; i++) {
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
    && combat.fist.outside === 0 && combat.fist.charge === 20,
  'кулаки б’ють усіх лише в прямокутнику 3×1 м', JSON.stringify(combat));
  check(combat.charged === 100 && combat.after === 0,
    'п’ять успішних атак заряджають Super, а C витрачає заряд', JSON.stringify(combat));
  check(combat.superInside === 500 && combat.superOutside === 0,
    'Суперкулак завдає рівно 500 у прямокутнику 7×2 м', JSON.stringify(combat));

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
  check(gadgets.activatedHealing === 2 && gadgets.afterMiss === 2
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
