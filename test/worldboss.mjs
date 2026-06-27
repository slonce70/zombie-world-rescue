import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
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

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });

console.log('▸ Світові боси: моделі');
const expectedSkins = { radiation: 0x78c957, iceGeneral: 0xa8e8ff, mechTitan: 0x9aa3ad };
const modelInfo = await page.evaluate(async () => {
  const mod = await import('/src/characters.js');
  return ['radiation', 'iceGeneral', 'mechTitan'].map((style) => {
    const rig = mod.makeBoss(style);
    return {
      style,
      ok: !!(rig && rig.group && rig.parts && rig.parts.head && rig.parts.torso),
      ztype: rig && rig.ztype,
      scale: rig && rig.spec && rig.spec.scale,
      skin: rig && rig.spec && rig.spec.skin,
      children: rig && rig.group ? rig.group.children.length : 0,
    };
  });
});

for (const m of modelInfo) {
  check(m.ok && m.ztype === 'boss' && m.scale >= 2.7 && m.skin === expectedSkins[m.style],
    `модель ${m.style} створюється саме як новий стиль`, JSON.stringify(m));
}

console.log('▸ Світові боси: конфіг');
const cfgInfo = await page.evaluate(async () => {
  const mod = await import('/src/worldboss.js');
  return {
    ids: mod.WORLD_BOSSES.map((b) => b.id),
    unlocks: Object.fromEntries(mod.WORLD_BOSSES.map((b) => [b.id, b.unlockCountries])),
    rewards: Object.fromEntries(mod.WORLD_BOSSES.map((b) => [b.id, b.reward])),
    helpers: {
      rad3: mod.worldBossUnlocked('radiation', 3),
      rad4: mod.worldBossUnlocked('radiation', 4),
      next7: mod.nextWorldBoss(7)?.id,
      next12: mod.nextWorldBoss(12),
    },
  };
});
check(JSON.stringify(cfgInfo.ids) === JSON.stringify(['radiation', 'ice', 'titan']),
  'є рівно три світові боси у правильному порядку', JSON.stringify(cfgInfo.ids));
check(cfgInfo.unlocks.radiation === 4 && cfgInfo.unlocks.ice === 8 && cfgInfo.unlocks.titan === 12,
  'відкриття босів: 4 / 8 / 12 країн', JSON.stringify(cfgInfo.unlocks));
check(cfgInfo.rewards.titan.crystals === 25 && cfgInfo.rewards.titan.xp === 900,
  'нагорода Титана задана в конфігу', JSON.stringify(cfgInfo.rewards.titan));
check(!cfgInfo.helpers.rad3 && cfgInfo.helpers.rad4 && cfgInfo.helpers.next7 === 'ice' && cfgInfo.helpers.next12 === null,
  'хелпери відкриття і наступного боса працюють', JSON.stringify(cfgInfo.helpers));

console.log('▸ Світові боси: життєвий цикл');
const lifecycleInfo = await page.evaluate(async () => {
  const mod = await import('/src/worldboss.js');
  const added = [];
  const removed = [];
  let bossStart = 0;
  let spawnN = 0;
  const level = {
    world: { layout: { arena: { x: 0, z: 0 } }, groundH: () => 0 },
    scene: { add: (...items) => added.push(...items), remove: (...items) => removed.push(...items) },
    zombies: { spawn: () => { spawnN++; return { hp: 1, maxHp: 1, state: 'chase', x: 0, z: 0, y: 0, stats: {} }; } },
    player: { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, health: 100, takeDamage: () => {} },
    stats: { time: 0, kills: 0 },
    effects: { ring: () => {} },
    bus: { emit: (ev) => { if (ev === 'bossStart') bossStart++; } },
    game: { hud: { banner: () => {}, toast: () => {} }, _endWorldBossRun: () => {} },
  };
  const mode = new mod.WorldBossMode(level, 'radiation');
  const before = { spawnN, bossStart, added: added.length, bossStarted: mode.bossStarted };
  mode.over = true;
  mode.update(0.1);
  const afterOver = { spawnN, bossStart };
  mode.over = false;
  mode.update(0.1);
  const afterFirstTick = { spawnN, bossStart, hasBoss: !!mode.boss, bossStarted: mode.bossStarted };
  mode.over = true;
  mode.update(0.1);
  const afterLaterOver = { spawnN, bossStart };
  mode.dispose();
  return { before, afterOver, afterFirstTick, afterLaterOver, removed: removed.length };
});
check(lifecycleInfo.before.spawnN === 0 && lifecycleInfo.before.bossStart === 0 && !lifecycleInfo.before.bossStarted,
  'конструктор не спавнить боса і не шле bossStart', JSON.stringify(lifecycleInfo));
check(lifecycleInfo.afterOver.spawnN === 0 && lifecycleInfo.afterOver.bossStart === 0,
  'over=true блокує перший update без спавну', JSON.stringify(lifecycleInfo));
check(lifecycleInfo.afterFirstTick.spawnN === 1 && lifecycleInfo.afterFirstTick.bossStart === 1 && lifecycleInfo.afterFirstTick.hasBoss && lifecycleInfo.afterFirstTick.bossStarted,
  'перший нормальний update спавнить боса один раз і bossStarted стає true', JSON.stringify(lifecycleInfo));
check(lifecycleInfo.afterLaterOver.spawnN === 1 && lifecycleInfo.afterLaterOver.bossStart === 1,
  'over=true після спавну теж блокує update', JSON.stringify(lifecycleInfo));
check(lifecycleInfo.removed > 0, 'dispose прибирає кімнату режиму зі сцени', JSON.stringify(lifecycleInfo));

