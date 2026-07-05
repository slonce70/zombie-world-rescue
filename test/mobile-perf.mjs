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
await page.waitForFunction(() => window.__game?.renderer?.info?.render?.calls > 0, null, { timeout: 10000 });
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

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
// v284 rigid-bind SkinnedMesh (58c73e8): 1 draw call/зомбі замість 7 — реальні заміри
// 7×поспіль дали 252-265 (джитер — спавн-RNG типів місії/будинків); бюджет = max+~10%.
check(metrics.calls <= 290, 'mobile draw calls у бюджеті', `calls=${metrics.calls}`);
check(metrics.triangles <= 560000, 'mobile triangles у бюджеті', `triangles=${metrics.triangles}`);

const lostPage = await ctx.newPage();
await lostPage.goto(`${BASE}/?test&fresh&touch&country=LOST&lang=uk`, { waitUntil: 'domcontentloaded' });
await lostPage.waitForFunction(() => window.__game?.state === 'level', null, { timeout: 30000 });
await lostPage.waitForFunction(() => window.__game?.renderer?.info?.render?.calls > 0, null, { timeout: 10000 });
await lostPage.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const lost = await lostPage.evaluate(() => {
  const g = window.__game;
  return {
    country: g.test.state().country,
    state: g.test.state().state,
    calls: g.renderer.info.render.calls,
    triangles: g.renderer.info.render.triangles,
  };
});
await lostPage.close();

console.log('▸ Mobile LOST metrics', JSON.stringify(lost));
check(lost.state === 'level' && lost.country === 'LOST', 'LOST острів завантажено на реальній щільності', JSON.stringify(lost));
// реальні заміри 7×поспіль: 220-229; бюджет = max+~10% (SkinnedMesh-зомбі — 1 draw call замість 7)
check(lost.calls <= 255, 'LOST draw calls у бюджеті', `calls=${lost.calls}`);
check(lost.triangles <= 685000, 'LOST triangles у бюджеті', `triangles=${lost.triangles}`);

const heavy = await page.evaluate(async () => {
  const g = window.__game;
  const l = g.level;
  const p = l.player;
  p.pos.x = 0;
  p.pos.z = 0;
  p.pos.y = l.world.groundH(0, 0);
  l.gadgets._placeMine();
  p.pos.x = 3;
  l.gadgets._placeMine();
  p.pos.x = -3;
  l.gadgets._placeHealTotem();
  p.pos.x = 3;
  l.gadgets._placeDamageTotem();
  p.pos.x = 0;
  p.pos.z = 0;
  l.gadgets._placeSoulMagnet();
  l.gadgets._addMeteorFire(2, 2, true, 8, 3.2);
  l.gadgets._addMeteorFire(-2, 2, true, 8, 3.2);
  for (let i = 0; i < 36; i++) {
    const a = (Math.PI * 2 * i) / 36;
    const z = l.zombies.spawn(i % 5 === 0 ? 'runner' : i % 7 === 0 ? 'tank' : 'walker', Math.cos(a) * 12, Math.sin(a) * 12, { horde: true });
    z.aggroed = true;
    z.state = 'chase';
  }
  l.zombies.hordeActive = true;
  l.zombies.hordeRemaining = l.zombies.list.filter((z) => z.horde && z.state !== 'dead').length;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    zombies: l.zombies.list.filter((z) => z.horde && z.state !== 'dead').length,
    mines: l.gadgets.mines.length,
    totems: l.gadgets.totems.length + l.gadgets.damageTotems.length,
    magnets: l.gadgets.soulMagnets.length,
    fires: l.gadgets._meteorFires.length,
    calls: g.renderer.info.render.calls,
    triangles: g.renderer.info.render.triangles,
    textures: g.renderer.info.memory.textures,
  };
});

console.log('▸ Mobile heavy metrics', JSON.stringify(heavy));
check(heavy.zombies >= 36 && heavy.mines >= 2 && heavy.totems >= 2 && heavy.magnets >= 1 && heavy.fires >= 2,
  'mobile heavy state: horde + mines/totems/soulmagnet/fire активні', JSON.stringify(heavy));
