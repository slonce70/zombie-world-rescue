// 🎲 Прокачка 2.0: у соло-кампанії здана місія відкриває драфт; картки мають рідкість;
// вампіризм лікує за вбивство; екран перемоги показує збірку.
import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, captureConsole: false, pageErrorPrefix: '' });

await page.goto(`${BASE}/?test&fresh&seed=1&country=UKR&draft`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.level && !!window.__game.level.missions, null, { timeout: 30000 });
await page.waitForTimeout(400);

// runBuild існує в соло-кампанії
const hasBuild = await page.evaluate(() => !!window.__game.level.runBuild);
check(hasBuild, 'runBuild створюється у соло-кампанії');

// здана місія → драфт відкрився, картки мають рідкість
const draft = await page.evaluate(() => {
  const g = window.__game;
  g.level.bus.emit('missionDone', { title: 'test', reward: 0 });
  const cards = [...document.querySelectorAll('#draft-grid .draft-card')];
  return {
    open: g.draft.isOpen,
    cards: cards.length,
    rarities: cards.map((c) => [...c.classList].find((k) => k.startsWith('rarity-')) || ''),
  };
});
check(draft.open, 'здана місія відкрила драфт у кампанії');
check(draft.cards === 3, 'драфт пропонує 3 картки', draft.cards);
check(draft.rarities.every((r) => /^rarity-(common|rare|epic)$/.test(r)), 'кожна картка має клас рідкості', JSON.stringify(draft.rarities));

// пік застосовується і закриває драфт
const picked = await page.evaluate(() => {
  const g = window.__game;
  g.draft.pick(0);
  return { open: g.draft.isOpen, picks: g.level.runBuild.picks.length };
});
check(!picked.open && picked.picks === 1, 'картку взято, драфт закрито', JSON.stringify(picked));

// 🧛 +HP за вбивство: збільшує запас здоров'я, а не тільки лікує до старої стелі
const vamp = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.lifeSteal = 1;
  p.maxHealth = 100;
  p.health = 100;
  const z = g.test.spawnZombie('walker', p.pos.x + 3, p.pos.z);
  z.hp = 1;
  z.damage(999, null, false);
  return { health: p.health, maxHealth: p.maxHealth };
});
check(vamp.health === 101 && vamp.maxHealth === 101, '+1 HP за вбивство збільшує max/current HP', JSON.stringify(vamp));

// 🎇 бойова картка «Вибухове добивання» у РЕАЛЬНОМУ бою: беремо саме картку з пулу
// через runBuild.apply (як робить драфт), убиваємо зомбі — сусід має отримати вибух,
// а сам вибух не має детонувати далі (ланцюга нема).
const blast = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.runBuild.apply(g.test.draftCard('killblast'), p);
  const victim = g.test.spawnZombie('tank', p.pos.x + 10, p.pos.z);
  const neighbour = g.test.spawnZombie('tank', p.pos.x + 12, p.pos.z);
  const far = g.test.spawnZombie('tank', p.pos.x + 10, p.pos.z + 20);
  neighbour.x = victim.x + 2; neighbour.z = victim.z;
  const before = { neighbour: neighbour.hp, far: far.hp };
  victim.lastHitBy = 1;
  victim.damage(99999, null, false);
  return {
    field: p.killBlast,
    neighbourHurt: neighbour.hp < before.neighbour,
    farUntouched: far.hp === before.far,
    neighbourBlastTag: !!neighbour._blastT,
  };
});
check(blast.field === 55, 'картка «Вибухове добивання» поставила поле killBlast', blast.field);
check(blast.neighbourHurt, 'вибух від убитого зомбі зачепив сусіда в реальному бою');
check(blast.farUntouched, 'вибух не дістає далеких зомбі');
check(blast.neighbourBlastTag, 'зачеплений вибухом позначений — ланцюгової детонації не буде');

// ⛓️ натовп: ланцюгової детонації немає — гинуть лише сусіди в радіусі першого вибуху
const chain = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.killBlast = 165; // максимум картки — вибух гарантовано добиває поранених
  const line = [];
  for (let i = 0; i < 10; i++) {
    const z = g.test.spawnZombie('walker', p.pos.x - 40, p.pos.z + 40 + i * 3);
    z.hp = 1;
    line.push(z);
  }
  line[0].lastHitBy = 1;
  line[0].damage(99999, null, false);
  return {
    near: line[1].state === 'dead',
    survivors: line.slice(2).filter((z) => z.state !== 'dead').length,
  };
});
check(chain.near, 'вибух добиває поранених сусідів у натовпі');
check(chain.survivors === 8, 'ланцюгової реакції на весь натовп немає', chain.survivors);

