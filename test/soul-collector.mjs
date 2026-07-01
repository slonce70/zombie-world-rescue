import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&seed=35`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Збирач душ відкривається на 35 рівні Зоряного шляху');
const menu = await page.evaluate(async () => {
  const { xpForLevel } = await import('/src/progress.js');
  const xpTo = (lvl) => {
    let n = 0;
    for (let i = 1; i < lvl; i++) n += xpForLevel(i);
    return n;
  };
  const g = window.__game;
  g.save.xp = xpTo(35) - 1;
  g.renderSoloMenu();
  const before = document.querySelector('.solo-mode[data-mode="soul-collector"]');
  g.save.xp = xpTo(35);
  g.renderSoloMenu();
  const after = document.querySelector('.solo-mode[data-mode="soul-collector"]');
  return {
    beforeExists: !!before,
    beforeLocked: before && before.classList.contains('locked'),
    afterExists: !!after,
    afterLocked: after && after.classList.contains('locked'),
    name: after && after.querySelector('.sm-name').textContent,
    soulPathButton: !!document.getElementById('btn-souls'),
  };
});
check(menu.beforeExists && menu.beforeLocked, 'до 35 рівня режим заблокований', JSON.stringify(menu));
check(menu.afterExists && !menu.afterLocked && /Збирач душ/i.test(menu.name), 'на 35 рівні режим доступний', JSON.stringify(menu));
check(menu.soulPathButton, 'у меню є кнопка Шлях душ', JSON.stringify(menu));

console.log('▸ Старт режиму: кімната 100x100, 20 білих привидів, 50 HP і тільки посох');
await page.evaluate(() => window.__game.test.startSoulCollector());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.soulCollector, null, { timeout: 30000 });
const started = await page.evaluate(() => {
  const g = window.__game;
  const s = g.level.soulCollector;
  const p = g.level.player;
  const ghosts = g.level.zombies.list.filter((z) => z.soulGhost && z.state !== 'dead');
  return {
    roomSize: s.roomSize,
    floorY: s.floorY,
    ghosts: ghosts.length,
    ghostStats: ghosts.map((z) => ({ type: z.type, hp: z.hp, maxHp: z.maxHp, visible: z.rig.group.visible, y: z.y })),
    player: { hp: p.health, maxHp: p.maxHealth, weapons: [...p.weapons], cur: p.cur, grenades: p.grenades, y: p.pos.y },
    noGadgets: g.level.noGadgets,
    noShop: g.level.noShop,
    noPickups: g.level.noPickups,
    noZombiePickups: g.level.noZombiePickups,
    noCoinDrops: g.level.noCoinDrops,
    noBuffs: g.level.noBuffs,
  };
});
check(started.roomSize === 100, 'кімната має розмір 100x100 метрів', JSON.stringify(started));
check(started.ghosts === 20 && started.ghostStats.every((z) => z.type === 'ghost' && z.hp === 125 && z.maxHp === 125 && z.visible),
  'є 20 видимих білих привидів по 125 HP', JSON.stringify(started));
check(started.player.hp === 50 && started.player.maxHp === 50
  && JSON.stringify(started.player.weapons) === JSON.stringify(['staff', 'sword'])
  && started.player.cur === 'staff' && started.player.grenades === 0,
  'гравець має 50 HP, посох, меч і 0 гранат', JSON.stringify(started));
check(started.noGadgets && started.noShop && started.noPickups && started.noZombiePickups && started.noCoinDrops && started.noBuffs,
  'пікапи, гаджети, магазин, бафи і дроп вимкнені', JSON.stringify(started));

console.log('▸ Меч у Збирачі душ наносить 30 HP');
const swordHit = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const z = g.level.zombies.list.find((x) => x.soulGhost && x.state !== 'dead');
  z.hp = z.maxHp = 125;
  z.x = p.pos.x;
  z.z = p.pos.z - 2;
  z.y = g.level.soulCollector.floorY;
  z.rig.group.position.set(z.x, z.y, z.z);
  p.cur = 'sword';
  p.ammo.sword.mag = p.weapon.mag;
  p.yaw = 0;
  p.pitch = 0;
  p.shootCd = 0;
  p._shoot();
  return { hp: z.hp, damage: 125 - z.hp, weapon: p.cur };
});
check(swordHit.damage === 30, 'меч знімає рівно 30 HP', JSON.stringify(swordHit));

console.log('▸ Привиди бʼють гравця');
const ghostHit = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const z = g.level.zombies.list.find((x) => x.soulGhost && x.state !== 'dead');
  p.health = 50;
  z.x = p.pos.x + 1.1;
  z.z = p.pos.z;
  z.y = g.level.soulCollector.floorY;
  z.rig.group.position.set(z.x, z.y, z.z);
  z.aggroed = true;
  z.state = 'chase';
  for (let i = 0; i < 30; i++) {
    g.level.zombies.update(1 / 30);
    g.level.soulCollector.update(1 / 30);
  }
  return { hp: p.health };
});
check(ghostHit.hp > 0 && ghostHit.hp < 50, 'привид знімає HP гравцю', JSON.stringify(ghostHit));

console.log('▸ Перемога дає 3 душі, шлях душ піднімається за 5 душ і видає нагороду');
const rewards = await page.evaluate(() => {
  const g = window.__game;
  for (const z of [...g.level.zombies.list]) {
    if (z.soulGhost && z.state !== 'dead') z.damage(99999, null, false);
  }
  g.level.soulCollector.update(0.05);
  const afterWin = {
    souls: g.save.souls,
    level: g.save.soulLevel,
    title: document.querySelector('#overlay-arena-end h1').textContent,
    shown: document.getElementById('overlay-arena-end').classList.contains('show'),
  };
  g.save.souls = 5;
  g.save.soulLevel = 1;
  const coinsBefore = g.save.coins;
  g.claimSoulLevel();
  const afterClaim = {
    souls: g.save.souls,
    level: g.save.soulLevel,
    coinsDelta: g.save.coins - coinsBefore,
  };
  g.save.souls = 5;
  g.save.soulLevel = 2;
  g.save.gadgetsOwned = g.save.gadgetsOwned.filter((id) => id !== 'xray');
  g.claimSoulLevel();
  const gadget = g.save.gadgetsOwned.includes('xray');
  g.save.souls = 5;
  g.save.soulLevel = 3;
  g.save.skins = g.save.skins.filter((id) => id !== 'ghost');
  g.claimSoulLevel();
  const skin = g.save.skins.includes('ghost');
  g.save.souls = 5;
  g.save.soulLevel = 4;
  g.save.titles = g.save.titles.filter((id) => id !== 'ghost');
  g.claimSoulLevel();
  return {
    afterWin,
    afterClaim,
    rewards: { gadget, skin, title: g.save.titles.includes('ghost'), level: g.save.soulLevel },
  };
});
check(rewards.afterWin.souls === 3 && rewards.afterWin.level === 1 && rewards.afterWin.shown && /ДУШ/i.test(rewards.afterWin.title),
  'перемога завершує режим і додає 3 душі', JSON.stringify(rewards.afterWin));
check(rewards.afterClaim.souls === 0 && rewards.afterClaim.level === 2 && rewards.afterClaim.coinsDelta >= 500,
  '5 душ піднімають Шлях душ на рівень і дають нагороду', JSON.stringify(rewards.afterClaim));
check(rewards.rewards.gadget && rewards.rewards.skin && rewards.rewards.title && rewards.rewards.level === 5,
  'Шлях душ видає гаджет, скін Привид і титул Привид', JSON.stringify(rewards.rewards));

check(errors.length === 0, 'без JS-помилок консолі', errors.join('\n'));
await browser.close();
closeServer();
console.log('');
console.log(failed === 0 ? '🎉 ЗБИРАЧ ДУШ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
