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

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  failed += errors.length;
}
if (failed) process.exit(1);
