// 🇨🇳 Китай (CHN) — 11-та, фінальна країна кампанії.
// Перевіряє карту china.js + біом greatwall + ландмарк Велика стіна + боса emperor +
// нового ворога terracotta + позицію в CAMPAIGN_ORDER (остання) + нагороду монетами.
import { chromium } from 'playwright';
const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

console.log('▸ Китай (CHN)');
await page.goto(`${BASE}/?test&fresh&country=CHN`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

const cfg = await page.evaluate(async () => {
  const out = { errors: [] };
  const { COUNTRIES, CAMPAIGN_ORDER, BIOMES } = await import('/src/countries.js');
  const { makeBoss } = await import('/src/characters.js');
  out.inLevel = window.__game.level && window.__game.level.countryId;
  out.inOrder = CAMPAIGN_ORDER.includes('CHN');
  out.lastInOrder = CAMPAIGN_ORDER[CAMPAIGN_ORDER.length - 1];
  out.count = CAMPAIGN_ORDER.length;
  const C = COUNTRIES.CHN;
  out.exists = !!C;
  out.extra = C && C.extraZombie;
  out.bossStyle = C && C.boss.style;
  out.bossHp = C && C.boss.hp;
  out.biome = C && C.biome;
  out.hasBiome = !!(C && BIOMES[C.biome]);
  out.coin = C && C.coinReward;
  out.landmarks = window.__game.level.country.map.landmarks;
  out.zombies = window.__game.level.zombies.list.length;
  out.types = {};
  for (const z of window.__game.level.zombies.list) out.types[z.type] = (out.types[z.type] || 0) + 1;
  try {
    const ar = window.__game.level.world.layout.arena;
    const z = window.__game.level.zombies.spawn('terracotta', ar.x + 16, ar.z, {});
    out.terraBuilt = z.type === 'terracotta' && z.rig.ztype === 'terracotta' && z.charger && z.stats.hp === 165;
  } catch (e) { out.errors.push('spawn(terracotta): ' + e.message); }
  try { const rig = makeBoss('emperor'); out.emperorBuilt = !!(rig && rig.group && rig.ztype === 'boss'); }
  catch (e) { out.errors.push('makeBoss(emperor): ' + e.message); }
  return out;
});

check(cfg.inLevel === 'CHN', 'рівень Китаю завантажився', JSON.stringify({ inLevel: cfg.inLevel, zombies: cfg.zombies }));
check(cfg.exists, 'COUNTRIES.CHN існує');
check(cfg.inOrder && cfg.lastInOrder === 'CHN' && cfg.count >= 11, 'CHN — ОСТАННЯ в CAMPAIGN_ORDER', JSON.stringify({ last: cfg.lastInOrder, count: cfg.count }));
check(cfg.hasBiome && cfg.biome === 'greatwall', 'біом greatwall існує', cfg.biome);
check(cfg.extra === 'terracotta', 'унікальний моб Китаю — terracotta', cfg.extra);
check((cfg.types.terracotta || 0) > 0, 'теракотові воїни присутні у спавні Китаю', JSON.stringify(cfg.types));
check(cfg.terraBuilt, 'spawn(terracotta) будує броньованого воїна-чарджера (hp165)', cfg.errors.join('|'));
check(cfg.bossStyle === 'emperor', 'бос — стиль emperor', cfg.bossStyle);
check(cfg.bossHp === 7600 && cfg.bossHp > 7200, 'бос HP 7600 (вище за JPN 7200)', String(cfg.bossHp));
check(cfg.emperorBuilt, 'makeBoss(emperor) будує риг без помилок', cfg.errors.join('|'));
check(cfg.coin === 900, 'нагорода — 900 монет (як фінал кампанії)', String(cfg.coin));
check(Array.isArray(cfg.landmarks) && cfg.landmarks.includes('greatwall'), 'ландмарк Велика стіна на карті', JSON.stringify(cfg.landmarks));
check(cfg.zombies > 0, 'зомбі на карті Китаю', String(cfg.zombies));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 КИТАЙ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
