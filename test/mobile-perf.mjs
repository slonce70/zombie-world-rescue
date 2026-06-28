import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};

const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(err.message));

await page.goto(`${BASE}/?test&fresh&touch&country=UKR&lang=uk`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });
await page.waitForTimeout(2500);

const metrics = await page.evaluate(() => {
  const g = window.__game;
  return {
    state: g.test.state().state,
    cameraFar: g.level.player.camera.far,
    pixelRatio: g.pixelRatio,
    calls: g.renderer.info.render.calls,
    triangles: g.renderer.info.render.triangles,
    geometries: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
  };
});
const shotPath = '/tmp/zwr-mobile-perf-sky.png';
await page.screenshot({ path: shotPath, fullPage: false });
const sky = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
im = Image.open('${shotPath}').convert('RGB')
w, _ = im.size
pts = [im.getpixel((x, 24)) for x in range(w//4, w*3//4, max(1, w//20))]
avg = tuple(sum(p[i] for p in pts) / len(pts) for i in range(3))
print(json.dumps({'avg': avg}))
`], { encoding: 'utf8' }));

console.log('▸ Mobile perf metrics', JSON.stringify(metrics));
console.log('▸ Mobile sky sample', JSON.stringify(sky));
check(errors.length === 0, 'немає console/page errors', JSON.stringify(errors));
check(metrics.state === 'level', 'mobile level завантажено');
check(sky.avg[2] > 70 && sky.avg[0] > 20, 'mobile небо не обрізається чорним far plane', JSON.stringify(sky));
check(metrics.cameraFar <= 220, 'mobile камера не малює дальню непотрібну сцену');
check(metrics.calls <= 420, 'mobile draw calls у бюджеті', `calls=${metrics.calls}`);
check(metrics.triangles <= 540000, 'mobile triangles у бюджеті', `triangles=${metrics.triangles}`);

await ctx.close();
await browser.close();
console.log(failed === 0 ? '🎉 MOBILE PERF OK' : `💥 MOBILE PERF FAILURES: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
