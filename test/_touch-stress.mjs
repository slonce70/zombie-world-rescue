// Мобільний HUD: базовий і максимальний стани на типових viewport-ах.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const viewports = [['iphone', 844, 390], ['small', 740, 360], ['tablet', 1024, 768], ['big', 932, 430]];
for (const stress of [false, true]) {
  for (const [name, w, h] of viewports) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/?test&fresh&touch&country=UKR`);
    await page.waitForFunction(() => window.__game?.level && window.__game.state === 'level', null, { timeout: 40000 });
    if (stress) await page.evaluate(() => {
      const g = window.__game;
      const p = g.level.player;
      g.test.god();
      g.test.giveWeapon('sniper');
      p.switchWeapon('sniper');
      document.getElementById('tb-scope').classList.add('avail');
      for (const k of Object.keys(p.buffs)) p.buffs[k] = 99;
      p.armor = 50;
      g.test.unlockGadget('shield');
      Object.assign(g.level.combo, { n: 7, t: 99 });
      Object.assign(g.level.zombies, { hordeActive: true, hordeRemaining: 12 });
      Object.assign(g.level.missions, { bossUnlocked: true, bossStarted: true });
      g.level.zombies.spawnBoss();
      g.hud.showBoss(true);
    });
    await page.waitForTimeout(stress ? 1800 : 2000);
    const scenario = stress ? 'stress' : 'touch';
    await page.screenshot({ path: `shots/${scenario}-${name}.png` });
    const overlaps = await page.evaluate((isStress) => {
      const selector = (isStress ? [
        '#touch-ui .tb', '#tb-scope', '#ammo', '#health', '#minimap', '#mission-panel',
        '#coins', '#bossbar', '#horde-counter', '#combo', '#xp-chip',
      ] : [
        '#touch-ui .tb', '#ammo', '#health', '#minimap', '#mission-panel', '#coins', '#grenades', '#kid-chip',
      ]).join(', ');
      const rects = [...document.querySelectorAll(selector)].filter((e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      }).map((el) => ({ id: el.id || el.className, r: el.getBoundingClientRect(), el }));
      const out = [];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 5 && oy > 5) out.push(`${a.id} <-> ${b.id} (${Math.round(ox)}x${Math.round(oy)})`);
      }
      for (const x of rects) if (x.r.left < -2 || x.r.top < -2 || x.r.right > innerWidth + 2 || x.r.bottom > innerHeight + 2) {
        out.push(`OFFSCREEN: ${x.id} (${Math.round(x.r.left)},${Math.round(x.r.top)},${Math.round(x.r.right)},${Math.round(x.r.bottom)})`);
      }
      return out;
    }, stress);
    if (overlaps.length || errors.length) fail++;
    console.log(`${scenario}-${name} (${w}x${h}):`, overlaps.length ? overlaps : 'OK', errors.length ? `ERRORS: ${errors.join('; ')}` : '');
    await ctx.close();
  }
}
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
