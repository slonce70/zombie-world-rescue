// Стрес-тест мобільного HUD: УСЕ ввімкнено одночасно, шукаємо перетини
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
for (const [name, w, h] of [['iphone', 844, 390], ['small', 740, 360], ['tablet', 1024, 768], ['big', 932, 430]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?test&fresh&touch&country=UKR`);
  await page.waitForFunction(() => window.__game?.level && window.__game.state === 'level', null, { timeout: 40000 });
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    g.test.god();
    // ВСЕ одразу: снайперка, бафи, броня, гаджет, комбо, орда, бос
    g.test.giveWeapon('sniper');
    p.switchWeapon('sniper');
    document.getElementById('tb-scope').classList.add('avail'); // примусово показуємо оптику, щоб тест реально перевіряв її позицію
    for (const k of Object.keys(p.buffs)) p.buffs[k] = 99;
    p.armor = 50;
    g.test.unlockGadget('shield');
    g.level.combo.n = 7;
    g.level.combo.t = 99;
    g.level.zombies.hordeActive = true;
    g.level.zombies.hordeRemaining = 12;
    g.level.missions.bossUnlocked = true;
    g.level.missions.bossStarted = true;
    g.level.zombies.spawnBoss();
    g.hud.showBoss(true);
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `shots/stress-${name}.png` });
  const overlaps = await page.evaluate(() => {
    const ids = [
      '#touch-ui .tb', '#tb-scope', '#ammo', '#health', '#minimap', '#mission-panel',
      '#coins', '#bossbar', '#horde-counter', '#combo', '#xp-chip',
    ];
    const els = [...document.querySelectorAll(ids.join(', '))];
    const vis = els.filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const rects = vis.map((e) => ({ id: e.id || e.className, r: e.getBoundingClientRect(), el: e }));
    const out = [];
    const isAncestor = (a, b) => a.el.contains(b.el) || b.el.contains(a.el);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      if (isAncestor(rects[i], rects[j])) continue;
      const a = rects[i].r, b = rects[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 5 && oy > 5) out.push(`${rects[i].id} <-> ${rects[j].id} (${Math.round(ox)}x${Math.round(oy)})`);
    }
    // елементи, що вилазять за екран
    for (const x of rects) {
      if (x.r.left < -2 || x.r.top < -2 || x.r.right > innerWidth + 2 || x.r.bottom > innerHeight + 2) {
        out.push(`OFFSCREEN: ${x.id} (${Math.round(x.r.left)},${Math.round(x.r.top)},${Math.round(x.r.right)},${Math.round(x.r.bottom)})`);
      }
    }
    return out;
  });
  if (overlaps.length) fail++;
  console.log(`${name} (${w}x${h}):`, overlaps.length ? overlaps : 'OK', errors.length ? 'ERRORS!' : '');
  await ctx.close();
}
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
