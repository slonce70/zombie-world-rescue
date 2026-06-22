# Visual Polish S Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the safest high-impact graphics polish slice: adaptive resolution in High quality, warmer cel shading, per-biome exposure, material dithering, fake laser glow, pooled explosion rings, tiny hitstop, and WebGL context-loss recovery.

**Architecture:** Keep the existing no-bundler Three.js pipeline. Do not add `EffectComposer`, render targets, shader patches, models, or binary assets; use the current renderer, materials, `CanvasTexture`, and existing update loop. One Playwright regression test covers the visual/runtime contracts, then each task adds the smallest code needed to turn that test green.

**Tech Stack:** Vanilla ES modules in browser, Three.js r160 from `vendor/three.module.js`, Playwright browser tests, Python static server on port `8741`, PWA cache/version files.

---

## Scope And File Structure

This plan implements the first safe visual-release slice from the graphics research report. It intentionally skips true bloom, FXAA, postprocessing, LOD systems, imported textures/models, and `onBeforeCompile` shader customization.

**Files:**
- Create: `test/visual-polish.mjs`
- Modify: `src/main.js`
  - `BIOME_EXPOSURE` constants near quality constants
  - renderer/WebGL context setup in `constructor`
  - `_applyQuality()`, `startLevel()`, `_buildLevel()`
  - level `_step()` timing split for hitstop
  - default exposure reset when leaving a level
- Modify: `src/characters.js`
  - shared colored toon ramp
  - material dithering on shared toon materials
- Modify: `src/world.js`
  - terrain/water/ice material dithering
- Modify: `src/effects.js`
  - shared radial glow texture
  - pooled ring meshes
  - fake laser impact glow
- Modify: `version.json`, `src/main.js`, `sw.js`
  - bump v71 to v72 for the PWA release

Before executing: start from a clean branch or worktree. The current repository may already contain unrelated Japan/samurai changes; do not mix those into this graphics commit.

---

### Task 1: Write The Visual Regression Test

**Files:**
- Create: `test/visual-polish.mjs`

- [ ] **Step 1: Create the failing Playwright test**

Create `test/visual-polish.mjs` with this complete content:

```js
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
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node test/visual-polish.mjs
```

Expected: FAIL. At least these checks should fail on the current code: WebGL context hooks, summer exposure 1.08, colored RGBA ramp, High-quality adaptive resolution, hitstop, laser glow sprite, and ring pool.

- [ ] **Step 3: Commit the red test**

```bash
git add test/visual-polish.mjs
git commit -m "test: add visual polish regression coverage"
```

---

### Task 2: Adaptive High Quality And Per-Biome Exposure

**Files:**
- Modify: `src/main.js:62-64`
- Modify: `src/main.js:107-130`
- Modify: `src/main.js:473-485`
- Modify: `src/main.js:1039-1045`
- Modify: `src/main.js:1118-1119`
- Modify: `src/main.js:1919-1921`
- Test: `test/visual-polish.mjs`

- [ ] **Step 1: Add biome exposure constants**

In `src/main.js`, immediately after `QUALITY_LABELS`, add:

```js
const DEFAULT_EXPOSURE = 1.06;
const BIOME_EXPOSURE = {
  summer: 1.08,
  winterDusk: 1.02,
  autumnGold: 1.08,
  provence: 1.06,
  spainSun: 0.98,
  italyMed: 1.0,
  bosphorus: 1.03,
  desert: 0.96,
  sakura: 1.05,
};
```

- [ ] **Step 2: Initialize renderer exposure with the constant**

Replace:

```js
this.renderer.toneMappingExposure = 1.06;
```

with:

```js
this.renderer.toneMappingExposure = DEFAULT_EXPOSURE;
```

- [ ] **Step 3: Add a tiny helper for adaptive-quality eligibility**

Inside the `Game` class, just before `_applyQuality()`, add:

```js
  _adaptiveResolutionEnabled() {
    const q = this.save.quality || 'auto';
    return q === 'auto' || q === 'high';
  }

  _applyLevelExposure(countryId) {
    const biome = (COUNTRIES[countryId] || COUNTRIES.UKR).biome;
    this.renderer.toneMappingExposure = BIOME_EXPOSURE[biome] || DEFAULT_EXPOSURE;
  }

  _applyDefaultExposure() {
    this.renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  }
```