console.log('▸ Світові боси: меню і старт');
const menuInfo = await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true };
  g.renderSoloMenu();
  const locked = document.querySelector('.solo-mode[data-mode="worldboss"]');
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true };
  g.renderSoloMenu();
  const open = document.querySelector('.solo-mode[data-mode="worldboss"]');
  return {
    locked: locked?.classList.contains('locked') || false,
    open: !!open && !open.classList.contains('locked'),
    text: open?.textContent || '',
  };
});
check(menuInfo.locked && menuInfo.open && menuInfo.text.includes('СВІТОВІ БОСИ'),
  'меню світових босів закрите до 4 країн і відкрите після 4', JSON.stringify(menuInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true };
  return g.test.startWorldBoss('radiation');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.worldBoss, null, { timeout: 30000 });
await page.waitForFunction(() => !!window.__game.level?.zombies?.boss, null, { timeout: 30000 });
const startInfo = await page.evaluate(() => {
  const g = window.__game;
  return {
    id: g.level.worldBoss.id,
    noShop: g.level.noShop,
    noGadgets: g.level.noGadgets,
    bossStyle: g.level.zombies.boss?.bossStyle,
    hp: g.level.zombies.boss?.maxHp,
    megabox: !!g.level.megabox,
    playerWeapons: g.level.player.weapons,
    worldBossState: g.test.state().worldBoss,
  };
});
check(startInfo.id === 'radiation' && startInfo.noShop && !startInfo.noGadgets,
  'світовий бос стартує як спецрежим: магазин вимкнений, гаджети доступні', JSON.stringify(startInfo));
check(startInfo.bossStyle === 'radiation' && startInfo.hp === 9000 && !startInfo.megabox,
  'Радіаційний бос має нову модель, HP і без мегабокса', JSON.stringify(startInfo));
check(startInfo.playerWeapons.includes('pistol') && startInfo.worldBossState?.id === 'radiation',
  'звичайний лоадаут гравця лишається доступним і test API бачить worldBoss', JSON.stringify(startInfo.playerWeapons));

const deathRouteInfo = await page.evaluate(() => {
  const g = window.__game;
  let scheduledCampaignVictory = false;
  let showVictoryCalled = false;
  const oldTimeout = window.setTimeout;
  const oldShowVictory = g._showVictory.bind(g);
  window.setTimeout = (fn, ms, ...args) => {
    if (ms === 2400) scheduledCampaignVictory = true;
    return 0;
  };
  g._showVictory = () => { showVictoryCalled = true; };
  g._onBossDied();
  window.setTimeout = oldTimeout;
  g._showVictory = oldShowVictory;
  return {
    over: !!g.level.worldBoss.over,
    ended: !!g.level.worldBoss._ended,
    victoryShown: g.victoryShown,
    lastEndMode: g._lastEndMode,
    scheduledCampaignVictory,
    showVictoryCalled,
    worldBosses: { ...(g.save.worldBosses || {}) },
  };
});
check(deathRouteInfo.over && deathRouteInfo.ended && deathRouteInfo.lastEndMode === 'worldboss',
  'смерть світового боса завершує worldBoss, а не кампанію', JSON.stringify(deathRouteInfo));
check(!deathRouteInfo.scheduledCampaignVictory && !deathRouteInfo.showVictoryCalled && !deathRouteInfo.worldBosses.radiation,
  'worldBoss death не запускає country victory і не видає нагороду в Task 3', JSON.stringify(deathRouteInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startWorldBoss('radiation');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.worldBoss && window.__game.level?.zombies?.boss, null, { timeout: 30000 });

console.log('▸ Світові боси: механіки');
const radiationInfo = await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 420; i++) g.level.worldBoss.update(1 / 60);
  return {
    hazards: g.level.worldBoss.hazards.length,
    hpBefore: g.level.player.health,
  };
});
check(radiationInfo.hazards > 0, 'Бос Радіації створює токсичні зони', JSON.stringify(radiationInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startWorldBoss('ice');
});
await page.waitForFunction(() => window.__game.level?.worldBoss?.id === 'ice' && !!window.__game.level?.zombies?.boss, null, { timeout: 30000 });
const iceInfo = await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.zombies.boss;
  b.worldBossShield = true;
  const hp0 = b.hp;
  b.damage(100, null, false);
  const shielded = hp0 - b.hp;
  b.worldBossShield = false;
  const hp1 = b.hp;
  b.damage(100, null, false);
  const open = hp1 - b.hp;
  return { shielded, open };
});
check(iceInfo.shielded < iceInfo.open && iceInfo.shielded === 25,
  'крижаний щит зменшує шкоду до 25%', JSON.stringify(iceInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startWorldBoss('titan');
});
await page.waitForFunction(() => window.__game.level?.worldBoss?.id === 'titan' && !!window.__game.level?.zombies?.boss, null, { timeout: 30000 });
const titanInfo = await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.zombies.boss;
  b.worldBossCoreClosed = true;
  b.worldBossCoreOpen = false;
  const hp0 = b.hp;
  b.damage(100, null, false);
  const closed = hp0 - b.hp;
  b.worldBossCoreClosed = false;
  b.worldBossCoreOpen = true;
  const hp1 = b.hp;
  b.damage(100, null, false);
  const open = hp1 - b.hp;
  return { closed, open };
});
check(titanInfo.closed === 35 && titanInfo.open === 140,
  'ядро Титана: 35% шкоди закрите, 140% відкрите', JSON.stringify(titanInfo));

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  failed += errors.length;
}
if (failed) process.exit(1);
