# Living Rescue HQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small playable 3D "Живий Штаб Рятівника" where the child can enter from the existing HQ, see saved trophies/hero/progress in-world, and poke safe training targets without adding UGC, chat, networking, or a new economy.

**Architecture:** Add one focused scene controller, `src/hqbase.js`, that reuses the existing Three.js renderer/canvas and current save data. `Game` gets a new lightweight state, `hqbase`, plus enter/exit wiring; campaign, co-op, cloud save, and level code stay untouched except for the shared frame loop branch. The current HTML HQ remains the data dashboard; the living HQ is a visual companion launched from it.

**Tech Stack:** Vanilla JS modules, Three.js from existing `vendor/three.module.js`, existing i18n/save/HQ patterns, Playwright tests, no new dependencies.

---

## Scope

Build now:

- Entry button inside the existing `overlay-hq`.
- A separate 3D scene with floor, trophy wall, hero mannequin, bestiary shelves, and a few training targets.
- Read-only reflection of existing save fields: `liberated`, `records`, `missionRuns`, `stats`, `bestiary`, `medals`, `goal`, `activeSkin`, `hero`.
- One simple interaction: clicking/tapping a target makes it react and increments a local session-only hit counter.
- Exit back to globe/HQ without losing state or requiring a reload.

Skip now:

- No base editor.
- No public sharing/gallery.
- No friend visiting the base.
- No open chat.
- No new persistent save fields unless a later task proves they are needed.
- No new package.

## Files

- Create: `src/hqbase.js` — owns the living HQ scene, camera, props, target interaction, cleanup, and debug state.
- Create: `test/living-hq.mjs` — one Playwright test covering entry, rendering, save-driven trophies, target interaction, and exit.
- Modify: `index.html` — add the "enter living HQ" button and a tiny in-scene UI overlay.
- Modify: `styles.css` — style the button and living HQ overlay; keep it mobile-safe.
- Modify: `src/main.js` — import/wire `LivingHQ`, add `hqbase` state branch, resize handling, enter/exit methods.
- Modify: `src/i18n/en.js`, `src/i18n/ru.js` — translate new visible strings.
- Modify: `README.md`, `version.json`, `src/main.js` `APP_VERSION` — document and bump release after implementation.

## Preflight

- [ ] **Step 1: Confirm clean working tree**

Run:

```bash
git status --short
```

Expected: no tracked modifications. Untracked `graphify-out/` is okay if present; do not stage it.

- [ ] **Step 2: Start the local server in a separate terminal**

Run:

```bash
npm run serve
```

Expected:

```text
Serving HTTP on :: port 8741
```

- [ ] **Step 3: Keep this rule for every task**

After each task that changes behavior, run the named focused test first. Only run broad tests after the focused one passes.

---

### Task 1: Add the Living HQ Entry Point

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Create: `test/living-hq.mjs`

- [ ] **Step 1: Write the failing entry test**

Create `test/living-hq.mjs`:

```js
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

await page.click('#btn-menu');
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 10000 });

check(!!await page.$('#btn-hqbase'), 'кнопка входу в Живий Штаб існує');
check(await page.textContent('#btn-hqbase').then((s) => /Живий Штаб|Living HQ|Живой Штаб/.test(s || '')), 'кнопка має зрозумілий текст');

const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.join('\n'));

await browser.close();
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL on "кнопка входу в Живий Штаб існує".

- [ ] **Step 3: Add the button markup**

In `index.html`, inside `#overlay-hq .panel-body`, directly before `<div id="hq-content"></div>`, add:

```html
      <div class="hqbase-row">
        <button id="btn-hqbase" class="btn btn-primary big hqbase-enter" data-i18n="🏠 Увійти в Живий Штаб">🏠 Увійти в Живий Штаб</button>
      </div>
```

- [ ] **Step 4: Add minimal styles**

Append to `styles.css`:

```css
.hqbase-row {
  display: flex;
  justify-content: center;
  margin: 8px 0 14px;
}

.hqbase-enter {
  width: min(100%, 360px);
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css test/living-hq.mjs
git commit -m "feat: add living HQ entry point"
```

---

### Task 2: Wire a New `hqbase` Game State

**Files:**
- Create: `src/hqbase.js`
- Modify: `src/main.js`
- Modify: `test/living-hq.mjs`

- [ ] **Step 1: Extend the failing test for enter/exit**

Add this after the button text checks in `test/living-hq.mjs`:

```js
await page.click('#btn-hqbase');
await page.waitForFunction(() => window.__game && window.__game.state === 'hqbase', null, { timeout: 10000 });
check(await page.evaluate(() => window.__game.state) === 'hqbase', 'клік входить у state=hqbase');
check(!!await page.$('#hqbase-ui'), 'UI Живого Штабу показано');

await page.click('#btn-hqbase-exit');
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 10000 });
check(await page.evaluate(() => window.__game.state) === 'globe', 'вихід повертає на глобус');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL because clicking `#btn-hqbase` does not change game state.

- [ ] **Step 3: Create the minimal scene controller**

Create `src/hqbase.js`:

```js
import * as THREE from 'three';
import { t } from './i18n.js';

export class LivingHQ {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 180);
    this.camera.position.set(0, 7, 14);
    this.camera.lookAt(0, 2, 0);
    this.hitCount = 0;
    this.ready = false;
  }

  enter() {
    this.ready = true;
    this.hitCount = 0;
    this._ensureUi();
    this.build();
    this.onResize();
  }

  exit() {
    this.ready = false;
    const ui = document.getElementById('hqbase-ui');
    if (ui) ui.style.display = 'none';
    this.dispose();
  }

  build() {
    this.dispose();
    this.scene.background = new THREE.Color(0x78bdf2);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6fb060, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(8, 12, 8);
    this.scene.add(sun);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 48),
      new THREE.MeshLambertMaterial({ color: 0x5fc46b })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
  }

  update(dt) {
    if (!this.ready) return;
    this.scene.rotation.y += dt * 0.03;
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    for (const obj of [...this.scene.children]) {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
  }

  debugState() {
    return { ready: this.ready, hitCount: this.hitCount, children: this.scene.children.length };
  }

  _ensureUi() {
    let ui = document.getElementById('hqbase-ui');
    if (!ui) {
      ui = document.createElement('div');
      ui.id = 'hqbase-ui';
      ui.innerHTML = `<button id="btn-hqbase-exit" class="btn">🌍 ${t('На глобус')}</button>`;
      document.body.appendChild(ui);
      document.getElementById('btn-hqbase-exit').addEventListener('click', () => this.game.exitHQBase());
    }
    ui.style.display = '';
  }
}
```

- [ ] **Step 4: Wire `LivingHQ` into `Game`**

In `src/main.js`, add import near other UI imports:

```js
import { LivingHQ } from './hqbase.js';
```

In the constructor, after `this.hq = new RescueHQ(this);`, add:

```js
    this.hqbase = new LivingHQ(this);
```

After the existing `btn-hq` click listener, add:

```js
    document.getElementById('btn-hqbase').addEventListener('click', () => {
      this.enterHQBase();
    });
```

Add methods near other state helpers:

```js
  enterHQBase() {
    this.audio.click();
    this._hideOverlay('overlay-hq');
    this._hideOverlay('overlay-menu');
    this._showGlobeUI(false);
    this.state = 'hqbase';
    this.hqbase.enter();
    this.clock.getDelta();
  }

  exitHQBase() {
    this.audio.click();
    this.hqbase.exit();
    this.state = 'globe';
    this._showGlobeUI(true);
  }
```

In the resize listener, after the `if (this.level)` block, add:

```js
      if (this.hqbase && this.state === 'hqbase') this.hqbase.onResize();
```

In `_frame(dt...)`, add a branch before the `this.state === 'level'` branch:

```js
    } else if (this.state === 'hqbase') {
      this.hqbase.update(dt);
      if (!skipRender) this.renderer.render(this.hqbase.scene, this.hqbase.camera);
```

- [ ] **Step 5: Add minimal UI CSS**

Append to `styles.css`:

```css
#hqbase-ui {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  z-index: 20;
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hqbase.js src/main.js styles.css test/living-hq.mjs
git commit -m "feat: add living HQ scene state"
```

---

### Task 3: Build the Visible 3D Base

**Files:**
- Modify: `src/hqbase.js`
- Modify: `test/living-hq.mjs`

- [ ] **Step 1: Extend the test for a non-empty base**

Add after entering `hqbase`:

```js
const baseState = await page.evaluate(() => window.__game.hqbase.debugState());
check(baseState.children >= 12, `Живий Штаб має 3D-об'єкти (${baseState.children})`);
const canvasPixels = await page.evaluate(() => {
  const c = document.getElementById('game-canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return true;
  return c.width > 0 && c.height > 0;
});
check(canvasPixels, 'canvas живий після входу в Живий Штаб');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL because `children` is too small.

- [ ] **Step 3: Replace `build()` with a simple diorama**

In `src/hqbase.js`, replace `build()` with:

```js
  build() {
    this.dispose();
    this.scene.background = new THREE.Color(0x78bdf2);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6fb060, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(8, 12, 8);
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(12, 64),
      new THREE.MeshLambertMaterial({ color: 0x5fc46b })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const path = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.04, 18),
      new THREE.MeshLambertMaterial({ color: 0xd8bd82 })
    );
    path.position.y = 0.03;
    this.scene.add(path);

    this._addWall(-5.5, 0, 0x6f8fb8);
    this._addWall(5.5, 0, 0x6f8fb8);
    this._addHeroMannequin();
    this._addTrainingTargets();
  }
```

Add these helper methods inside the class:

```js
  _addWall(x, z, color) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 3, 8),
      new THREE.MeshLambertMaterial({ color })
    );
    wall.position.set(x, 1.5, z);
    this.scene.add(wall);
    for (let i = 0; i < 4; i++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.08),
        new THREE.MeshLambertMaterial({ color: 0xffd45a })
      );
      plate.position.set(x + (x < 0 ? 0.22 : -0.22), 2.35 - i * 0.55, -2.7 + i * 1.8);
      this.scene.add(plate);
    }
  }

  _addHeroMannequin() {
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.1, 0.25, 24),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    stand.position.set(0, 0.12, -4.2);
    this.scene.add(stand);
  }

  _addTrainingTargets() {
    this.targets = [];
    for (let i = 0; i < 3; i++) {
      const target = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.12, 24),
        new THREE.MeshLambertMaterial({ color: 0xf05a5a })
      );
      target.rotation.x = Math.PI / 2;
      target.position.set(-2 + i * 2, 1.2, 4.3);
      target.userData.isHqTarget = true;
      this.targets.push(target);
      this.scene.add(target);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10),
        new THREE.MeshLambertMaterial({ color: 0x60442a })
      );
      pole.position.set(target.position.x, 0.6, 4.45);
      this.scene.add(pole);
    }
  }
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hqbase.js test/living-hq.mjs
git commit -m "feat: render living HQ diorama"
```

---

### Task 4: Show Save-Driven Trophies and Hero

**Files:**
- Modify: `src/hqbase.js`
- Modify: `test/living-hq.mjs`

- [ ] **Step 1: Extend the test with seeded save data**

Before clicking `#btn-hqbase`, add:

```js
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true };
  g.save.records = { UKR: 123456 };
  g.save.missionRuns = { UKR: 2, POL: 1 };
  g.save.bestiary = { walker: 4, boss: 1, ghost: 1 };
  g.save.stats.killed = 99;
  g.save.activeSkin = 'custom';
  g.save.hero = { shirt: 0xe14b4b, pants: 0x2d3436, skin: 0xffc9a3 };
  g.saveGame();
});
```

After entering `hqbase`, add:

```js
const trophies = await page.evaluate(() => window.__game.hqbase.debugState());
check(trophies.countryTrophies >= 3, `показано трофеї звільнених країн (${trophies.countryTrophies})`);
check(trophies.beastTrophies >= 3, `показано відкритий бестіарій (${trophies.beastTrophies})`);
check(trophies.hasHero === true, 'манекен героя створено з поточного скіна');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL because `countryTrophies`, `beastTrophies`, and `hasHero` are missing/zero.

- [ ] **Step 3: Import existing data helpers**

At the top of `src/hqbase.js`, add:

```js
import { COUNTRIES, CAMPAIGN_ORDER } from './countries.js';
import { makeHero } from './characters.js';
```

- [ ] **Step 4: Add save-driven counters and hero**

Replace `_addHeroMannequin()` with:

```js
  _addHeroMannequin() {
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.1, 0.25, 24),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    stand.position.set(0, 0.12, -4.2);
    this.scene.add(stand);

    const hero = makeHero(this.game.save.activeSkin || 'classic', this.game.save.hero);
    hero.group.position.set(0, 0.28, -4.2);
    hero.group.rotation.y = Math.PI;
    hero.group.userData.isHqHero = true;
    this.hero = hero.group;
    this.scene.add(hero.group);
  }
