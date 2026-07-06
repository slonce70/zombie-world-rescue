// 🪧 Черга банерів (v299): banner() ставить у чергу, поки поточний показується <1.6с;
// prio≥1 перебиває одразу (витіснений — назад у чергу); переповнення (макс 3) викидає
// найстаріший низькопріоритетний; clearBanners() чистить усе. Драйвимо hud._updateBanner(dt)
// напряму — детерміновано, без залежності від rAF/таймерів.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg, d = '') => { console.log(ok ? '  ✅' : '  ❌', msg, d); if (!ok) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Черга банерів');

// 1. Два банери поспіль → другий у черзі; показується після 1.6с
const r1 = await page.evaluate(() => {
  const h = window.__game.hud;
  h.clearBanners();
  h.banner('A', 'a', 3.2);
  h.banner('B', 'b', 3.2);
  const afterTwo = { cur: h._bnCur.title, qlen: h._bnQueue.length };
  h._updateBanner(1.0);                 // 1.0с < 1.6 → досі A
  const at10 = h._bnCur.title;
  h._updateBanner(0.7);                 // 1.7с ≥ 1.6 і є черга → перемикаємось на B
  const at17 = { cur: h._bnCur.title, qlen: h._bnQueue.length };
  return { afterTwo, at10, at17 };
});
check(r1.afterTwo.cur === 'A' && r1.afterTwo.qlen === 1, '1: другий банер став у чергу (показується A)', JSON.stringify(r1.afterTwo));
check(r1.at10 === 'A', '1: до 1.6с усе ще показується перший', r1.at10);
check(r1.at17.cur === 'B' && r1.at17.qlen === 0, '1: після 1.6с показується другий', JSON.stringify(r1.at17));

// 2. prio=1 перебиває поточний одразу; витіснений повертається в чергу
const r2 = await page.evaluate(() => {
  const h = window.__game.hud;
  h.clearBanners();
  h.banner('A', '', 3.2);               // звичайний показується
  h.banner('P', '', 3.2, { prio: 1 }); // пріоритетний — одразу
  return { cur: h._bnCur.title, prio: h._bnCur.prio, qFront: h._bnQueue[0] && h._bnQueue[0].title, qlen: h._bnQueue.length };
});
check(r2.cur === 'P' && r2.prio === 1, '2: prio=1 показується одразу', JSON.stringify(r2));
check(r2.qFront === 'A' && r2.qlen === 1, '2: витіснений A повернувся в чергу', JSON.stringify(r2));

// 3. Переповнення черги (макс 3) викидає найстаріший низькопріоритетний
const r3 = await page.evaluate(() => {
  const h = window.__game.hud;
  h.clearBanners();
  h.banner('cur', '', 3.2);             // показується
  h.banner('q1'); h.banner('q2'); h.banner('q3'); h.banner('q4'); // 4 у чергу при макс 3
  return { qlen: h._bnQueue.length, titles: h._bnQueue.map((b) => b.title) };
});
check(r3.qlen === 3, '3: черга обмежена 3', JSON.stringify(r3));
check(r3.titles[0] === 'q2' && r3.titles[2] === 'q4', '3: викинуто найстаріший (q1)', JSON.stringify(r3));

// 4. clearBanners() чистить поточний і чергу
const r4 = await page.evaluate(() => {
  const h = window.__game.hud;
  h.banner('x'); h.banner('y');
  h.clearBanners();
  return { cur: h._bnCur, qlen: h._bnQueue.length, shown: document.getElementById('banner').classList.contains('show') };
});
check(r4.cur === null && r4.qlen === 0 && !r4.shown, '4: clearBanners чистить усе', JSON.stringify(r4));

check(errors.length === 0, 'без JS-помилок', errors.join(' | '));

await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
