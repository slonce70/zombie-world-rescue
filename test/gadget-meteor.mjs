// ☄️ Гаджет «Метеорит»: викликає метеорит на НАЙБЛИЖЧОГО зомбі — 250 шкоди згори
// (обходить фронтальний щит і нагрудник). Перезарядка 45с.
import { chromium } from 'playwright';
const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Гаджет «Метеорит» (нагорода Зоряного шляху 33)');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const { PASS_REWARDS, PASS_MAX_LEVEL } = await import('/src/progress.js');
  const G = GADGETS.meteor; const r33 = PASS_REWARDS[33];
  const hyper = SHOP_ITEMS.find((i) => i.id === 'meteor-hyper');
  return {
    meta: G && { cd: G.cd, icon: G.icon },
    inShop: SHOP_ITEMS.some((i) => i.id === 'meteor'),
    hyper: hyper && { price: hyper.price, max: hyper.max, hyper: hyper.hyper, needsGadget: hyper.needsGadget },
    cap: PASS_MAX_LEVEL,
    reward33: r33 && { type: r33.type, id: r33.id },
  };
});
check(meta.meta && meta.meta.cd === 45 && meta.meta.icon === '☄️', 'мета гаджета: 45с cd, ☄️', JSON.stringify(meta.meta));
check(meta.cap === 33, 'Зоряний шлях продовжено до 33', String(meta.cap));
check(!meta.inShop, 'метеорит НЕ продається в магазині (лише нагорода шляху)');
check(meta.hyper && meta.hyper.price === 5000 && meta.hyper.max === 1 && meta.hyper.hyper === 'meteor' && meta.hyper.needsGadget === 'meteor',
  'гіперзаряд метеорита коштує 5000 і потребує базовий метеорит', JSON.stringify(meta.hyper));
check(meta.reward33 && meta.reward33.type === 'gadget' && meta.reward33.id === 'meteor', 'нагорода рівня 33 = гаджет «Метеорит»', JSON.stringify(meta.reward33));

// 🎖️ розблокування: рівень 33 видає метеорит БЕЗКОШТОВНО (як лазер@28)
const grant = await page.evaluate(() => {
  const g = window.__game;
  g.save.xp = 0;
  const before = g.save.gadgetsOwned.includes('meteor');
  g.test.addXp(30000); // > сумарного XP до рівня 33
  return { before, level: g.progress.level, owned: g.save.gadgetsOwned.includes('meteor') };
});
check(grant.level >= 33, `досягнуто рівня 33 (${grant.level})`);
check(!grant.before && grant.owned, 'рівень 33 ВИДАВ гаджет «Метеорит» безкоштовно', JSON.stringify(grant));

const hyperBuy = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(12000);
  const before = g.save.coins;
  g.test.shopBuy('meteor-hyper');
  const afterFirst = g.save.coins;
  g.test.shopBuy('meteor-hyper');
  const afterSecond = g.save.coins;
  return {
    hypers: g.save.gadgetHypers || [],
    firstCost: before - afterFirst,
    secondCost: afterFirst - afterSecond,
  };
});
check(hyperBuy.hypers.includes('meteor') && hyperBuy.firstCost === 5000 && hyperBuy.secondCost === 0,
  'гіперзаряд метеорита купується один раз і зберігається', JSON.stringify(hyperBuy));

