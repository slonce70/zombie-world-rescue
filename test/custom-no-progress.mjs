import { openBrowserTest, makeCheck } from './_browser.mjs';
import { spawnRelay } from './_relay.mjs';

// власне dev-relay: клієнт спільноти мусить говорити з ЛОКАЛЬНИМ API, а не з продом
const RELAY_PORT = 8777;
const relay = await spawnRelay(RELAY_PORT);
const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

const snapshot = {
  v: 1,
  id: 'AB7K2MNP',
  revision: 3,
  tier: 'plus',
  mapSize: 'standard',
  mapStyle: 'classic',
  data: {
    biome: 'snow',
    objects: [
      { type: 'task', quest: 'rescue', x: -35, z: -35, ry: 0 },
      { type: 'zombie', zombieType: 'runner', x: 35, z: -35, ry: 0 },
      { type: 'airdrop', x: 75, z: 0, ry: 0 },
    ],
  },
};

await page.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
await page.evaluate(async (cm) => {
  const g = window.__game;
  g.save.coins = 4321;
  g.save.crystals = 17;
  g.save.xp = 123;
  g.save.stats.killed = 9;
  g.save.stats.damageDealt = 44;
  g.save.stats.bestCombo = 2;
  window.__saveBeforeCommunity = JSON.stringify(g.save);
  await g.startLevel('CUSTOM', { customMap: 'community', communityMap: cm });
}, snapshot);
await page.waitForFunction(() => window.__game?.level?.customMap && window.__game.level.communityMap, null, { timeout: 30000 });

const result = await page.evaluate(() => {
  const g = window.__game;
  const level = g.level;
  const mode = level.customMap;
  const placed = level.zombies.list.find((zombie) => zombie.customPlaced);

  level.addCoins(500);
  g.progress.addXp(500);
  g.quests.onEvent('kill');
  g.chapter.onEvent('kill');
  g._bumpCamp('elite');
  g._bumpWeeklyGoal();
  level.bus.emit('zombieDamaged', 100, placed);
  level.bus.emit('gadgetUsed', 'clone');
  level.bus.emit('hitmarker', true, 'pistol');
  level.bus.emit('megaboxOpened');
  level.bus.emit('dance');
  level.bus.emit('eliteWaveCleared', { x: 0, y: 0, z: 0 });
  level.bus.emit('goldenChest', { x: 0, y: 0, z: 0 });
  g.hud.hintOnce('community-test', 'test');
  g.unlockWeapon('bazooka');

  placed.damage(99999, null, false);
  const drop = mode.airdrops[0];
  level.player.health = 40;
  level.player.pos.set(drop.x, level.player.pos.y, drop.z);
  g.input.justPressed.add('KeyE');
  mode.update(0.1, g.input, true);
  g.input.justPressed.clear();

  const rescue = mode.tasks[0];
  level.player.pos.set(rescue.action.x, level.player.pos.y, rescue.action.z);
  g.input.justPressed.add('KeyE');
  mode.update(0.1, g.input, true);
  g.input.justPressed.clear();
  const boss = mode.boss;
  boss.damage(99999, null, false);

  return {
    flags: { noProgress: level.noProgress, noShop: level.noShop, noCoinDrops: level.noCoinDrops },
    tier: mode.tier,
    editorPlus: mode.editorPlus,
    placedType: placed.type,
    airdrop: { opened: drop.opened, health: level.player.health },
    boss: { started: mode.bossStarted, dead: boss.state === 'dead' },
    result: document.getElementById('overlay-community-result').classList.contains('show'),
    campaign: document.getElementById('overlay-victory').classList.contains('show'),
    // cid — анонімна ідентичність гравця, яку створює перший мережевий виклик,
    // а не прогрес: звіряємо сейв без нього
    saveSame: JSON.stringify({ ...g.save, cid: null })
      === JSON.stringify({ ...JSON.parse(window.__saveBeforeCommunity), cid: null }),
    forbidden: {
      liberated: !!g.save.liberated.CUSTOM,
      missionRuns: !!g.save.missionRuns.CUSTOM,
      records: !!g.save.records.CUSTOM,
    },
  };
});

check(result.flags.noProgress && result.flags.noShop && result.flags.noCoinDrops,
  'community run вмикає noProgress/noShop/noCoinDrops', JSON.stringify(result.flags));
check(result.tier === 'plus' && !result.editorPlus && result.placedType === 'runner',
  'Plus runtime залежить від snapshot, а не entitlement глядача', JSON.stringify(result));
check(result.airdrop.opened && result.airdrop.health > 40,
  'custom-airdrop дає лише run-local ammo/heal', JSON.stringify(result.airdrop));
check(result.boss.started && result.boss.dead && result.result && !result.campaign,
  'справжня смерть custom-боса відкриває окремий result', JSON.stringify(result));
check(result.saveSame && !Object.values(result.forbidden).some(Boolean),
  'community run побітно не змінює permanent save', JSON.stringify(result));

await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  await g.startLevel('CUSTOM', {
    customMap: 'play',
    customMapData: { biome: 'summer', objects: [{ type: 'task', quest: 'rescue', x: -35, z: -35, ry: 0 }] },
  });
});
await page.waitForFunction(() => window.__game?.level?.customMap && !window.__game.level.customMap.editor);
const death = await page.evaluate(() => {
  const g = window.__game;
  g.level.bus.emit('playerDied');
  return {
    ended: g.level._communityEnded,
    deaths: g.level.stats.deaths,
    deathT: g.deathT,
    result: document.getElementById('overlay-community-result').classList.contains('show'),
    deathOverlay: document.getElementById('overlay-death').classList.contains('show'),
    title: document.getElementById('community-result-title').textContent,
  };
});
check(death.ended && death.deaths === 1 && death.deathT === -1 && death.result && !death.deathOverlay && /НЕ ПРОЙДЕНО/.test(death.title),
  'смерть завершує solo custom run без респавна', JSON.stringify(death));

await page.evaluate(async () => {
  const g = window.__game;
  g.endLevel();
  g.save.customMap = { biome: 'summer', objects: [{ type: 'task', quest: 'rescue', x: -35, z: -35, ry: 0 }] };
  await g.startLevel('CUSTOM', { customMap: 'community', communityMap: { v: 1, id: 'BAD' } });
});
const invalid = await page.evaluate(() => ({
  state: window.__game.state,
  level: !!window.__game.level,
  localObjects: window.__game.save.customMap.objects.length,
}));
check(invalid.state === 'globe' && !invalid.level && invalid.localObjects === 1,
  'invalid remote snapshot fail-closed і не запускає local slot', JSON.stringify(invalid));

// Контрольована помилка fail-closed логується навмисно: rejected remote snapshot.
const expectedInvalid = errors.filter((e) => /invalid community map/.test(e));
check(expectedInvalid.length === 1, 'strict remote reject логує рівно одну контрольовану помилку',
  JSON.stringify(expectedInvalid));
// синтетичний знімок у dev-relay не опублікований: 404 від /community/run/start і
// /community/complete — очікуваний шум, який доводить саме мʼяку поведінку клієнта
for (const error of errors) {
  if (/invalid community map/.test(error)) continue;
  if (/Failed to load resource.*404/.test(error)) continue;
  console.log('  ❌', error);
  failed++;
}
console.log(failed ? `💥 Провалено: ${failed}` : '✅ Custom/community runtime: noProgress, tier, boss, death, strict remote');
await closeTest();
relay.kill();
process.exit(failed ? 1 : 0);
