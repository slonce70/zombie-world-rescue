import { chromium } from 'playwright';
const browser = await chromium.launch();
let fail = 0;
for (const [name, w, h] of [['iphone-land', 844, 390], ['small-land', 740, 360], ['tablet-land', 1024, 768], ['big-phone', 932, 430]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8741/?test&fresh&touch&country=UKR');
  await page.waitForFunction(() => window.__game?.level && window.__game.state === 'level', null, { timeout: 40000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `shots/touch-${name}.png` });
  const overlaps = await page.evaluate(() => {
    const sel = '#touch-ui .tb, #ammo, #health, #minimap, #mission-panel, #coins, #grenades, #kid-chip';
    const els = [...document.querySelectorAll(sel)];
    const rects = els.map(e => ({ id: e.id || e.className, r: e.getBoundingClientRect() })).filter(x => x.r.width > 0 && x.r.height > 0);
    const out = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, b = rects[j].r;
      if ((rects[i].id === 'grenades' || rects[j].id === 'grenades') && (rects[i].id === 'ammo' || rects[j].id === 'ammo')) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) out.push(`${rects[i].id} <-> ${rects[j].id} (${Math.round(ox)}x${Math.round(oy)}px)`);
    }
    return out;
  });
  if (overlaps.length) fail++;
  console.log(`${name} (${w}x${h}):`, overlaps.length ? overlaps : 'OK — без перетинів', errors.length ? `ERRORS: ${errors.join('; ')}` : '');
  await ctx.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
