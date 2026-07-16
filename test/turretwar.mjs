// 🗼 «Оборона турелі» (дизайн Влада): анлок 12 країн, кімната 200×50, дві турелі
// по 500 HP, ворожий робот 1000 HP на старті, союзник на 30с, хвилі 5 зомбі/10с,
// турелі б'ють 50 по площі 50×50 раз/с, єдина зброя — молот 35/1с.
import { openBrowserTest } from './_browser.mjs';

let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, captureConsole: false, pageErrorPrefix: '' });

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

// анлок-гейт: до 12 країн — замок і відмова
const lock = await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
  g.renderSoloMenu();
  const card = document.querySelector('.solo-mode[data-mode="turretwar"]');
  const started = g.startTurretWar();
  return { exists: !!card, locked: card && card.classList.contains('locked'), started: started === undefined, state: g.state };
});
check(lock.exists && lock.locked && lock.state === 'globe', 'до 12 країн режим заблоковано', JSON.stringify(lock));

await page.evaluate(async () => {
  const g = window.__game;
  const { CAMPAIGN_ORDER } = await import('/src/countries.js');
  for (const id of CAMPAIGN_ORDER) g.save.liberated[id] = true;
  g.save.xp = 999999; // за стелею пасса — XP не дає монетних нагород
  g.saveGame();
  g.startTurretWar();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.turretwar, null, { timeout: 60000 });

const shape = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  const robot = g.level.zombies.list.find((z) => z.type === 'robot' && z.turretwar);
  return {
    modeId: g.level.modeId,
    noShop: g.level.noShop,
    noGadgets: g.level.noGadgets,
    noPickups: g.level.noPickups,
    weapons: [...g.level.player.weapons],
    cur: g.level.player.cur,
    playerHp: tw.playerHp,
    enemyHp: tw.enemyHp,
    robot: robot && { hp: robot.maxHp, dmg: robot.stats.dmg, shieldHp: robot.shieldHp || 0, shieldObj: !!robot.shieldObj },
    roomW: tw.roomW,
    roomD: tw.roomD,
    nearOwnTurret: Math.hypot(g.level.player.pos.x - tw.px, g.level.player.pos.z - tw.cz) < 10,
  };
});
check(shape.modeId === 'turretwar' && shape.noShop && shape.noGadgets && shape.noPickups, 'правила режиму: без магазину/гаджетів/пікапів', JSON.stringify({ modeId: shape.modeId }));
check(shape.weapons.length === 1 && shape.cur === 'hammer', 'єдина зброя — молот', JSON.stringify(shape.weapons));
check(shape.playerHp === 500 && shape.enemyHp === 500 && shape.roomW === 200 && shape.roomD === 50, 'кімната 200×50, турелі по 500 HP', JSON.stringify({ w: shape.roomW, d: shape.roomD }));
check(shape.robot && shape.robot.hp === 1000 && shape.robot.dmg === 20, 'ворожий робот: 1000 HP, 20 шкоди', JSON.stringify(shape.robot));
check(shape.robot && shape.robot.shieldHp === 0 && !shape.robot.shieldObj, 'зомбі-робот у режимі без щита', JSON.stringify(shape.robot));
check(shape.nearOwnTurret, 'гравця телепортовано до своєї турелі');

// молот: 35 шкоди, 1 удар/с
const hammer = await page.evaluate(async () => {
  const { WEAPONS } = await import('/src/player.js');
  return { dmg: WEAPONS.hammer.dmg, rpm: WEAPONS.hammer.rpm, melee: !!WEAPONS.hammer.melee };
});
check(hammer.dmg === 35 && hammer.rpm === 60 && hammer.melee, 'молот: 35 шкоди, 1 удар/с, ближній бій', JSON.stringify(hammer));

const hammerSwingFx = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  let flash = 0, shell = 0, shot = 0;
  const oldFlash = g.level.effects.muzzleFlash;
  const oldShell = g.level.effects.ejectShell;
  const oldShot = g.level.audio.shot;
  g.level.effects.muzzleFlash = () => { flash++; };
  g.level.effects.ejectShell = () => { shell++; };
  g.level.audio.shot = () => { shot++; };
  p.cur = 'hammer';
  p._applyView();
  p.ammo.hammer.mag = p.weapon.mag;
  p.shootCd = 0;
  p.reloading = 0;
  p._shoot();
  g.level.effects.muzzleFlash = oldFlash;
  g.level.effects.ejectShell = oldShell;
  g.level.audio.shot = oldShot;
  return { flash, shell, shot };
});
check(hammerSwingFx.flash === 0 && hammerSwingFx.shell === 0 && hammerSwingFx.shot === 0,
  'молот не показує і не звучить як постріл', JSON.stringify(hammerSwingFx));

// хвиля: кожні 10с +5 зомбі біля зомбі-турелі
const wave = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  const alive = () => g.level.zombies.list.filter((z) => z.turretwar && z.state !== 'dead').length;
  const n0 = alive();
  tw.waveT = 0;
  tw.update(0.016);
  return { n0, n1: alive() };
});
check(wave.n1 - wave.n0 === 5, 'хвиля дає 5 зомбі', JSON.stringify(wave));