- [ ] **Step 4: Keep adaptive target in High mode**

In `_applyQuality()`, replace:

```js
    // рідний масштаб для авто-відновлення + скидаємо лічильники гістерезису
    this._autoTargetRatio = this.pixelRatio;
```

with:

```js
    // рідний масштаб для адаптивного відновлення в Auto/High + скидаємо гістерезис
    this._autoTargetRatio = this.pixelRatio;
```

No other `_applyQuality()` code changes are needed.

- [ ] **Step 5: Restore resolution at level start for Auto and High**

In `startLevel()`, replace:

```js
      // адаптивка: кожен рівень стартує з рідного масштабу — коротка просадка на
      // минулому рівні більше не лишає гру «мильною» весь сеанс (лише в режимі Авто)
      if ((this.save.quality || 'auto') === 'auto' && this.pixelRatio < this._autoTargetRatio) {
```

with:

```js
      // адаптивка: кожен рівень стартує з рідного масштабу — коротка просадка на
      // минулому рівні більше не лишає гру «мильною» весь сеанс (Auto і High)
      if (this._adaptiveResolutionEnabled() && this.pixelRatio < this._autoTargetRatio) {
```

- [ ] **Step 6: Apply biome exposure when building a level**

In `_buildLevel()`, immediately before:

```js
    level.world = new World(level.scene, country.seed, getBiome(countryId), country.map, this._qualityWorldOpts());
```

insert:

```js
    this._applyLevelExposure(countryId);
```

- [ ] **Step 7: Reset exposure when leaving a level**

In `endLevel()`, immediately before:

```js
    this.level = null;
```

insert:

```js
    this._applyDefaultExposure();
```

- [ ] **Step 8: Allow High mode to downshift under low FPS**

In `_step()`, replace:

```js
      // адаптивна роздільність (лише в режимі Авто, лише в бою): гістерезис, щоб не «пульсувало» —
      // довго < 48 fps → знижуємо рендер-масштаб; довго > 57 fps → піднімаємо назад до рідного.
      if ((this.save.quality || 'auto') === 'auto' && this.state === 'level') {
```

with:

```js
      // адаптивна роздільність (Auto і High, лише в бою): гістерезис, щоб не «пульсувало» —
      // довго < 48 fps → знижуємо рендер-масштаб; довго > 57 fps → піднімаємо назад до рідного.
      if (this._adaptiveResolutionEnabled() && this.state === 'level') {
```

- [ ] **Step 9: Run the focused test**

Run:

```bash
node test/visual-polish.mjs
```

Expected: exposure, exposure reset, and High adaptive checks now PASS. Other checks still FAIL.

- [ ] **Step 10: Commit**

```bash
git add src/main.js
git commit -m "feat: make high quality adaptive and tune exposure"
```

---

### Task 3: Colored Toon Ramp And Dithering

**Files:**
- Modify: `src/characters.js:5-29`
- Modify: `src/characters.js:60-66`
- Modify: `src/world.js:2001-2002`
- Modify: `src/world.js:2036-2039`
- Modify: `src/world.js:2961-2964`
- Test: `test/visual-polish.mjs`

- [ ] **Step 1: Replace the neutral toon ramp**

In `src/characters.js`, replace `getGradMap()` with:

```js
function getGradMap() {
  if (!gradMap) {
    const data = new Uint8Array([
      130, 150, 190, 255,
      168, 184, 220, 255,
      214, 224, 246, 255,
      255, 236, 204, 255,
    ]);
    gradMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    gradMap.minFilter = THREE.NearestFilter;
    gradMap.magFilter = THREE.NearestFilter;
    gradMap.needsUpdate = true;
    gradMap.userData.shared = true; // спільний на весь сеанс — endLevel його НЕ диспозить
  }
  return gradMap;
}
```

- [ ] **Step 2: Enable dithering on cached toon materials**

In `toonMat()`, replace the material creation block:

```js
    const m = new THREE.MeshToonMaterial({
      color, gradientMap: getGradMap(), emissive, emissiveIntensity,
    });
```

with:

```js
    const m = new THREE.MeshToonMaterial({
      color, gradientMap: getGradMap(), emissive, emissiveIntensity, dithering: true,
    });
```

- [ ] **Step 3: Enable dithering on baked rig material**

In `getBakedMat()`, replace:

```js
    bakedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradMap() });
```

with:

```js
    bakedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradMap(), dithering: true });
```

- [ ] **Step 4: Enable terrain dithering**

In `src/world.js`, replace:

```js
    const mat = new THREE.MeshToonMaterial({ vertexColors: true });
```

with:

```js
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, dithering: true });
```

- [ ] **Step 5: Enable water dithering**

In `_buildWater()`, replace:

```js
      const mat = new THREE.MeshToonMaterial({
        color: this.biome.water || 0x4dc3e8, transparent: true, opacity: 0.78,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4,
      });
```

with:

```js
      const mat = new THREE.MeshToonMaterial({
        color: this.biome.water || 0x4dc3e8, transparent: true, opacity: 0.78,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4,
        dithering: true,
      });
```

- [ ] **Step 6: Enable frozen lake dithering**

In `_lmFrozenLake()`, replace:

```js
    const ice = new THREE.Mesh(geo, new THREE.MeshToonMaterial({
      color: 0x9ccbe8, gradientMap: toonMat(0).gradientMap,
      emissive: 0x3a7fc4, emissiveIntensity: 0.22,
    }));
```

with:

```js
    const ice = new THREE.Mesh(geo, new THREE.MeshToonMaterial({
      color: 0x9ccbe8, gradientMap: toonMat(0).gradientMap,
      emissive: 0x3a7fc4, emissiveIntensity: 0.22,
      dithering: true,
    }));
```

- [ ] **Step 7: Run the focused test**

Run:

```bash
node test/visual-polish.mjs
```

Expected: ramp and dithering checks now PASS. Remaining failures should be hitstop, laser glow, ring pool, and context hooks if Task 6 is not done yet.

- [ ] **Step 8: Commit**

```bash
git add src/characters.js src/world.js
git commit -m "feat: warm up toon ramp and enable dithering"
```

---

### Task 4: Fake Laser Glow And Ring Pool

**Files:**
- Modify: `src/effects.js:1-17`
- Modify: `src/effects.js:56-69`
- Modify: `src/effects.js:90-92`
- Modify: `src/effects.js:129-140`
- Modify: `src/effects.js:615-635`
- Modify: `src/effects.js:665-674`
- Modify: `src/effects.js:836-862`
- Test: `test/visual-polish.mjs`

- [ ] **Step 1: Add a shared radial glow texture helper**

In `src/effects.js`, after `segPointDist2()`, add:

```js
let glowTexture = null;
function getGlowTexture() {
  if (!glowTexture) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTexture = new THREE.CanvasTexture(cv);
    glowTexture.userData.shared = true;
  }
  return glowTexture;
}
```

- [ ] **Step 2: Create the laser glow sprite**

In the constructor, immediately after adding `this.laserCore`, insert:

```js
    this.laserGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: 0x66ffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }));
    this.laserGlow.visible = false;
    this.laserGlow.frustumCulled = false;
    scene.add(this.laserGlow);
```

- [ ] **Step 3: Replace ring allocation with a fixed pool**

In the constructor, replace:

```js
    // кільця (слем боса)
    this.rings = [];
```

with:

```js
    // кільця (слем боса): фіксований пул без алокацій/GC у піку бою.
    this.ringGeo = new THREE.TorusGeometry(1, 0.12, 8, 28);
    this.ringGeo.userData.shared = true;
    this.ringPool = [];
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
        color: 0xff8844,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      mesh.visible = false;
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      this.ringPool.push({ mesh, t: 0, maxR: 0 });
    }
```

- [ ] **Step 4: Dispose pooled effect resources correctly**

In `dispose()`, replace:

```js
    sc.remove(this.laserMesh, this.laserCore);
```

with:

```js
    sc.remove(this.laserMesh, this.laserCore, this.laserGlow);
    for (const r of this.ringPool) { sc.remove(r.mesh); if (r.mesh.material) r.mesh.material.dispose(); }
```

Then replace:

```js
    for (const g of [this.tracerGeo, this.coinGeo, this.medGeo, this.ammoGeo, this.projGeo, this.grenadeGeo, this.bandGeo, this.laserGeo, this.laserCore.geometry]) g.dispose();
    for (const m of [this.tracerMat, this.grenadeMat, this.grenadeHotMat, this.laserMat, this.laserCoreMat]) m.dispose();
```

with:

```js
    for (const g of [this.tracerGeo, this.coinGeo, this.medGeo, this.ammoGeo, this.projGeo, this.grenadeGeo, this.bandGeo, this.laserGeo, this.laserCore.geometry, this.ringGeo]) g.dispose();
    for (const m of [this.tracerMat, this.grenadeMat, this.grenadeHotMat, this.laserMat, this.laserCoreMat, this.laserGlow.material]) m.dispose();
```

- [ ] **Step 5: Show fake glow at laser impact**

In `laserBeam(from, to)`, immediately before setting the flash light position, insert:

```js
    this.laserGlow.visible = true;
    this.laserGlow.position.copy(to);
    this.laserGlow.scale.setScalar(1.6 + Math.min(2.6, len * 0.04));
    this.laserGlow.material.opacity = 0.7;
```

- [ ] **Step 6: Rewrite `ring()` to use the pool**

Replace the whole `ring(pos, colorHex = 0xff8844, maxR = 6)` method with:

```js
  ring(pos, colorHex = 0xff8844, maxR = 6) {
    const slot = this.ringPool.find((r) => !r.mesh.visible) || this.ringPool[0];
    const old = this.rings.indexOf(slot);
    if (old >= 0) this.rings.splice(old, 1);
    slot.t = 0;
    slot.maxR = maxR;
    slot.mesh.visible = true;
    slot.mesh.material.color.setHex(colorHex);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.scale.set(0.001, 0.001, 1);
    slot.mesh.position.copy(pos);
    slot.mesh.position.y += 0.15;
    this.rings.push(slot);
  }
```

- [ ] **Step 7: Hide laser glow with laser beam**

In `update(dt)`, replace:

```js
    if (this.laserMesh.visible) {
      this.laserT -= dt;
      if (this.laserT <= 0) { this.laserMesh.visible = false; this.laserCore.visible = false; }
    }
```

with:

```js
    if (this.laserMesh.visible) {
      this.laserT -= dt;
      if (this.laserT <= 0) {
        this.laserMesh.visible = false;
        this.laserCore.visible = false;
        this.laserGlow.visible = false;
      } else {
        this.laserGlow.material.opacity = Math.max(0, this.laserT / 0.06) * 0.7;
      }
    }
```

- [ ] **Step 8: Stop disposing ring geometry/material per ring**

In the ring update loop, replace:

```js
      if (r.t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
```

with:

```js
      if (r.t >= 1) {
        r.mesh.visible = false;
        this.rings.splice(i, 1);
      }
```

- [ ] **Step 9: Run the focused test**

Run:

```bash
node test/visual-polish.mjs
```

Expected: laser glow and ring pool checks now PASS.

- [ ] **Step 10: Commit**

```bash
git add src/effects.js
git commit -m "feat: add cheap glow and pool explosion rings"
```

---

### Task 5: Hitstop Without Slowing Timers Or Coop Networking

**Files:**
- Modify: `src/main.js:107-130`
- Modify: `src/main.js:1288-1316`
- Modify: `src/main.js:1948-2008`
- Test: `test/visual-polish.mjs`

- [ ] **Step 1: Initialize hitstop state**

In the `Game` constructor, after:

```js
    this._highFpsSec = 0;
```

add:

```js
    this._hitstopT = 0;
```

- [ ] **Step 2: Trigger hitstop from crits and kills**

In `_buildLevel()`, after `this.hud.wire(level.bus);`, add:

```js
    level.bus.on('hitmarker', (crit) => {
      if (crit) this._hitstopT = Math.max(this._hitstopT, 0.055);
    });
    level.bus.on('zombieKilled', (z) => {
      if (!level.mirror) this._hitstopT = Math.max(this._hitstopT, z.type === 'boss' ? 0.07 : 0.045);
    });
```

- [ ] **Step 3: Split real time from simulation time in level update**

Inside `_step(dt, skipRender, timerDt = dt)`, in the `this.state === 'level'` branch, insert this immediately after the `blocked` declaration:

```js
      const hitstopScale = this._hitstopT > 0 ? 0.15 : 1;
      if (this._hitstopT > 0) this._hitstopT = Math.max(0, this._hitstopT - timerDt);
      const simDt = dt * hitstopScale;
```

- [ ] **Step 4: Use `simDt` for simulation updates only**

In the same branch, replace this block:

```js
        this.level.player.update(dt, this.input, allowControl);
        this.level.zombies.update(dt);
        this.level.missions.update(dt, this.input, allowControl);
        // іграшки: самокати, мегабокс, гаджети, песик
        this.level.vehicles.update(dt, this.input, allowControl);
        if (this.level.megabox && !this.level.megabox.done) {
          this.level.megabox.update(dt, this.input, allowControl);
        }
        this.level.gadgets.update(dt, this.input, allowControl);
        if (this.level.net) this._updateRevive(dt, allowControl);
        if (this.level.pet) this.level.pet.update(dt);
        this.level.world.update(dt, this.level.player.pos);
        this._updateDayNight();
        this.level.effects.update(dt);
        this.level.stats.time += dt;
        // комбо згасає без вбивств
        if (this.level.combo.t > 0) {
          this.level.combo.t -= dt;
          if (this.level.combo.t <= 0) this.level.combo.n = 0;
        }
        this._updateMusic(dt);
```

with:

```js
        this.level.player.update(simDt, this.input, allowControl);
        this.level.zombies.update(simDt);
        this.level.missions.update(simDt, this.input, allowControl);
        // іграшки: самокати, мегабокс, гаджети, песик
        this.level.vehicles.update(simDt, this.input, allowControl);
        if (this.level.megabox && !this.level.megabox.done) {
          this.level.megabox.update(simDt, this.input, allowControl);
        }
        this.level.gadgets.update(simDt, this.input, allowControl);
        if (this.level.net) this._updateRevive(simDt, allowControl);
        if (this.level.pet) this.level.pet.update(simDt);
        this.level.world.update(simDt, this.level.player.pos);
        this.level.effects.update(simDt);
        this.level.stats.time += timerDt;
        this._updateDayNight();
        // комбо згасає разом із симуляцією: freeze-frame не краде серію
        if (this.level.combo.t > 0) {
          this.level.combo.t -= simDt;
          if (this.level.combo.t <= 0) this.level.combo.n = 0;
        }
        this._updateMusic(simDt);
```

Leave this line unchanged outside the blocked section:

```js
      if (this.level.net) this.level.net.update(dt);
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
node test/visual-polish.mjs
```

Expected: hitstop check now PASS; `timerDelta` stays about `0.05`, `comboDelta` is about `0.0075`.

- [ ] **Step 6: Run a coop-sensitive smoke check**

Run:

```bash
node test/coop-damage.mjs
```

Expected: PASS. This is the cheap guard that melee damage timing still advances and no obvious coop damage path broke.

- [ ] **Step 7: Commit**

```bash
git add src/main.js
git commit -m "feat: add tiny hitstop without slowing timers"
```

---

### Task 6: WebGL Context Loss Recovery

**Files:**
- Modify: `src/main.js:113-130`
- Test: `test/visual-polish.mjs`

- [ ] **Step 1: Register context lost/restored handlers**

In the `Game` constructor, immediately after creating `this.renderer`, add:

```js
    this._onContextLost = (e) => {
      e.preventDefault();
      this._contextLost = true;
      if (this.hud) this.hud.toast(t('⚠️ Графіка перезапускається — зачекай...'));
    };
    this._onContextRestored = () => location.reload();
    canvas.addEventListener('webglcontextlost', this._onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
```

