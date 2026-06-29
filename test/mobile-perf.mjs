import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};

function pngSkySample(path) {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + len));
    offset += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const rows = Array.from({ length: height }, () => Buffer.alloc(stride));
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = rows[y];
    const prev = y > 0 ? rows[y - 1] : null;
    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? out[x - bytesPerPixel] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= bytesPerPixel ? prev[x - bytesPerPixel] : 0;
      let value;
      if (filter === 0) value = row[x];
      else if (filter === 1) value = row[x] + left;
      else if (filter === 2) value = row[x] + up;
      else if (filter === 3) value = row[x] + Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else {
        throw new Error(`Unsupported PNG filter=${filter}`);
      }
      out[x] = value & 255;
    }
  }

  const y = Math.min(24, height - 1);
  const samples = [];
  const step = Math.max(1, Math.floor(width / 20));
  for (let x = Math.floor(width / 4); x < Math.floor(width * 3 / 4); x += step) {
    const idx = x * bytesPerPixel;
    samples.push([rows[y][idx], rows[y][idx + 1], rows[y][idx + 2]]);
  }
  const avg = [0, 1, 2].map((i) => samples.reduce((sum, p) => sum + p[i], 0) / samples.length);
  return { avg, width, height };
}

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
const sky = pngSkySample(shotPath);

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
closeServer();
console.log(failed === 0 ? '🎉 MOBILE PERF OK' : `💥 MOBILE PERF FAILURES: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