// турель гравця б'є 50 по своїй площі 50×50
const pFire = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  const z = g.level.zombies.list.find((zz) => zz.turretwar && zz.type !== 'robot' && zz.state !== 'dead');
  z.x = tw.px + 5; z.z = tw.cz;
  z.maxHp = 200; z.hp = 200;
  tw.fireT = 0;
  tw.update(0.016);
  return { hp: z.hp };
});
check(pFire.hp === 150, 'турель гравця зняла 50 у своїй зоні', JSON.stringify(pFire));

// зомбі-турель б'є гравця у своїй зоні
const eFire = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  const p = g.level.player;
  const hp0 = p.health;
  p.pos.x = tw.ex - 5; p.pos.z = tw.cz;
  tw.fireT = 0;
  tw.update(0.016);
  return { hp0, hp: p.health };
});
check(eFire.hp0 - eFire.hp === 50, 'зомбі-турель б\'є гравця на 50 у своїй зоні', JSON.stringify(eFire));

// молот по ворожій турелі: удар поруч знімає 35
const hammerHit = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  const p = g.level.player;
  p.pos.x = tw.ex - 3; p.pos.z = tw.cz;
  const e0 = tw.enemyHp;
  tw._lastCd = 0;
  p.shootCd = 1; // «щойно вдарив»
  tw.fireT = 99; // без пострілу турелі цим тіком
  tw.update(0.016);
  return { d: e0 - tw.enemyHp };
});
check(hammerHit.d === 35, 'удар молота знімає 35 з ворожої турелі', JSON.stringify(hammerHit));

// робот-союзник: з 30с, йде до ворожої турелі і довбе її по 20
const ally = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  g.test.god();
  tw.time = 30.01;
  tw.update(0.016);
  const spawned = !!tw.ally;
  tw.ally.x = tw.ex - 2; tw.ally.z = tw.cz;
  tw.ally.hitT = 0;
  const e0 = tw.enemyHp;
  tw.fireT = 99;
  tw.update(0.016);
  return { spawned, d: e0 - tw.enemyHp, allyHp: tw.ally.hp };
});
check(ally.spawned && ally.d === 20 && ally.allyHp === 1000, 'союзник 1000 HP прибув на 30с і б\'є турель по 20', JSON.stringify(ally));

const allyTarget = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  const z = g.level.zombies.list.find((zz) => zz.turretwar && zz.type !== 'robot' && zz.state !== 'dead');
  tw.ally.x = tw.px + 20;
  tw.ally.z = tw.cz;
  tw.ally.hp = 1000;
  z.x = tw.ally.x + 0.8;
  z.z = tw.ally.z;
  z.y = tw.floorY;
  z.defenseHitCd = 0;
  const hp0 = tw.ally.hp;
  tw.fireT = 99;
  tw.update(0.016);
  return { hp0, hp: tw.ally.hp };
});
check(allyTarget.hp < allyTarget.hp0, 'зомбі атакують робота-союзника, якщо він поруч', JSON.stringify(allyTarget));

// перемога: ворожа турель падає → екран, монети, рекорд
const win = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  const coins0 = g.save.coins;
  g.level.stats.time = 75;
  tw.enemyHp = 1;
  tw.fireT = 99;
  tw._lastCd = 99; // без випадкового удару
  tw.ally.x = tw.ex - 2;
  tw.ally.z = tw.cz;
  tw.ally.hitT = 0;
  tw.update(0.016);
  return {
    over: tw.over,
    completed: tw.completed,
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
    title: document.querySelector('#overlay-arena-end h1').textContent,
    dCoins: g.save.coins - coins0,
    wins: g.save.modeWins.turretwar,
    best: g.save.modeBest.turretwar,
  };
});
check(win.over && win.completed && win.shown && win.title.includes('ЗНЕСЕНО'), 'перемога показує екран фіналу', JSON.stringify({ title: win.title }));
check(win.dCoins === 150 && win.wins === 1 && win.best === 75000, 'нагорода 150 монет, перемога і рекорд записані', JSON.stringify({ d: win.dCoins, w: win.wins, b: win.best }));

// поразка: своя турель падає
const lose = await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  await g.startTurretWar();
  return true;
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.turretwar && !window.__game.level.turretwar.over, null, { timeout: 60000 });
const loseRes = await page.evaluate(() => {
  const g = window.__game;
  const tw = g.level.turretwar;
  tw.playerHp = 0;
  tw.fireT = 99;
  tw.update(0.016);
  return {
    over: tw.over,
    completed: tw.completed,
    title: document.querySelector('#overlay-arena-end h1').textContent,
  };
});
check(loseRes.over && !loseRes.completed && loseRes.title.includes('ЗРУЙНОВАНО'), 'падіння своєї турелі — поразка', JSON.stringify(loseRes));

const playerDeath = await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  await g.startTurretWar();
  const tw = g.level.turretwar;
  tw.playerHp = 500;
  g.level.player.health = 0;
  g._onPlayerDied();
  return {
    over: tw.over,
    completed: tw.completed,
    playerHp: tw.playerHp,
    title: document.querySelector('#overlay-arena-end h1').textContent,
  };
});
check(playerDeath.over && !playerDeath.completed && playerDeath.playerHp > 0 && !playerDeath.title.includes('ЗРУЙНОВАНО'),
  'смерть гравця показує окрему причину, не падіння турелі', JSON.stringify(playerDeath));

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 TURRETWAR OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail ? 1 : 0);