The start of the constructor should now look like:

```js
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 1.5 });
    this._onContextLost = (e) => {
      e.preventDefault();
      this._contextLost = true;
      if (this.hud) this.hud.toast(t('⚠️ Графіка перезапускається — зачекай...'));
    };
    this._onContextRestored = () => location.reload();
    canvas.addEventListener('webglcontextlost', this._onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
    this.renderer.setSize(innerWidth, innerHeight);
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
node test/visual-polish.mjs
```

Expected: context hook checks now PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "fix: recover from WebGL context loss"
```

---

### Task 7: Version And PWA Cache Bump

**Files:**
- Modify: `src/main.js:57-60`
- Modify: `version.json`
- Modify: `sw.js:1-6`
- Test: `test/version-sync.mjs`

- [ ] **Step 1: Bump app version to 72**

In `src/main.js`, replace:

```js
const APP_VERSION = 71;
```

with:

```js
const APP_VERSION = 72;
```

- [ ] **Step 2: Bump version.json**

Replace the complete contents of `version.json` with:

```json
{ "v": 72 }
```

- [ ] **Step 3: Bump service worker cache**

In `sw.js`, replace:

```js
const CACHE = 'zr-cache-v71';
```

with:

```js
const CACHE = 'zr-cache-v72';
```

- [ ] **Step 4: Run version sync test**

Run:

```bash
node test/version-sync.mjs
```

Expected: PASS with `version.json.v=72`, `APP_VERSION=72`, and `SW_CACHE_V=72`.

- [ ] **Step 5: Commit**

```bash
git add src/main.js version.json sw.js
git commit -m "chore: bump visual polish release to v72"
```

---

### Task 8: Final Verification

**Files:**
- Verify all files touched by this plan

- [ ] **Step 1: Ensure the local server is running**

Run:

```bash
lsof -iTCP:8741 -sTCP:LISTEN -n -P || npm run serve
```

Expected: a listener on `*:8741`. If `npm run serve` starts a foreground server, leave it running in that terminal and run tests in another terminal.

- [ ] **Step 2: Run focused visual regression**

Run:

```bash
node test/visual-polish.mjs
```

Expected:

```text
🎉 VISUAL POLISH CONTRACTS OK
```

- [ ] **Step 3: Run core smoke**

Run:

```bash
node test/smoke.mjs
```

Expected:

```text
🎉 СМОУК ПРОЙДЕНО
```

- [ ] **Step 4: Run maps/quality coverage**

Run:

```bash
node test/maps.mjs
```

Expected: PASS; the quality section should still report that the quality button switches modes and fast mode uses `shadow === 1024`.

- [ ] **Step 5: Run version sync**

Run:

```bash
node test/version-sync.mjs
```

Expected: PASS with all version numbers equal to `72`.

- [ ] **Step 6: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 7: Final commit if previous tasks were not committed separately**

Only run this if Tasks 1-7 were executed without their per-task commits:

```bash
git add test/visual-polish.mjs src/main.js src/characters.js src/world.js src/effects.js version.json sw.js
git commit -m "feat: ship safe visual polish pass"
```

Expected: one commit containing only the visual-polish changes.

---

## Self-Review

**Spec coverage:**
- Adaptive pixel ratio in High mode: Task 2.
- Per-biome exposure: Task 2.
- Colored cel ramp and lifted darkest band: Task 3.
- Dithering for terrain/water/toon materials: Task 3.
- Fake glow without postprocessing: Task 4.
- Ring pooling to avoid per-ring allocation/dispose: Task 4.
- Hitstop without slowing `net.update` or run timers: Task 5.
- WebGL context loss handling: Task 6.
- PWA release cache/version bump: Task 7.
- Verification: Task 8.

**Red-flag wording scan:** No banned filler wording or unspecified test steps remain.

**Type consistency:** Test expectations match planned names: `BIOME_EXPOSURE`, `_adaptiveResolutionEnabled()`, `_applyLevelExposure()`, `_hitstopT`, `laserGlow`, `ringGeo`, and `ringPool`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-visual-polish-s.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
