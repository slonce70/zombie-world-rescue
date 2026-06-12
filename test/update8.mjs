// 🇹🇷🇪🇬🌙 Тести оновлення 8: Туреччина, Єгипет, цикл день/ніч, мумії, піраміда
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:8741';
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failed = 0;
const check = (ok, name) => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) failed++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 🇹🇷 ТУРЕЧЧИНА =====
console.log('▸ Туреччина');
await page.goto(`${BASE}/?test&fresh&country=TUR`);
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 40000 });
await page.waitForTimeout(2500);
const tur = await page.evaluate(() => {
  const g = window.__game;
  const w = g.level.world;
  return {
    country: g.level.countryId,
    zombies: g.test.state().zombies,
    balloons: w.balloonsExtra ? w.balloonsExtra.length : 0,
    // вежа Галата: високий поверх-майданчик
    galataDeck: w.floors.some((f) => f.top > w.groundH(112, -92) + 11 && Math.abs(f.x - 112) < 3),
    // базар додав лут і сюрприз
    bazaarLoot: w.lootSpots.filter((ls) => Math.abs(ls.x + 56) < 16 && Math.abs(ls.z + 10) < 10).length,
    animals: g.level.effects.animals ? g.level.effects.animals.length : 0,
    food: g.level.country.food,
  };
});
check(tur.country === 'TUR' && tur.zombies > 30, `рівень живий (зомбі: ${tur.zombies})`);
check(tur.balloons === 4, `кулі Каппадокії в небі (${tur.balloons})`);
check(tur.galataDeck, 'вежа Галата має оглядовий майданчик');
check(tur.bazaarLoot >= 3, `Великий базар ховає лут (${tur.bazaarLoot})`);
check(tur.animals === 6, `вуличні котики гуляють (${tur.animals})`);
check(tur.food === 'лукум', `смаколик країни: ${tur.food}`);

// бос Паша Кебаб кидає шампури
const sultan = await page.evaluate(() => {
  const b = window.__game.level.zombies.spawnBoss();
  return { style: b.bossStyle, hp: b.maxHp, ranged: !!b.ranged, projColor: b.ranged && b.ranged.color };
});
check(sultan.style === 'sultan' && sultan.hp === 5200, `ПАША КЕБАБ (${sultan.hp} HP)`);
check(sultan.ranged, 'Паша кидає шампури (дальній бій)');

// ===== 🇪🇬 ЄГИПЕТ =====
console.log('▸ Єгипет');
await page.goto(`${BASE}/?test&fresh&country=EGY`);
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 40000 });
await page.waitForTimeout(2500);
const egy = await page.evaluate(() => {
  const g = window.__game;
  const w = g.level.world;
  const pyrFloors = w.floors.filter((f) => Math.abs(f.x - 62) < 2 && Math.abs(f.z + 110) < 2);
  return {
    country: g.level.countryId,
    zombies: g.test.state().zombies,
    pyramidLayers: pyrFloors.length,
    dust: !!w.dustMode,
    pond: !!w.pond, // вода в оазі
    animals: g.level.effects.animals ? g.level.effects.animals.length : 0,
  };
});
check(egy.country === 'EGY' && egy.zombies > 30, `рівень живий (зомбі: ${egy.zombies})`);
check(egy.pyramidLayers === 13, `піраміда має 13 уступів (${egy.pyramidLayers})`);
check(egy.dust, 'піщана імла висить у повітрі');
check(egy.pond, 'в оазі є вода');
check(egy.animals === 6, `верблюди пасуться (${egy.animals})`);

// 🧗 сходження на піраміду стрибками
const climb = await page.evaluate(async () => {
  const g = window.__game;
  g.test.god();
  const slp = (ms) => new Promise((r) => setTimeout(r, ms));
  g.test.teleport(62, -89);
  g.level.player.yaw = 0;
  await slp(300);
  const y0 = g.level.player.pos.y;
  for (let i = 0; i < 10; i++) {
    g.test.key('KeyW', true);
    g.input.justPressed.add('Space');
    await slp(560);
  }
  g.test.key('KeyW', false);
  return { y0, y1: g.level.player.pos.y };
});
check(climb.y1 > climb.y0 + 3.5, `на піраміду можна вилізти стрибками (y +${(climb.y1 - climb.y0).toFixed(1)}м)`);

