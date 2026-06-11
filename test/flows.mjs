// Додаткові сценарії: смерть/відродження, перезапуск боса, клік по глобусу, пауза, звук
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};
const state = () => page.evaluate(() => window.__game.test.state());
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

// === 1. Реальний клік по Україні на глобусі ===
console.log('▸ Глобус: реальний клік');
await page.goto(BASE + '/?test&fresh');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state === 'globe' && window.__game.globe.ready)), 20000, 'глобус готовий');
// Україна відцентрована — шукаємо її на екрані через picking (з ретраями)
let clickPos = null;
for (let attempt = 0; attempt < 5 && !clickPos; attempt++) {
  await page.waitForTimeout(800);
  clickPos = await page.evaluate(() => {
    const g = window.__game.globe;
    for (let sy = 0.25; sy <= 0.7; sy += 0.025) {
      for (let sx = 0.3; sx <= 0.7; sx += 0.02) {
        const ndc = { x: sx * 2 - 1, y: -(sy * 2 - 1) };
        g.raycaster.setFromCamera(ndc, g.camera);
        const hits = g.raycaster.intersectObject(g.sphere);
        if (hits.length) {
          const c = g.pickCountry(hits[0].uv);
          if (c && c.id === 'UKR') return { x: sx * innerWidth, y: sy * innerHeight };
        }
      }
    }
    return null;
  });
}
check(clickPos !== null, `знайшли Україну на екрані: ${JSON.stringify(clickPos)}`);
if (clickPos) {
  await page.mouse.move(clickPos.x, clickPos.y);
  await page.waitForTimeout(400);
  const tooltip = await page.evaluate(() => document.getElementById('globe-tooltip').textContent);
  check(tooltip.includes('Україна'), `tooltip: "${tooltip}"`);
  await page.mouse.down();
  await page.mouse.up();
  await waitFor(async () => (await state()).state === 'level', 20000, 'рівень після кліку');
  check((await state()).state === 'level', 'клік по Україні запускає рівень');
}
// фолбек, щоб решта сценаріїв виконалась навіть якщо клік не спрацював
if ((await state()).state !== 'level') {
  await page.evaluate(() => window.__game.startLevel('UKR'));
  await waitFor(async () => (await state()).state === 'level', 20000, 'рівень (фолбек)');
}

// === 2. Смерть і відродження ===
console.log('▸ Смерть і відродження');
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('rescue'); // прогрес, який має зберегтись
  g.level.player.takeDamage(99999, 0, 0);
});
await page.waitForTimeout(700);
const deathShown = await page.evaluate(() => document.getElementById('overlay-death').classList.contains('show'));
check(deathShown, 'оверлей смерті показано');
check((await state()).stats.deaths === 1, 'смерть зарахована');
await waitFor(async () => (await state()).player.health > 0, 35000, 'відродження');
let s = await state();
check(s.player.health > 0, 'живий після відродження');
check(Math.abs(s.player.x - 6) < 3 && Math.abs(s.player.z - 168) < 3, `відродився на спавні (${Math.round(s.player.x)},${Math.round(s.player.z)})`);
check(s.missions.find((m) => m.id === 'rescue').state === 'done', 'прогрес місій зберігся');
const deathHidden = await page.evaluate(() => !document.getElementById('overlay-death').classList.contains('show'));
check(deathHidden, 'оверлей смерті зник');

// === 3. Смерть у бою з босом → бос повертається на арену ===
console.log('▸ Перезапуск бою з босом');
await page.evaluate(() => {
  const g = window.__game;
  g.test.completeMission('tower');
  g.test.completeMission('warehouse');
});
await waitFor(async () => {
  await page.evaluate(() => window.__game.test.finishHorde());
  return await page.evaluate(() => window.__game.level.missions.bossUnlocked);
}, 40000, 'арена відкрита');
await page.evaluate(() => window.__game.test.teleport(-10, -168));
await waitFor(async () => (await state()).bossStarted, 10000, 'бос стартував');
check((await state()).bossStarted, 'бос з\'явився');
await page.evaluate(() => {
  window.__game.test.damageBoss(400); // б'ємо боса
  window.__game.level.player.respawnProtect = 0; // захист після відродження не має блокувати тест
  window.__game.level.player.takeDamage(99999, 0, 0); // і гинемо
});
await page.waitForTimeout(700);
s = await state();
check(!s.bossStarted, 'бій скинуто після смерті');
check(s.bossHp === null, 'боса деспавнено');
const beamBack = await page.evaluate(() => !!window.__game.level.missions.bossBeam);
check(beamBack, 'маркер арени повернувся');
await waitFor(async () => (await state()).player.health > 0, 35000, 'відродження 2');
await page.evaluate(() => window.__game.test.teleport(-10, -168));
await waitFor(async () => (await state()).bossStarted, 10000, 'бос вдруге');
s = await state();
check(s.bossStarted && s.bossHp !== null && s.bossHp <= 900, `бос повернувся з запам'ятованим HP: ${s.bossHp}`);

// === 4. Пауза ===
console.log('▸ Пауза');
await page.evaluate(() => window.__game.showPause());
await page.waitForTimeout(400);
const pauseVisible = await page.evaluate(() => document.getElementById('overlay-pause').classList.contains('show'));
check(pauseVisible, 'меню паузи показано');
await page.screenshot({ path: 'shots/flow-pause.png' });
await page.click('#btn-resume');
await page.waitForTimeout(300);
check(await page.evaluate(() => !window.__game.paused), 'продовжити працює');

// === 5. Магазин: усі товари ===
console.log('▸ Магазин: повний цикл покупок');
await page.evaluate(() => window.__game.test.giveCoins(3000));
await page.keyboard.press('KeyB');
await page.waitForTimeout(500);
for (const id of ['medkit', 'speed', 'damage', 'ammo']) {
  const before = await page.evaluate(() => window.__game.save.coins);
  // medkit при повному HP не продається — спершу пошкодимось
  if (id === 'medkit') await page.evaluate(() => { window.__game.level.player.health = 40; });
  await page.click(`.shop-item[data-id="${id}"]`);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.__game.save.coins);
  check(after < before, `купівля "${id}" (${before} → ${after})`);
}
const sm = await page.evaluate(() => ({
  speed: window.__game.level.player.speedMult,
  dmg: window.__game.level.player.damageMult,
  hp: window.__game.level.player.health,
}));
check(sm.speed > 1, `швидкість застосована: ${sm.speed}`);
check(sm.dmg > 1, `шкода застосована: ${sm.dmg}`);
check(sm.hp > 40, `аптечка вилікувала: ${sm.hp}`);
await page.keyboard.press('KeyB');

// === 6. Звук: ensure + кілька ефектів без помилок ===
console.log('▸ Звук');
const audioOk = await page.evaluate(() => {
  try {
    const a = window.__game.audio;
    a.setMuted(false);
    a.ensure();
    a.shot('pistol'); a.shot('rifle'); a.coin(); a.mission(); a.zgroan(1, 1);
    a.bossRoar(); a.victory(); a.setMode('battle');
    a.setMuted(true);
    return a.ctx !== null;
  } catch (e) { return 'ERR: ' + e.message; }
});
check(audioOk === true, `аудіо-граф працює: ${audioOk}`);

console.log('');
console.log(failed === 0 ? '🎉 ВСІ СЦЕНАРІЇ ПРОЙДЕНО' : `❌ ПРОВАЛЕНО: ${failed}`);
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
