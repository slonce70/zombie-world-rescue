// Додаткові сценарії: смерть/відродження, перезапуск боса, клік по глобусу, пауза, звук
import { chromium } from 'playwright';
import { waitFor as waitForAsync, makeCheck } from './_browser.mjs';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
// SLOW=N множить усі таймаути: на CI-ранері з софтверним рендером ігровий час
// тече ~4× повільніше, тож фіксовані очікування мають чекати у N разів довше.
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = makeCheck(() => failed++);
const state = () => page.evaluate(() => window.__game.test.state());
const waitFor = (fn, timeoutMs, label) => waitForAsync(fn, timeoutMs * SLOW, label, 300);

// === 1. Реальний клік по Україні на глобусі ===
console.log('▸ Глобус: реальний клік');
await page.goto(BASE + '/?test&fresh');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state === 'globe' && window.__game.globe.ready)), 20000, 'глобус готовий');
// Україна відцентрована — шукаємо її на екрані через picking (з ретраями).
// Камера глобуса повільно «дихає» по вертикалі, тож ПЕРШИЙ знайдений піксель —
// це верхній край України, тобто кордон з Білоруссю: поки тест наведе мишу й
// клікне, точка вже над сусідом і рівень не стартує. Беремо центр усіх
// українських пікселів — від дихання камери він не з'їжджає.
let clickPos = null;
for (let attempt = 0; attempt < 5 && !clickPos; attempt++) {
  await page.waitForTimeout(800);
  clickPos = await page.evaluate(() => {
    const g = window.__game.globe;
    const pickAt = (px, py) => {
      g.raycaster.setFromCamera({ x: (px / innerWidth) * 2 - 1, y: -(py / innerHeight) * 2 + 1 }, g.camera);
      const hits = g.raycaster.intersectObject(g.sphere);
      return hits.length ? g.pickCountry(hits[0].uv) : null;
    };
    const pts = [];
    for (let sy = 0.25; sy <= 0.7; sy += 0.005) {
      for (let sx = 0.3; sx <= 0.7; sx += 0.005) {
        const px = sx * innerWidth, py = sy * innerHeight;
        const c = pickAt(px, py);
        if (c && c.id === 'UKR') pts.push({ x: px, y: py });
      }
    }
    if (!pts.length) return null;
    const mid = {
      x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
      y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
    };
    const at = pickAt(mid.x, mid.y);
    return at && at.id === 'UKR' ? mid : pts[Math.floor(pts.length / 2)];
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
  // 'rescue' уже виконано вище; решту сюжетних цілей закриваємо ПО ЧЕРЗІ —
  // в України їх чотири (додалась «віднови центр міста»), і поки остання
  // активна, арена боса не відкриється
  const ms = g.level.missions;
  const ids = ms.objectives && ms.objectives.length
    ? ms.objectives.map((o) => o.id)
    : ['tower', 'warehouse'];
  for (const id of ids) g.test.completeMission(id);
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
check(s.bossStarted && s.bossHp !== null && s.bossHp <= 1400, `бос повернувся з запам'ятованим HP: ${s.bossHp}`);

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
for (const id of ['grenade', 'speed', 'damage']) {
  const before = await page.evaluate(() => window.__game.save.coins);
  // вкладки: шукаємо товар по всіх категоріях
  await page.evaluate((itemId) => {
    const tabs = [...document.querySelectorAll('.shop-tab')];
    for (const t of tabs) {
      t.click();
      if (document.querySelector(`.shop-item[data-id="${itemId}"]`)) return;
    }
  }, id);
  await page.waitForTimeout(250);
  await page.click(`.shop-item[data-id="${id}"]`);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.__game.save.coins);
  check(after < before, `купівля "${id}" (${before} → ${after})`);
}
const sm = await page.evaluate(() => ({
  speed: window.__game.level.player.speedMult,
  dmg: window.__game.level.player.damageMult,
  grenades: window.__game.level.player.grenades,
}));
check(sm.speed > 1, `швидкість застосована: ${sm.speed}`);
check(sm.dmg > 1, `шкода застосована: ${sm.dmg}`);
check(sm.grenades > 0, `граната додана: ${sm.grenades}`);
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
closeServer();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
