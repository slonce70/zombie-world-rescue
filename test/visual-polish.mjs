import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errors = [];
let failed = 0;

const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(250);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

console.log('▸ Visual polish contracts');
await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await waitFor(() => window.__game && window.__game.state === 'level', 30000, 'рівень UKR');

const res = await page.evaluate(async () => {
  const g = window.__game;
  const THREE = await import('/vendor/three.module.js');
  const out = { errors: [] };
  out.colorRampShader = THREE.ShaderChunk.gradientmap_pars_fragment.includes('texture2D( gradientMap, coord ).rgb');

  out.contextHooks = typeof g._onContextLost === 'function' && typeof g._onContextRestored === 'function';
  const canvas = document.getElementById('game-canvas');
  const ev = new Event('webglcontextlost', { cancelable: true });
  out.contextPrevented = canvas.dispatchEvent(ev) === false;

  out.exposure = g.renderer.toneMappingExposure;
  out.exposureOk = Math.abs(out.exposure - 1.08) < 0.001;

  let ramp = null;
  let terrainDither = false;
  let toonDither = false;
  g.level.scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.vertexColors && m.dithering) terrainDither = true;
      if (m.gradientMap && m.gradientMap.image && m.gradientMap.image.data) {
        toonDither = toonDither || !!m.dithering;
        if (!ramp) ramp = Array.from(m.gradientMap.image.data);
      }
    }
  });
  out.terrainDither = terrainDither;
  out.toonDither = toonDither;
  out.rampLen = ramp ? ramp.length : 0;
  out.rampLifted = !!ramp && ramp.length >= 16 && ramp[0] >= 125 && ramp[1] >= 140 && ramp[2] >= 180;

  g.save.quality = 'high';
  g._applyQuality();
  const startRatio = g.pixelRatio;
  g._fpsAcc = 1;
  g._fpsN = 30;
  g._lowFpsSec = 2;
  g._highFpsSec = 0;
  g._step(0.016, true, 0.016);
  out.highStartRatio = startRatio;
  out.highDroppedRatio = g.pixelRatio;
  out.highAdaptive = startRatio > 1 && g.pixelRatio < startRatio && g.pixelRatio >= 1;

  g.level.stats.time = 10;
  g.level.combo.t = 1;
  g._hitstopT = 0;
  g.level.bus.emit('hitmarker', true);
  const hitstopT0 = g._hitstopT;
  const time0 = g.level.stats.time;
  const combo0 = g.level.combo.t;
  g._step(0.05, true, 0.05);
  out.hitstopStarted = hitstopT0 >= 0.04;
  out.timerDelta = g.level.stats.time - time0;
  out.comboDelta = combo0 - g.level.combo.t;
  out.hitstopScalesSimButNotTimer = out.timerDelta >= 0.049 && out.timerDelta <= 0.052 && out.comboDelta > 0 && out.comboDelta < 0.02;

  const fx = g.level.effects;
  const from = new THREE.Vector3(0, 2, 0);
  const to = new THREE.Vector3(10, 2, 0);
  fx.laserBeam(from, to);
  out.laserGlow = !!(fx.laserGlow && fx.laserGlow.visible && fx.laserGlow.material.map && fx.laserGlow.material.map.userData.shared);

  const pos = new THREE.Vector3(2, g.level.world.groundH(2, 2), 2);
  for (let i = 0; i < 12; i++) fx.ring(pos, 0xff8844, 3 + i * 0.1);
  out.ringPoolSize = fx.ringPool ? fx.ringPool.length : 0;
  out.activeRings = fx.rings.length;
  out.ringPoolShared = !!(fx.ringGeo && fx.ringGeo.userData && fx.ringGeo.userData.shared);
  out.ringPoolOk = out.ringPoolSize === 8 && out.activeRings <= 8 && out.ringPoolShared;

  g.endLevel();
  out.exposureReset = Math.abs(g.renderer.toneMappingExposure - 1.06) < 0.001;

  return out;
});

check(res.contextHooks, 'WebGL context lost/restored hooks registered', JSON.stringify(res));
check(res.contextPrevented, 'synthetic webglcontextlost is prevented', JSON.stringify(res));
check(res.exposureOk, 'summer biome applies exposure 1.08', JSON.stringify({ exposure: res.exposure }));
check(res.rampLifted, 'toon ramp is colored RGBA and darkest band lifted', JSON.stringify({ len: res.rampLen }));
check(res.colorRampShader, 'toon shader samples gradient ramp color');
check(res.toonDither, 'toon materials enable dithering');
check(res.terrainDither, 'terrain-like vertex-color materials enable dithering');
check(res.highAdaptive, 'High quality can still adapt pixel ratio downward', JSON.stringify({ start: res.highStartRatio, dropped: res.highDroppedRatio }));
check(res.hitstopStarted && res.hitstopScalesSimButNotTimer, 'hitstop slows sim without slowing run timer', JSON.stringify({ timerDelta: res.timerDelta, comboDelta: res.comboDelta }));
check(res.laserGlow, 'laser impact uses shared fake-glow sprite');
check(res.ringPoolOk, 'explosion rings use fixed shared pool', JSON.stringify({ pool: res.ringPoolSize, active: res.activeRings }));
check(res.exposureReset, 'leaving level resets renderer exposure to default');

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}

console.log(failed === 0 ? '🎉 VISUAL POLISH CONTRACTS OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
