import { chromium } from 'playwright';
const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

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
    out.samuraiBuilt = z.type === 'samurai' && z.rig.ztype === 'samurai' && z.charger && z.stats.hp === 150;
  } catch (e) { out.errors.push('spawn(samurai): ' + e.message); }
  try { const rig = makeBoss('sumo'); out.sumoBuilt = !!(rig && rig.group && rig.ztype === 'boss'); }
  catch (e) { out.errors.push('makeBoss(sumo): ' + e.message); }
  return out;
});

check(cfg.inLevel === 'JPN', 'рівень Японії завантажився', JSON.stringify({ inLevel: cfg.inLevel, zombies: cfg.zombies }));
check(cfg.inOrder && cfg.jpnIdx === 9 && cfg.lastInOrder === 'CHN' && cfg.count === 11, 'JPN — 10-та в CAMPAIGN_ORDER, остання тепер CHN (всього 11)', JSON.stringify({ jpnIdx: cfg.jpnIdx, last: cfg.lastInOrder, count: cfg.count }));
check(cfg.hasBiome && cfg.biome === 'sakura', 'біом sakura існує', cfg.biome);
check(cfg.extra === 'samurai', 'унікальний моб Японії — samurai', cfg.extra);
check((cfg.types.samurai || 0) > 0, 'samurai присутній у спавні Японії', JSON.stringify(cfg.types));
check(!cfg.types.gladiator, 'гладіатори не спавняться в Японії', JSON.stringify(cfg.types));
check(cfg.samuraiBuilt, 'spawn(samurai) будує унікального самурая-чарджера', cfg.errors.join('|'));
check(cfg.bossStyle === 'sumo', 'бос — стиль sumo', cfg.bossStyle);
check(cfg.sumoBuilt, 'makeBoss(sumo) будує риг без помилок', cfg.errors.join('|'));
check(cfg.coin === 800, 'нагорода — монети (як фінал)', String(cfg.coin));
check(cfg.zombies > 0, 'зомбі на карті Японії', String(cfg.zombies));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ЯПОНІЯ ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
