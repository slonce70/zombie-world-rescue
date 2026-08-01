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
