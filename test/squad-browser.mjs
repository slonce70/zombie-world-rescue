// 🎒 Загін у бою: вибір на Базі, спавн у соло-кампанії, здібності, падіння і підйом.
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=711`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Вибір напарника на Базі Рятівника');
const pick = await page.evaluate(async () => {
  const g = window.__game;
  const { squadSlots } = await import('/src/squad.js');
  const noFriends = squadSlots(g.save);
  g.save.friends = { UKR: true };            // 🩹 Бабуся Оксана — лікує
  g.enterHQBase();
  const oneSlot = squadSlots(g.save);
  const joined = g.hqbase._tapFriend('UKR');
  const afterJoin = [...(g.save.squad || [])];
  const left = g.hqbase._tapFriend('UKR');
  const afterLeave = [...(g.save.squad || [])];
  g.hqbase._tapFriend('UKR');
  const counter = document.getElementById('hqbase-squad-count')?.textContent;
  g.exitHQBase();
  return {
    noFriends, oneSlot, joined, left, afterJoin, afterLeave, counter,
    saved: [...(g.save.squad || [])],
  };
});
check(pick.noFriends === 0 && pick.oneSlot === 1,
  'слоти зʼявляються з першим врятованим другом', JSON.stringify(pick));
check(pick.afterJoin.join() === 'UKR' && pick.afterLeave.length === 0,
  'клік по другові вмикає і вимикає загін', JSON.stringify(pick));
check(pick.counter === '1/1' && pick.saved.join() === 'UKR',
  'лічильник Бази показує 1/1 і вибір збережено', JSON.stringify(pick));

console.log('▸ Напарник у бою: лікування, падіння, підйом');
const fight = await page.evaluate(async () => {
  const g = window.__game;
  const { SQUAD_MAX_HP, SQUAD_DOWN_SECS } = await import('/src/squad.js');
  g.startLevel('UKR');
  for (let i = 0; i < 80 && g.state !== 'level'; i++) await new Promise((r) => setTimeout(r, 250));
  const level = g.level;
  const member = (level.gadgets.clones || []).find((c) => c.squad);
  if (!member) return { spawned: false };

  const p = level.player;
  member.x = p.pos.x + 1;
  member.z = p.pos.z + 1;
  member.y = p.pos.y;
  p.health = p.maxHealth - 30;
  member.abilityT = 0;
  level.gadgets._squadAbility(member, 0.02);
  const healed = p.health;

  member.takeDamage(SQUAD_MAX_HP + 10);
  level.gadgets._updateClones(0.02);
  const downT = member.downT;
  const stillHere = (level.gadgets.clones || []).includes(member);
  level.gadgets._updateClones(SQUAD_DOWN_SECS + 1);
  const revivedHp = member.hp;

  return {
    spawned: true, archetype: member.squad, country: member.countryId,
    maxHp: SQUAD_MAX_HP, healed, downSecs: SQUAD_DOWN_SECS, downT, stillHere, revivedHp,
  };
});
check(fight.spawned && fight.archetype === 'heal' && fight.country === 'UKR',
  'напарник спавниться у соло-кампанії зі своїм архетипом', JSON.stringify(fight));
check(fight.healed > fight.maxHp * 0 && fight.healed >= 75,
  '🩹 напарник лікує гравця поруч', JSON.stringify(fight.healed));
check(fight.downT === fight.downSecs && fight.stillHere && fight.revivedHp === fight.maxHp,
  'напарник не гине назавжди: падає і встає з повним HP', JSON.stringify(fight));

console.log('▸ Приманка тягне зомбі на себе');
const lure = await page.evaluate(() => {
  const g = window.__game;
  const level = g.level;
  const member = (level.gadgets.clones || []).find((c) => c.squad);
  if (!member) return { skipped: true };
  member.squad = 'lure';
  member.downT = 0;
  const p = level.player;
  // напарник ДАЛІ за гравця, але множник 0.4 має перетягнути ціль на нього
  member.x = p.pos.x + 8; member.z = p.pos.z; member.y = p.pos.y;
  const zb = level.zombies.list.find((z) => z.state !== 'dead');
  if (!zb) return { skipped: true };
  zb.x = p.pos.x + 2; zb.z = p.pos.z; zb.y = p.pos.y;
  zb.aggroed = true; zb.state = 'chase';
  const before = Math.hypot(zb.x - member.x, zb.z - member.z);
  for (let i = 0; i < 90; i++) level.zombies.update(0.05);
  return { skipped: false, before, after: Math.hypot(zb.x - member.x, zb.z - member.z) };
});
check(lure.skipped || lure.after < lure.before,
  '🎈 зомбі йде до напарника-приманки, а не до гравця', JSON.stringify(lure));

console.log('▸ У режимі без гаджетів загону немає');
const noGadgets = await page.evaluate(async () => {
  const g = window.__game;
  g.startKnockout();
  for (let i = 0; i < 80 && !g.level?.knockout; i++) await new Promise((r) => setTimeout(r, 250));
  return { knockout: !!g.level?.knockout, squad: (g.level?.gadgets?.clones || []).filter((c) => c.squad).length };
});
check(noGadgets.knockout && noGadgets.squad === 0,
  'у Нокауті (noGadgets) напарник не спавниться', JSON.stringify(noGadgets));

check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));

await closeTest();
if (failed) process.exit(1);
console.log('\n🎉 ЗАГІН ПРАЦЮЄ');
