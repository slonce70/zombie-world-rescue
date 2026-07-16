import { openBrowserTest } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };

console.log('▸ Японія (JPN)');
// завантаження рівня JPN = перевірка карти japan.js + біому sakura + ландмарків торії/пагода
await page.goto(`${BASE}/?test&fresh&country=JPN`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

const cfg = await page.evaluate(async () => {
  const out = { errors: [] };
  const { COUNTRIES, CAMPAIGN_ORDER, BIOMES } = await import('/src/countries.js');
  const { makeBoss } = await import('/src/characters.js');
  out.inLevel = window.__game.level && window.__game.level.countryId;
  out.inOrder = CAMPAIGN_ORDER.includes('JPN');
  out.jpnIdx = CAMPAIGN_ORDER.indexOf('JPN');
  out.lastInOrder = CAMPAIGN_ORDER[CAMPAIGN_ORDER.length - 1];
  out.count = CAMPAIGN_ORDER.length;
  const J = COUNTRIES.JPN;
  out.extra = J && J.extraZombie;
  out.bossStyle = J && J.boss.style;
  out.biome = J && J.biome;
  out.hasBiome = !!(J && BIOMES[J.biome]);
  out.coin = J && J.coinReward;
  out.zombies = window.__game.level.zombies.list.length;
  out.types = {};
  for (const z of window.__game.level.zombies.list) out.types[z.type] = (out.types[z.type] || 0) + 1;
  try {
    const ar = window.__game.level.world.layout.arena;
    const z = window.__game.level.zombies.spawn('samurai', ar.x + 16, ar.z, {});
    out.samuraiExpectedHp = Math.round(150 * window.__game.level.zombies.diff.hp);
    out.samuraiHp = z.maxHp;
    out.samuraiBuilt = z.type === 'samurai' && z.rig.ztype === 'samurai' && z.charger && z.maxHp === out.samuraiExpectedHp;
  } catch (e) { out.errors.push('spawn(samurai): ' + e.message); }
  try { const rig = makeBoss('sumo'); out.sumoBuilt = !!(rig && rig.group && rig.ztype === 'boss'); }
  catch (e) { out.errors.push('makeBoss(sumo): ' + e.message); }
  return out;
});

check(cfg.inLevel === 'JPN', 'рівень Японії завантажився', JSON.stringify({ inLevel: cfg.inLevel, zombies: cfg.zombies }));
check(cfg.inOrder && cfg.jpnIdx === cfg.count - 2 && cfg.lastInOrder === 'CHN' && cfg.count >= 12, 'JPN іде перед фінальним CHN у CAMPAIGN_ORDER', JSON.stringify({ jpnIdx: cfg.jpnIdx, last: cfg.lastInOrder, count: cfg.count }));
check(cfg.hasBiome && cfg.biome === 'sakura', 'біом sakura існує', cfg.biome);
check(cfg.extra === 'samurai', 'унікальний моб Японії — samurai', cfg.extra);
check((cfg.types.samurai || 0) > 0, 'samurai присутній у спавні Японії', JSON.stringify(cfg.types));
check(!cfg.types.gladiator, 'гладіатори не спавняться в Японії', JSON.stringify(cfg.types));
check(cfg.samuraiBuilt, 'spawn(samurai) будує унікального самурая-чарджера з HP країни', JSON.stringify({ hp: cfg.samuraiHp, expected: cfg.samuraiExpectedHp, errors: cfg.errors }));
check(cfg.bossStyle === 'sumo', 'бос — стиль sumo', cfg.bossStyle);
check(cfg.sumoBuilt, 'makeBoss(sumo) будує риг без помилок', cfg.errors.join('|'));
check(cfg.coin === 800, 'нагорода — монети (як фінал)', String(cfg.coin));
check(cfg.zombies > 0, 'зомбі на карті Японії', String(cfg.zombies));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ЯПОНІЯ ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
