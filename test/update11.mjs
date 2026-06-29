// Быстрая проверка новых типов миссий v16
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let failed = 0;
const check = (ok, msg) => { console.log(ok ? '  ✅' : '  ❌', msg); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Ролл: каждая страна получает фирменную миссию + слот D
await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
const rolls = await page.evaluate(() => {
  const out = {};
  for (const c of ['UKR', 'POL', 'DEU', 'FRA', 'TUR', 'EGY']) {
    out[c] = window.__game.test.rollMissions(c, 1234, 1);
  }
  out.tutorial = window.__game.test.rollMissions('UKR', 1234, 0);
  return out;
});
check(rolls.tutorial.length === 3 && rolls.tutorial[0] === 'rescue', `туторіал UKR незмінний: ${rolls.tutorial}`);
const SPECIALS = { UKR: 'well', POL: 'bonfire', DEU: 'convoy', FRA: 'balloon', TUR: 'bazaar', EGY: 'tomb' };
for (const [c, sp] of Object.entries(SPECIALS)) {
  check(rolls[c].includes(sp), `${c}: фірмова місія ${sp} у наборі [${rolls[c]}]`);
  check(rolls[c].length === 4, `${c}: 4 місії (з бонусною)`);
}

// 2. activate-движок (well) играется руками: телепорт к точке, держим E
console.log('▸ Граємо well (активуй точки)');
await page.evaluate(() => { window.__game.test.forceMissions(['well', 'repair', 'clear']); window.__game.startLevel('UKR'); });
await page.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
await sleep(800);
let st = await page.evaluate(() => {
  const m = window.__game.level.missions.missions[0];
  return { type: m.type, points: m.points.length, title: m.title };
});
check(st.type === 'well' && st.points === 3, `well створено: ${st.points} колодязі`);
// активируем все 3 точки удержанием E
for (let i = 0; i < 3; i++) {
  await page.evaluate((i) => {
    const g = window.__game;
    const p = g.level.missions.missions[0].points[i];
    g.test.god();
    g.test.teleport(p.x + 1, p.z);
  }, i);
  await page.evaluate(() => window.__game.test.key('KeyE', true));
  await page.waitForFunction((i) => window.__game.level.missions.missions[0].points[i].done, i, { timeout: 30000 }).catch(() => null);
  await page.evaluate(() => window.__game.test.key('KeyE', false));
}
st = await page.evaluate(() => {
  const m = window.__game.level.missions.missions[0];
  return { activated: m.activated, done: m.state === 'done' };
});
check(st.activated === 3 && st.done, `well виконано руками (${st.activated}/3)`);

// 3. fetch-движок (tomb): собрать печатки + здать
console.log('▸ Граємо tomb (знайди та принеси)');
await page.evaluate(() => { window.__game.endLevel(); });
await sleep(500);
await page.evaluate(() => { window.__game.test.forceMissions(['rescue', 'tomb', 'clear']); window.__game.startLevel('EGY'); });
await page.waitForFunction(() => window.__game.state === 'level', null, { timeout: 40000 });
await sleep(800);
st = await page.evaluate(() => {
  const m = window.__game.level.missions.missions[1];
  return { type: m.type, items: m.items.length, dest: !!m.dest.ring };
});
check(st.type === 'tomb' && st.items === 2 && st.dest, 'tomb створено: 2 печатки + точка здачі');
for (let i = 0; i < 2; i++) {
  await page.evaluate((i) => {
    const g = window.__game;
    const it = g.level.missions.missions[1].items[i];
    g.test.god();
    g.test.teleport(it.x + 1, it.z);
  }, i);
  await page.waitForFunction((i) => {
    const g = window.__game;
    const m = g.level.missions.missions[1];
    if (m.items[i].taken) return true;
    g.input.justPressed.add('KeyE');
    return false;
  }, i, { timeout: 20000 }).catch(() => null);
}
st = await page.evaluate(() => window.__game.level.missions.missions[1].found);
check(st === 2, `обидві печатки зібрано (${st}/2)`);
// здача у гробницы
await page.evaluate(() => {
  const g = window.__game;
  const d = g.level.missions.missions[1].dest;
  g.test.teleport(d.x + 1, d.z);
  g.test.key('KeyE', true);
});
await page.waitForFunction(() => window.__game.level.missions.missions[1].state === 'done', null, { timeout: 40000 }).catch(() => null);
st = await page.evaluate(() => ({
  done: window.__game.level.missions.missions[1].state === 'done',
  zombies: window.__game.level.zombies.list.filter((z) => z.state !== 'dead').length,
}));
check(st.done, 'гробницю відкрито (місія done)');
await page.screenshot({ path: 'shots/new-missions-tomb.png' });

console.log('');
check(errs.length === 0, `без JS-помилок (${errs.slice(0, 2).join('|')})`);
console.log(failed === 0 ? '🎉 НОВІ МІСІЇ ПРАЦЮЮТЬ' : `❌ ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