// 36 зомбі-орда (кожен — 1 SkinnedMesh) + мінне поле/тотеми/магніт/метеори: реальні заміри
// 7×поспіль дали 124-134; бюджет = max+~10%.
check(heavy.calls <= 150, 'mobile heavy draw calls у бюджеті', `calls=${heavy.calls}`);
check(heavy.triangles <= 620000, 'mobile heavy triangles у бюджеті', `triangles=${heavy.triangles}`);

// 🦴 Skeleton/boneTexture memory-перевірка: кожен клон зомбі несе власний THREE.Skeleton
// (bone DataTexture, characters.js cloneRig) — не звільнимо при видаленні зі сцени, і
// textures монотонно ростимуть з кожною ордою. Заміряємо ДО, вбиваємо орду, проганяємо
// симуляцію через g._step() (детерміновано, без залежності від реального rAF/фокуса вкладки
// у headless — інакше ігровий dt майже не тече) на TTL трупа (touch=1.6с), спавнимо нову
// орду 36 зомбі, знову вбиваємо і прибираємо — textures після циклу мають лишитись у межах
// ДО + невеликий допуск (±5 — інші ефемерні текстури модалок/HUD).
const memCycle = await page.evaluate(() => {
  const g = window.__game;
  const l = g.level;
  const texturesBefore = g.renderer.info.memory.textures;

  const killHorde = () => {
    for (const z of [...l.zombies.list]) {
      if (z.horde && z.state !== 'dead') z.damage(99999, null, false);
    }
  };
  const stepUntilCorpsesGone = () => {
    // _corpseTtl(touch)=1.6с; кроки по 0.05с (max dt/кадр) — з запасом до ~2с.
    // skipRender=false — інакше SkinnedMesh.skeleton.boneTexture ніколи не
    // виділяється (лежить за WebGLRenderer.renderBufferDirect/updateSkeleton),
    // і тест не побачив би ні виділення, ні реального витоку.
    for (let i = 0; i < 42; i++) g._step(0.05, false);
  };
  const respawnWave = () => {
    for (let i = 0; i < 36; i++) {
      const a = (Math.PI * 2 * i) / 36;
      const z = l.zombies.spawn(i % 5 === 0 ? 'runner' : i % 7 === 0 ? 'tank' : 'walker', Math.cos(a) * 12, Math.sin(a) * 12, { horde: true });
      z.aggroed = true;
      z.state = 'chase';
    }
    l.zombies.hordeActive = true;
    l.zombies.hordeRemaining = l.zombies.list.filter((z) => z.horde && z.state !== 'dead').length;
  };

  killHorde();
  stepUntilCorpsesGone();
  const afterFirstKill = { textures: g.renderer.info.memory.textures, dead: l.zombies.list.filter((z) => z.state === 'dead').length };
  respawnWave();
  const respawned = l.zombies.list.filter((z) => z.horde && z.state !== 'dead').length;
  killHorde();
  stepUntilCorpsesGone();

  return {
    texturesBefore,
    afterFirstKill,
    respawned,
    texturesAfter: g.renderer.info.memory.textures,
    deadAfter: l.zombies.list.filter((z) => z.state === 'dead').length,
  };
});

console.log('▸ Mobile memory cycle', JSON.stringify(memCycle));
check(memCycle.afterFirstKill.dead === 0, 'перша хвиля трупів прибрана до респавну', JSON.stringify(memCycle.afterFirstKill));
check(memCycle.deadAfter === 0, 'друга хвиля трупів теж прибрана', `deadAfter=${memCycle.deadAfter}`);
check(memCycle.texturesAfter <= memCycle.texturesBefore + 5,
  'mobile: textures не ростуть монотонно після хвилі вбивств+респавнів (skeleton.dispose)',
  `before=${memCycle.texturesBefore} after=${memCycle.texturesAfter}`);

await ctx.close();
await browser.close();
closeServer();
console.log(failed === 0 ? '🎉 MOBILE PERF OK' : `💥 MOBILE PERF FAILURES: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
