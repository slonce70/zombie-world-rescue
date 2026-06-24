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

console.log('▸ Конфіг Португалії');
await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

const cfg = await page.evaluate(async () => {
  const mod = await import('/src/countries.js');
  const C = mod.COUNTRIES.PRT;
  const order = mod.CAMPAIGN_ORDER;
  return {
    exists: !!C,
    id: C && C.id,
    name: C && C.name,
    flag: C && C.flag,
    biome: C && C.biome,
    hasBiome: !!mod.BIOMES[C && C.biome],
    coin: C && C.coinReward,
    reward: C && C.weaponReward,
    extra: C && C.extraZombie,
    bossStyle: C && C.boss.style,
    bossHp: C && C.boss.hp,
    diff: C && C.difficulty,
    order,
    idx: order.indexOf('PRT'),
    espDiff: mod.COUNTRIES.ESP.difficulty,
    itaDiff: mod.COUNTRIES.ITA.difficulty,
  };
});
check(cfg.exists && cfg.id === 'PRT', 'COUNTRIES.PRT існує', JSON.stringify(cfg));
check(cfg.name === 'Португалія' && cfg.flag === '🇵🇹', 'назва і прапор Португалії', JSON.stringify({ name: cfg.name, flag: cfg.flag }));
check(cfg.biome === 'spainSun' && cfg.hasBiome, 'біом spainSun зареєстровано', cfg.biome);
check(!cfg.reward && cfg.coin === 650, 'нагорода — 650 монет, без weaponReward', JSON.stringify({ reward: cfg.reward, coin: cfg.coin }));
check(cfg.extra === 'toro', 'extraZombie = toro', cfg.extra);
check(cfg.bossStyle === 'matador' && cfg.bossHp > 0, `бос matador, ${cfg.bossHp} HP`);
check(cfg.idx === 5 && cfg.order[4] === 'ESP' && cfg.order[6] === 'ITA',
  `PRT стоїть після ESP, перед ITA: ${cfg.order.join('→')}`);
const mono = cfg.diff && cfg.espDiff.hp < cfg.diff.hp && cfg.diff.hp < cfg.itaDiff.hp
  && cfg.espDiff.dmg < cfg.diff.dmg && cfg.diff.dmg < cfg.itaDiff.dmg
  && cfg.espDiff.counts < cfg.diff.counts && cfg.diff.counts < cfg.itaDiff.counts;
check(mono, `складність ESP < PRT < ITA (${JSON.stringify(cfg.diff)})`);

console.log('▸ Рівень PRT завантажується');
await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; });
await page.evaluate(() => window.__game.startLevel('PRT'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level
  && !document.getElementById('overlay-level-loading').classList.contains('show'), null, { timeout: 40000 });
await page.evaluate(() => window.__game.test.god());
await page.waitForTimeout(500);

const world = await page.evaluate(() => {
  const w = window.__game.level.world;
  return {
    country: window.__game.level.countryId,
    fountain: !!w.fountain,
    floors: w.floors.length,
    loot: w.lootSpots.length,
    landmarks: window.__game.level.country.map.landmarks,
    boss: window.__game.level.country.boss.name,
    zombies: window.__game.level.zombies.list.length,
  };
});
check(world.country === 'PRT', 'граємо PRT', JSON.stringify(world));
check(world.fountain, '⛲ площа з фонтаном збудована');
check(world.landmarks.includes('cathedral') && world.landmarks.includes('oliveGrove')
  && world.landmarks.includes('plazaFountain') && world.landmarks.includes('birds'),
  `португальські лендмарки: ${world.landmarks.join(', ')}`);
check(world.floors >= 4 && world.loot >= 2, `рівень має дахи/лут (${world.floors}/${world.loot})`);
check(world.zombies > 30, `на рівні є зомбі: ${world.zombies}`);

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ПОРТУГАЛІЯ ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