// 🧻 мумія: спавн, статистика, вигляд
const mummy = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const m = g.test.spawnZombie('mummy', p.x + 6, p.z);
  return { hp: m.maxHp, type: m.type, dmg: m.stats.dmg };
});
check(mummy.type === 'mummy' && mummy.hp > 200, `мумія жилава (${mummy.hp} HP з множником країни)`);

// бос Фараон
const pharaoh = await page.evaluate(() => {
  const b = window.__game.level.zombies.spawnBoss();
  return { style: b.bossStyle, hp: b.maxHp, ranged: !!b.ranged };
});
check(pharaoh.style === 'pharaoh' && pharaoh.hp === 6400, `ФАРАОН ТУТ-АНХ-ЗОМБ (${pharaoh.hp} HP)`);
check(pharaoh.ranged, 'Фараон насилає скарабеїв');

// ===== 🌙 ДЕНЬ/НІЧ =====
console.log('▸ Цикл день/ніч');
const day = await page.evaluate(() => ({
  nightK: window.__game.test.state().nightK,
  sun: window.__game.level.world.sun.intensity,
  stars: window.__game.level.world.stars.material.opacity,
}));
check(day.nightK === 0 && day.stars === 0, `вдень зорі сховані (nightK ${day.nightK})`);

await page.evaluate(() => window.__game.test.setLevelTime(160)); // глибока ніч
await page.waitForTimeout(900);
const night = await page.evaluate(() => {
  const g = window.__game;
  const w = g.level.world;
  return {
    nightK: g.test.state().nightK,
    sun: Math.round(w.sun.intensity * 100) / 100,
    sunDay: w.biome.sunIntensity,
    stars: Math.round(w.stars.material.opacity * 100) / 100,
    moon: Math.round(w.moon.material.opacity * 100) / 100,
    lamp: Math.round(g.level.player.lamp.intensity),
    lampGlow: Math.round(w.lampHeadM.emissiveIntensity * 10) / 10,
  };
});
check(night.nightK === 1, `ніч настала (nightK ${night.nightK})`);
check(night.sun < night.sunDay * 0.3, `сонце пригасло (${night.sun} з ${night.sunDay})`);
check(night.stars > 0.8 && night.moon > 0.8, `зорі й місяць на небі (✨${night.stars} 🌙${night.moon})`);
check(night.lamp >= 40, `ліхтарик гравця світить (${night.lamp})`);
check(night.lampGlow > 2, `вуличні ліхтарі розгорілись (${night.lampGlow})`);

// 🌙 вночі зомбі бачать далі: ставимо зомбі на 26м (день: aggro 20 — не бачить)
const aggro = await page.evaluate(async () => {
  const g = window.__game;
  const slp = (ms) => new Promise((r) => setTimeout(r, ms));
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('walker', p.x + 26, p.z);
  z.sleeping = false;
  await slp(1500);
  return z.state;
});
check(aggro === 'chase', `вночі зомбі помічає гравця з 26 метрів (${aggro})`);

// світанок повертає день
await page.evaluate(() => window.__game.test.setLevelTime(10));
await page.waitForTimeout(900);
const dawn = await page.evaluate(() => window.__game.test.state().nightK);
check(dawn === 0, `світанок повертає день (nightK ${dawn})`);

// ===== кампанія тягнеться до Туреччини і Єгипту =====
console.log('▸ Порядок кампанії');
const order = await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true };
  g.saveGame();
  return null;
});
void order;
await page.goto(`${BASE}/?test`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
const target = await page.evaluate(() => window.__game.globe.targetId);
check(target === 'TUR', `після Франції ціль — Туреччина (${target})`);

console.log('');
const realErrors = errors.filter((e) => !e.includes('favicon'));
if (realErrors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of realErrors.slice(0, 10)) console.log('  ', e);
  failed += realErrors.length;
} else {
  console.log('✅ Без помилок у консолі');
}
console.log(failed === 0 ? '🎉 УСІ ТЕСТИ ОНОВЛЕННЯ 8 ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