await page.goto(`${BASE}/?test&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const persisted = await page.evaluate(() => (window.__game.save.gadgetHypers || []).includes('meteor'));
check(persisted, 'гіперзаряд метеорита лишається після перезавантаження сторінки');

// === площа 7×7: 250 усім у зоні, поза зоною — нікому (детерміновано, в ізольованій точці) ===
const aoe = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  const cx = p.pos.x + 40, cz = p.pos.z + 40; // подалі від орди — лише наші tank-и
  const mk = (dx, dz) => g.level.zombies.spawn('tank', cx + dx, cz + dz, {});
  const list = [mk(0, 0), mk(3.4, 0), mk(3.4, 3.4), mk(5, 0)]; // центр, край, кут (у зоні), 5м (поза)
  for (const z of list) { z.hp = z.maxHp = 1000; } // HP вгору, щоб пережили 250 і вимір був чистий
  const hp0 = list.map((z) => z.hp);
  g.level.gadgets._meteorAoE(cx, cz); // прямий удар по площі в точці (cx,cz)
  return { dmg: list.map((z, i) => hp0[i] - z.hp) };
});
check(aoe.dmg[0] === 250 && aoe.dmg[1] === 250 && aoe.dmg[2] === 250, 'усі троє в зоні 7×7 (центр/край/кут) отримали 250', JSON.stringify(aoe.dmg));
check(aoe.dmg[3] === 0, 'зомбі за межами 7×7 (5 м) НЕ постраждав', JSON.stringify(aoe.dmg));

// === обхід щита: удар згори ігнорує фронтальний щит (у зоні AoE) ===
const shield = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  const cx = p.pos.x - 40, cz = p.pos.z - 40;
  const sh = g.level.zombies.spawn('shield', cx, cz, {});
  const shieldHp0 = sh.shieldHp, bodyHp0 = sh.hp;
  g.level.gadgets._meteorAoE(cx, cz);
  return { shieldHp0, shieldHpAfter: sh.shieldHp, bodyDmg: bodyHp0 - sh.hp, dead: sh.state === 'dead' };
});
check(shield.shieldHpAfter === shield.shieldHp0, 'щит НЕ постраждав — метеорит б\'є згори, повз фронтальний щит', JSON.stringify(shield));
check(shield.bodyDmg === 250, 'тіло щитоносця отримало 250 (обхід щита)', JSON.stringify(shield));

// === візуал: метеорит реально вилітає й приземляється ===
const fly = await page.evaluate(() => {
  const g = window.__game;
  g.test.unlockGadget('meteor'); g.test.gadgetCdReset();
  g.level.zombies.spawn('tank', g.level.player.pos.x + 2, g.level.player.pos.z + 1, {});
  g.test.useGadget();
  const flying = g.level.effects._meteors.length;
  for (let i = 0; i < 12; i++) g.level.effects.update(0.15); // >1.3с — приземлення
  return { flying, landed: g.level.effects._meteors.length };
});
check(fly.flying >= 1, 'метеорит вилетів (у польоті)', JSON.stringify(fly));
check(fly.landed === 0, 'метеорит приземлився (зник із польоту)', JSON.stringify(fly));

console.log('▸ Анти-робот: пріоритет цілі + 500 шкоди');
const rob = await page.evaluate(() => {
  const Z = window.__game.level.zombies; const p = window.__game.level.player;
  const px = p.pos.x + 60, pz = p.pos.z + 60; // ізольована точка, подалі від орди
  Z.spawn('walker', px + 4, pz, {});          // дрібний — БЛИЖЧЕ
  const robot = Z.spawn('robot', px + 20, pz, {}); // робот — далі, але ≤50м
  const target = window.__game.level.gadgets._meteorTarget(px, pz);
  const targetsRobot = target === robot;
  const hp0 = robot.hp, sh0 = robot.shieldHp;
  window.__game.level.gadgets._meteorAoE(robot.x, robot.z); // пряма AoE по роботу
  return { targetsRobot, robotDmg: hp0 - robot.hp, shieldKept: robot.shieldHp === sh0 };
});
check(rob.targetsRobot, 'метеорит ПРІОРИТЕТНО цілиться в робота (а не в дрібного ближчого)', JSON.stringify(rob));
check(rob.robotDmg === 500, 'роботу метеорит завдає 500 (обходить щит згори)', JSON.stringify(rob));
check(rob.shieldKept, 'щит робота не зачеплено (удар згори повз нього)', JSON.stringify(rob));

const fire = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  const cx = p.pos.x + 80, cz = p.pos.z + 80;
  for (const zb of g.level.zombies.list) zb.state = 'dead';
  const near = g.level.zombies.spawn('tank', cx, cz, {});
  const far = g.level.zombies.spawn('tank', cx + 5, cz, {});
  near.hp = near.maxHp = 1000;
  far.hp = far.maxHp = 1000;
  g.level.gadgets._meteorFires = [];
  g.level.gadgets._meteorAoE(cx, cz, false);
  const baseFires = g.level.gadgets._meteorFires.length;
  near.hp = far.hp = 1000;
  g.level.gadgets._meteorAoE(cx, cz, true);
  const hyperFires = g.level.gadgets._meteorFires.length;
  near.hp = far.hp = 1000;
  if (typeof g.level.gadgets._updateMeteorFires !== 'function') {
    return { baseFires, hyperFires, after2s: { nearDmg: 0, farDmg: 0, fires: hyperFires }, expired: hyperFires };
  }
  for (let i = 0; i < 4; i++) g.level.gadgets._updateMeteorFires(0.5);
  const after2s = { nearDmg: 1000 - near.hp, farDmg: 1000 - far.hp, fires: g.level.gadgets._meteorFires.length };
  for (let i = 0; i < 10; i++) g.level.gadgets._updateMeteorFires(0.5);
  return { baseFires, hyperFires, after2s, expired: g.level.gadgets._meteorFires.length };
});
check(fire.baseFires === 0, 'звичайний метеорит не лишає вогонь', JSON.stringify(fire));
check(fire.hyperFires === 1, 'гіпер-метеорит лишає вогонь на місці падіння', JSON.stringify(fire));
check(fire.after2s.nearDmg === 20 && fire.after2s.farDmg === 0,
  'вогонь гіпер-метеорита наносить 5 HP кожні 0.5с у зоні', JSON.stringify(fire.after2s));
check(fire.expired === 0, 'вогонь згасає і прибирається', JSON.stringify(fire));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 МЕТЕОРИТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