// 🪃 «Рикошет»: сусід збоку дістає відскок, хоча куля летить не в нього
const ricochet = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  p.killBlast = 0; // щоб рикошетна смерть не змішалась із вибухом
  g.level.runBuild.apply(g.test.draftCard('ricochet'), p);
  const target = g.test.spawnZombie('tank', p.pos.x, p.pos.z - 8);
  const side = g.test.spawnZombie('tank', p.pos.x + 2.5, p.pos.z - 9);
  p.yaw = Math.atan2(-(target.x - p.pos.x), -(target.z - p.pos.z));
  p.pitch = 0;
  p.cur = 'pistol';
  const before = side.hp;
  for (let i = 0; i < 6; i++) { p.curAmmo.mag = 12; p._shoot(); }
  return { field: p.ricochet, sideHurt: side.hp < before, targetHurt: target.hp < target.maxHp };
});
check(ricochet.field === 0.5, 'картка «Рикошет» поставила поле ricochet', ricochet.field);
check(ricochet.targetHurt, 'постріл влучив у ціль');
check(ricochet.sideHurt, 'куля відскочила в сусіда збоку');

// 🪶 «Подвійний стрибок»: у повітрі Space дає ще один поштовх — і рівно стільки разів,
// скільки дала картка (сила наземного стрибка й гаджети стрибка не змінюються).
const dblJump = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const jumpPowerBefore = p.jumpPower;
  g.level.runBuild.apply(g.test.draftCard('doublejump'), p);
  // у повітрі: падаємо вниз, заряд повітряного стрибка є
  p.onGround = false;
  p.pos.y += 3;
  p.vel.set(0, -2, 0);
  p._airJumpsLeft = p.airJumps;
  g.input.justPressed.add('Space');
  p._updateGravityCollide(1 / 60, g.input, true);
  const afterFirst = p.vel.y;
  const leftAfterFirst = p._airJumpsLeft;
  // другий раз у тому самому стрибку — заряду вже немає
  p.vel.y = -2;
  g.input.justPressed.add('Space');
  p._updateGravityCollide(1 / 60, g.input, true);
  const afterSecond = p.vel.y;
  g.input.justPressed.delete('Space');
  return {
    field: p.airJumps,
    jumpPowerKept: p.jumpPower === jumpPowerBefore,
    afterFirst, leftAfterFirst, afterSecond, jumpPower: p.jumpPower,
  };
});
check(dblJump.field === 1, 'картка «Подвійний стрибок» поставила поле airJumps', dblJump.field);
check(dblJump.jumpPowerKept, 'сила наземного стрибка (кросівки/батут) не змінилась', dblJump.jumpPower);
check(dblJump.afterFirst > 0, 'у повітрі Space підкидає гравця вгору', dblJump.afterFirst);
check(dblJump.afterFirst < dblJump.jumpPower, 'повітряний стрибок слабший за наземний — на дах не закинути', dblJump.afterFirst);
check(dblJump.leftAfterFirst === 0, 'заряд повітряного стрибка витрачено');
check(dblJump.afterSecond < 0, 'третього стрибка без приземлення немає', dblJump.afterSecond);

// 🌋 «Вогняний слід»: пляма пече зомбі й НЕ пече гравця (ані пета/клона/загін — вони
// взагалі не в zombies.list, куди дивиться вогонь)
const trail = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.runBuild.apply(g.test.draftCard('firetrail'), p);
  p.onGround = true;
  p.health = p.maxHealth;
  const firesBefore = g.level.gadgets._meteorFires.length;
  p._dropFireTrail(0.1, true, false); // біжимо → падає пляма під ногами
  const z = g.test.spawnZombie('tank', p.pos.x, p.pos.z);
  z.x = p.pos.x; z.z = p.pos.z;
  const hpBefore = z.hp;
  const healthBefore = p.health;
  g.level.gadgets._updateMeteorFires(1);
  return {
    field: p.fireTrail,
    dropped: g.level.gadgets._meteorFires.length > firesBefore,
    zombieBurned: z.hp < hpBefore,
    playerSafe: p.health === healthBefore,
    damaging: g.level.gadgets._meteorFires.every((f) => !f.damage || f.dps > 0),
  };
});
check(trail.field === 9, 'картка «Вогняний слід» поставила поле fireTrail', trail.field);
check(trail.dropped, 'під час бігу під ногами лишається вогняна пляма');
check(trail.zombieBurned, 'зомбі у сліді горить');
check(trail.playerSafe, 'слід НЕ шкодить самому гравцю');