```

Add this method:

```js
  _addSaveTrophies() {
    this.countryTrophies = 0;
    this.beastTrophies = 0;
    const saved = this.game.save.liberated || {};
    CAMPAIGN_ORDER.forEach((id, i) => {
      if (!saved[id]) return;
      const c = COUNTRIES[id];
      const trophy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.55, 18),
        new THREE.MeshLambertMaterial({ color: 0xffd45a })
      );
      trophy.position.set(-4.9, 0.8 + (i % 4) * 0.55, -3 + Math.floor(i / 4) * 1.8);
      trophy.userData.kind = 'country';
      trophy.userData.label = c.name;
      this.scene.add(trophy);
      this.countryTrophies++;
    });

    const b = this.game.save.bestiary || {};
    const ids = Object.keys(b).filter((id) => b[id] > 0).slice(0, 8);
    ids.forEach((id, i) => {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x8fd0ff })
      );
      box.position.set(4.9, 0.8 + (i % 4) * 0.55, -3 + Math.floor(i / 4) * 1.8);
      box.userData.kind = 'beast';
      box.userData.label = id;
      this.scene.add(box);
      this.beastTrophies++;
    });
  }
```

In `build()`, after `_addHeroMannequin();`, add:

```js
    this._addSaveTrophies();
```

Extend `debugState()`:

```js
  debugState() {
    return {
      ready: this.ready,
      hitCount: this.hitCount,
      children: this.scene.children.length,
      countryTrophies: this.countryTrophies || 0,
      beastTrophies: this.beastTrophies || 0,
      hasHero: !!this.hero,
    };
  }
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hqbase.js test/living-hq.mjs
git commit -m "feat: show save trophies in living HQ"
```

---

### Task 5: Add Safe Training Target Interaction

**Files:**
- Modify: `src/hqbase.js`
- Modify: `test/living-hq.mjs`

- [ ] **Step 1: Extend the test for target hits**

After entering `hqbase`, add:

```js
const beforeHit = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
await page.evaluate(() => window.__game.hqbase.hitFirstTarget());
const afterHit = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
check(afterHit === beforeHit + 1, `тренувальна мішень реагує (${beforeHit} → ${afterHit})`);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL because `hitFirstTarget` does not exist.

- [ ] **Step 3: Add local-only target hit behavior**

In `src/hqbase.js`, add constructor fields:

```js
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._onPointerDown = (e) => this._pickTarget(e);
    this.game.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
```

In `exit()`, before `this.dispose();`, add:

```js
    this.game.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
```

Add methods:

```js
  hitFirstTarget() {
    if (this.targets && this.targets[0]) this._hitTarget(this.targets[0]);
  }

  _pickTarget(e) {
    if (!this.ready || this.game.state !== 'hqbase') return;
    const rect = this.game.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hit = this._raycaster.intersectObjects(this.targets || [], false)[0];
    if (hit) this._hitTarget(hit.object);
  }

  _hitTarget(target) {
    this.hitCount++;
    target.material.color.setHex(0xffd45a);
    target.scale.setScalar(1.18);
    target.userData.flash = 0.25;
    if (this.game.audio && this.game.audio.click) this.game.audio.click();
    const ui = document.getElementById('hqbase-hit-count');
    if (ui) ui.textContent = String(this.hitCount);
  }
```

In `update(dt)`, after scene rotation, add:

```js
    for (const target of this.targets || []) {
      if (target.userData.flash > 0) {
        target.userData.flash -= dt;
        if (target.userData.flash <= 0) {
          target.material.color.setHex(0xf05a5a);
          target.scale.setScalar(1);
        }
      }
    }
```

Update `_ensureUi()` button HTML:

```js
      ui.innerHTML = `<button id="btn-hqbase-exit" class="btn">🌍 ${t('На глобус')}</button><div class="hqbase-counter">🎯 ${t('Мішені')}: <b id="hqbase-hit-count">0</b></div>`;
```

- [ ] **Step 4: Add counter CSS**

Append to `styles.css`:

```css
.hqbase-counter {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, .45);
  color: #fff;
  font-weight: 800;
  text-align: center;
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hqbase.js styles.css test/living-hq.mjs
git commit -m "feat: add living HQ training targets"
```

---

### Task 6: Mobile Safety, Cleanup, and Escape Handling

**Files:**
- Modify: `src/hqbase.js`
- Modify: `src/main.js`
- Modify: `test/living-hq.mjs`

- [ ] **Step 1: Extend the test for repeated enter/exit**

After the first exit check, add:

```js
await page.click('#btn-menu');
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 10000 });
await page.click('#btn-hqbase');
await page.waitForFunction(() => window.__game.state === 'hqbase', null, { timeout: 10000 });
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__game.state === 'globe', null, { timeout: 10000 });
check(await page.evaluate(() => window.__game.hqbase.debugState().ready) === false, 'Escape виходить і чистить active-state');
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL because Escape does not exit `hqbase`.

- [ ] **Step 3: Add Escape handling**

In the existing `window.addEventListener('keydown', ...)` block in `src/main.js`, after the input-field guard and before level shortcuts, add:

```js
      if (e.code === 'Escape' && this.state === 'hqbase') {
        this.exitHQBase();
        return;
      }
```

- [ ] **Step 4: Make dispose recursive enough**

Replace `dispose()` in `src/hqbase.js`:

```js
  dispose() {
    this.hero = null;
    this.targets = [];
    this.countryTrophies = 0;
    this.beastTrophies = 0;
    for (const obj of [...this.scene.children]) {
      this.scene.remove(obj);
      obj.traverse?.((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) m.dispose();
        }
      });
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
  }
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected: PASS.

- [ ] **Step 6: Run current HQ regression tests**

Run:

```bash
node test/update-hq.mjs
node test/update-hq-m7.mjs
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/hqbase.js test/living-hq.mjs
git commit -m "fix: make living HQ exit and cleanup safe"
```

---

### Task 7: Localization, Release Notes, and Version Bump

**Files:**
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Modify: `README.md`
- Modify: `src/main.js`
- Modify: `version.json`

- [ ] **Step 1: Add translations**

In `src/i18n/en.js`, add these entries near other HQ/wardrobe strings:

```js
"🏠 Увійти в Живий Штаб": "🏠 Enter Living HQ",
"Живий Штаб": "Living HQ",
"Мішені": "Targets",
```

In `src/i18n/ru.js`, add:

```js
"🏠 Увійти в Живий Штаб": "🏠 Войти в Живой Штаб",
"Живий Штаб": "Живой Штаб",
"Мішені": "Мишени",
```

- [ ] **Step 2: Bump version**

In `src/main.js`, change:

```js
const APP_VERSION = 62;
```

to:

```js
const APP_VERSION = 63;
```

In `version.json`, set the same version value used by the file today plus one. If it is:

```json
{"version":62}
```

change it to:

```json
{"version":63}
```

- [ ] **Step 3: Add README release note**

In `README.md`, insert above v62:

```md
**v63 «Живий Штаб»**: у Штабі зʼявився вхід у маленьку 3D-базу рятівника. Там видно героя, трофеї врятованих країн, відкритий бестіарій і безпечні тренувальні мішені. Це не редактор і не чат — лише дитяче місце, де досягнення оживають у світі гри.
```

- [ ] **Step 4: Run focused and broad tests**

Run:

```bash
node test/living-hq.mjs
node test/i18n.mjs
node test/version-check.mjs
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.js src/i18n/ru.js README.md src/main.js version.json
git commit -m "chore: document living HQ release"
```

---

## Final Verification

- [ ] **Step 1: Run focused HQ suite**

```bash
node test/living-hq.mjs
node test/update-hq.mjs
node test/update-hq-m2.mjs
node test/update-hq-m7.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run smoke**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Manual browser check**

Open:

```text
http://localhost:8741/?test&fresh
```

Manual checks:

- Open `☰ Меню` → `Штаб`.
- Press `Увійти в Живий Штаб`.
- Confirm 3D base appears and no campaign UI overlaps.
- Click/tap a target; the target flashes and counter increments.
- Press `Escape` or `На глобус`; returns to globe.
- Open a normal campaign level; movement/shooting still works.

## Self-Review

Spec coverage:

- Living 3D place: Task 2 + Task 3.
- Existing progress made visible in-world: Task 4.
- Safe training interaction: Task 5.
- No UGC/chat/networking/new economy: enforced by Scope and file list.
- Mobile-safe UI: Task 6 + Task 7.
- Tests: Tasks 1-7 plus Final Verification.

Placeholder scan:

- No placeholder or deferred-work markers remain in executable steps.
- Deferred items are explicit scope cuts, not missing work.

Type consistency:

- `LivingHQ` methods used by `Game`: `enter`, `exit`, `update`, `onResize`, `debugState`.
- Test helper `hitFirstTarget` is defined before use.
- State name is consistently `hqbase`.

## Handoff

Recommended execution mode: subagent-driven, one task at a time, with review after each commit. This update touches the game loop, rendering, UI, and tests; small commits keep rollback cheap.
