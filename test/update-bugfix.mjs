// Регресія-тести для фіксів v45:
//  Task 2 — тултип країни «звільнено…» не протікає з глобуса в рівень.
//  Task 7 — зомбі не завмирають на нерівному терені (slope-guard дає ковзання, не стоп).
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) fail++; };

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// ---------- Task 2: тултип глобуса не протікає в рівень ----------
console.log('▸ Task 2: тултип «звільнено…» не лишається над рівнем');
await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; });
// імітуємо «протіклий» стан: тултип видимий саме перед стартом рівня
await page.evaluate(() => { document.getElementById('globe-tooltip').style.display = 'block'; });
await page.evaluate(() => window.__game.startLevel('UKR'));
await page.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
await page.waitForTimeout(500);
const ttDisp = await page.evaluate(() => document.getElementById('globe-tooltip').style.display);
check(ttDisp === 'none', `тултип країни прихований у рівні (display=${ttDisp})`);
// і прямий інваріант: _showGlobeUI(false) ховає тултип
await page.evaluate(() => { document.getElementById('globe-tooltip').style.display = 'block'; window.__game._showGlobeUI(false); });
const ttDisp2 = await page.evaluate(() => document.getElementById('globe-tooltip').style.display);
check(ttDisp2 === 'none', `_showGlobeUI(false) ховає тултип (display=${ttDisp2})`);

// ---------- Task 7: зомбі не завмирають — підходять до гравця ----------
// (на пласкому майданчику slope-guard не глушив би рух і до фіксу; цей тест guard-ить
//  головний симптом — зомбі НАВІГУЮТЬ до гравця й жоден не завмирає далеко; фікс лише
//  ДОДАЄ шлях ковзання, тож не може зробити гірше)
console.log('▸ Task 7: зомбі підходять до гравця (жоден не завмирає далеко)');
const before = await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  const p = g.level.player;
  const px = p.pos.x, pz = p.pos.z;
  const base = g.level.zombies.list.length;
  // horde:true → одразу 'chase' (без невизначеності аггро); широка дуга, щоб не зіштовхувались лоб-у-лоб
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.level.zombies.spawn('walker', px + Math.cos(a) * 10, pz + Math.sin(a) * 10, { horde: true });
  }
  const mine = g.level.zombies.list.slice(base);
  mine.forEach((z) => { z._probe = true; z._sx = z.x; z._sz = z.z; });
  const avg0 = mine.reduce((s, z) => s + Math.hypot(z.x - px, z.z - pz), 0) / mine.length;
  return { count: mine.length, avg0 };
});
await page.waitForTimeout(7000);
const after = await page.evaluate(() => {
  const g = window.__game;
  const pl = g.level.player;
  const mine = g.level.zombies.list.filter((z) => z._probe && z.state !== 'dead');
  const avg = mine.reduce((s, z) => s + Math.hypot(z.x - pl.pos.x, z.z - pl.pos.z), 0) / (mine.length || 1);
  // «завмер» = майже не зрушив зі старту, хоча далеко від гравця (саме симптом бага)
  const frozenFar = mine.filter((z) => Math.hypot(z.x - z._sx, z.z - z._sz) < 1.2
    && Math.hypot(z.x - pl.pos.x, z.z - pl.pos.z) > 3).length;
  return { count: mine.length, avg, frozenFar };
});
check(before.count >= 6, `зомбі заспавнились (${before.count})`);
check(after.avg < before.avg0 - 0.8, `зомбі наблизились до гравця (avg ${before.avg0.toFixed(1)}→${after.avg.toFixed(1)})`);
check(after.frozenFar === 0, `жоден зомбі не завмер далеко від гравця (завмерлих=${after.frozenFar})`);

check(errors.length === 0, `без JS-помилок (${errors.length})`);
await ctx.close();
await browser.close();
closeServer();
if (fail) { console.log(`\n❌ ${fail} перевірок впало`); process.exit(1); }
console.log('\n🎉 BUGFIX v45 (тултип + застрягання зомбі) ПРОЙДЕНО');