// ⏱️ «Гарячі руки»: вбивство відкриває вікно, у якому магазин набивається миттєво
const hotHands = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.runBuild.apply(g.test.draftCard('fastreload'), p);
  const z = g.test.spawnZombie('walker', p.pos.x + 3, p.pos.z);
  z.hp = 1;
  z.lastHitBy = 1;
  z.damage(999, null, false);
  const windowAfterKill = p.killReloadT;
  p.cur = 'pistol';
  p.curAmmo.mag = 0;
  p.reloading = 0;
  p.startReload();
  const started = p.reloading;
  p._updateWeaponFiring(1 / 60, g.input, false);
  return { field: p.killReload, windowAfterKill, started, mag: p.curAmmo.mag, reloading: p.reloading };
});
check(hotHands.field === 2.5, 'картка «Гарячі руки» поставила поле killReload', hotHands.field);
check(hotHands.windowAfterKill === 2.5, 'вбивство відкрило вікно миттєвої перезарядки', hotHands.windowAfterKill);
check(hotHands.started > 0, 'перезарядка почалась', hotHands.started);
check(hotHands.reloading === 0 && hotHands.mag === 12, 'магазин набився миттєво', JSON.stringify(hotHands));

// 🧲 «Магніт монет»: монети тягне тим самим ∞-магнітом, що й супер-сила
const magnet = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const before = g.level.effects.getSuperMagnet();
  g.level.runBuild.apply(g.test.draftCard('coinmagnet'), p);
  const coin = g.level.effects.spawnCoin(p.pos.x + 60, p.pos.z + 60, 5, 45);
  const far = g.level.effects.coins[g.level.effects.coins.length - 1];
  const dBefore = Math.hypot(far.mesh.position.x - p.pos.x, far.mesh.position.z - p.pos.z);
  for (let i = 0; i < 30; i++) g.level.effects.update(1 / 60);
  const dAfter = Math.hypot(far.mesh.position.x - p.pos.x, far.mesh.position.z - p.pos.z);
  return { before, field: p.coinMagnet, pickupMult: p.pickupMult, after: g.level.effects.getSuperMagnet(), dBefore, dAfter, coin: !!coin };
});
check(magnet.field === 1, 'картка «Магніт монет» поставила поле coinMagnet', magnet.field);
check(magnet.pickupMult > 1, 'радіус підбору теж підріс', magnet.pickupMult);
check(magnet.before === false && magnet.after === true, '∞-магніт увімкнувся наявним механізмом', JSON.stringify(magnet));
check(magnet.dAfter < magnet.dBefore, 'монета з іншого кінця карти полетіла до гравця', `${magnet.dBefore} → ${magnet.dAfter}`);

// 💚 «Друге дихання»: РІВНО один порятунок за етап, з тостом і невразливістю
const wind = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.level.runBuild.apply(g.test.draftCard('secondwind'), p);
  p.reviveCharges = 0;
  p.armor = 0;
  p.buffs.bubble = 0;
  p.gadgetShield = 0;
  p.respawnProtect = 0;
  p.health = p.maxHealth;
  let toast = null;
  g.level.bus.on('toast', (text) => { toast = text; });
  p.takeDamage(99999, p.pos.x + 2, p.pos.z);
  const saved = { health: p.health, guard: p.respawnProtect, charge: p.secondWind, toast };
  // другий смертельний удар у тому самому забігу — заряду вже немає
  p.respawnProtect = 0;
  p.takeDamage(99999, p.pos.x + 2, p.pos.z);
  const died = p.health;
  // прибираємо за собою: смерть відкрила оверлей і завела таймер респавну
  g.deathT = -1;
  g._hideOverlay('overlay-death');
  p.health = p.maxHealth;
  p.respawnProtect = 0;
  p.fireTrail = 0;
  return { ...saved, died, max: p.maxHealth };
});
check(wind.charge === 0, 'заряд «Другого дихання» витрачено');
check(wind.health > 0 && wind.health <= Math.ceil(wind.max * 0.2),
  'смерть замінилась на крихту здоровʼя', `${wind.health}/${wind.max}`);
check(wind.guard >= 3, 'після порятунку є коротка невразливість', wind.guard);
check(typeof wind.toast === 'string' && wind.toast.length > 0, 'гравцю сказали, що його врятувало', wind.toast);
check(wind.died === 0, 'другий раз за забіг картка вже не рятує', wind.died);

// екран перемоги показує рядок «Твоя збірка»
const victory = await page.evaluate(() => {
  const g = window.__game;
  g.level.bossDefeated = true;
  g._showVictory();
  return {
    hasBuildRow: document.getElementById('victory-stats').innerHTML.includes(g.level.runBuild.summary()),
  };
});
check(victory.hasBuildRow, 'екран перемоги показує зібрану збірку');

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 DRAFT-CAMPAIGN OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail ? 1 : 0);
