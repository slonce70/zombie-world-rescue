# Rescuer Base 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing 3D Rescuer Base into a richer Base 2.0 where the player can see trophies, mega quests, a training arena, damage mannequins, skin collection, and a Hall of Fame.

**Architecture:** Keep the existing `LivingHQ` scene controller in `src/hqbase.js`; do not create a new game mode, save schema, economy, or networking. Base 2.0 is read-only and derives everything from existing save data: `liberated`, `worldBosses`, `megaQuests`, `skins`, `stats`, `xp`, and pass progress. The only session-local state is target hits and damage dealt to mannequins.

**Tech Stack:** Vanilla JS modules, Three.js, existing browser overlays, existing `t()` i18n helper, Playwright-based `.mjs` tests, existing release sync via `version.json` + `APP_VERSION` + `sw.js`.

---

## Scope

Build now:

- 3D trophy wall for liberated countries and cleared world bosses.
- Mega quest progress board inside the 3D base and compact UI summary.
- Training arena with current click targets and new damage mannequins.
- Skin collection display using owned hero skins.
- Hall of Fame display derived from existing stats and progress.
- Quick buttons from base to Quest panel and Wardrobe.
- EN/RU translations for new visible strings.
- Version bump to v153 and README release note.

Skip:

- No new currency, rewards, achievements, or permanent save fields.
- No new combat physics in base.
- No text geometry or external font assets.
- No new dependencies.

This is deliberate ponytail scope: big visible upgrade, small data model risk.

---

## File Map

### Modify: `src/hqbase.js`

Owns the 3D Base scene. Add simple visual zones and debug counters:

- World boss trophies.
- Mega quest board.
- Skin collection.
- Hall of Fame plaques.
- Damage mannequins.
- UI counters and quick buttons.

### Modify: `styles.css`

Only extend existing `.hqbase-*` styles:

- Compact UI wrapping.
- Mini mega quest list.
- Damage counter readability.
- Mobile-safe layout.

### Modify: `test/living-hq.mjs`

Existing Base integration test. Extend it to seed rich save data and verify:

- Base 2.0 counters.
- 3D objects exist.
- Damage mannequin interaction.
- Quest/Wardrobe quick buttons.
- Exit cleanup still works.

### Modify: `src/i18n/en.js`

Add English translations for new Ukrainian Base 2.0 UI strings.

### Modify: `src/i18n/ru.js`

Add Russian translations for new Ukrainian Base 2.0 UI strings.

### Modify: `test/i18n.mjs`

Add a tiny Base UI translation assertion for EN/RU, using the existing style.

### Modify: `version.json`

Bump from `152` to `153`.

### Modify: `src/main.js`

Bump `APP_VERSION` from `152` to `153`.

No Base logic changes are planned here.

### Modify: `sw.js`

Bump cache key from `zr-cache-v152` to `zr-cache-v153`.

### Modify: `README.md`

Update current release note to v153 “База Рятівника 2.0”.

---

## Current Code Anchors

- `src/main.js` already creates `this.hqbase = new LivingHQ(this)` and switches to `state === 'hqbase'`.
- `src/hqbase.js` already has:
  - `enter()`, `exit()`, `build()`, `update(dt)`, `dispose()`.
  - `hitFirstTarget()` for tests.
  - `debugState()` for tests.
  - Existing UI container `#hqbase-ui`.
- `test/living-hq.mjs` already covers entry, trophies, target hits, exit cleanup, and Escape.
- `src/ui/hq.js` remains the 2D dashboard. Base 2.0 remains the 3D companion launched from this dashboard.

---

## Task 1: Base 2.0 Visual Zones

**Files:**

- Modify: `test/living-hq.mjs`
- Modify: `src/hqbase.js`

### Goal

Show the new Base 2.0 zones in 3D: world boss trophies, mega quest board, owned skin collection, and Hall of Fame plaques.

### Steps

- [ ] **Step 1: Extend the failing test seed**

In `test/living-hq.mjs`, replace the current save seed block with this richer seed:

```js
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true };
  g.save.worldBosses = { radiation: true, ice: true };
  g.save.records = { UKR: 123456 };
  g.save.missionRuns = { UKR: 2, POL: 1 };
  g.save.bestiary = { walker: 4, boss: 1, ghost: 1 };
  g.save.stats.killed = 99;
  g.save.stats.bosses = 7;
  g.save.stats.megaboxes = 3;
  g.save.stats.bestCombo = 12;
  g.save.xp = 900;
  g.save.skins = ['classic', 'custom', 'gold', 'wizard', 'military'];
  g.save.activeSkin = 'custom';
  g.save.hero = { shirt: 0xe14b4b, pants: 0x2d3436, skin: 0xffc9a3 };
  g.save.megaQuests = {
    damage10000: { progress: 10000, done: true },
    kills500: { progress: 250, done: false },
    headshots150: { progress: 15, done: false },
  };
  g.quests.ensureMegaQuests();
  g.saveGame();
});
```

- [ ] **Step 2: Add failing Base 2.0 assertions**

In `test/living-hq.mjs`, after the existing `const st = await page.evaluate(() => window.__game.hqbase.debugState());`, add:

```js
check(st.worldBossTrophies >= 2, `показано трофеї світових босів (${st.worldBossTrophies})`);
check(st.megaQuestRows >= 6, `показано дошку мега-квестів (${st.megaQuestRows})`);
check(st.skinDisplays >= 5, `показано колекцію скінів (${st.skinDisplays})`);
check(st.hallPlaques >= 4, `показано зал слави (${st.hallPlaques})`);
```

- [ ] **Step 3: Run test and verify it fails**

Run:

```bash
npm run serve
node test/living-hq.mjs
```

Expected: FAIL with at least one of:

```text
❌ показано трофеї світових босів
❌ показано дошку мега-квестів
❌ показано колекцію скінів
❌ показано зал слави
```

- [ ] **Step 4: Add imports for existing data**

In `src/hqbase.js`, update imports:

```js
import * as THREE from 'three';
import { t } from './i18n.js';
import { COUNTRIES, CAMPAIGN_ORDER } from './countries.js';
import { makeHero, HERO_SKINS } from './characters.js';
import { WORLD_BOSSES } from './worldboss.js';
```

- [ ] **Step 5: Add Base 2.0 counters to constructor**

In `LivingHQ.constructor`, after `this.targets = [];`, add:

```js
    this.dummies = [];
    this.damageTotal = 0;
    this.worldBossTrophies = 0;
    this.megaQuestRows = 0;
    this.skinDisplays = 0;
    this.hallPlaques = 0;
```

- [ ] **Step 6: Add tiny mesh helper**

In `src/hqbase.js`, after `_addWall(...)`, add:

```js
  _addBox(x, y, z, sx, sy, sz, color, data = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y, z);
    Object.assign(mesh.userData, data);
    this.scene.add(mesh);
    return mesh;
  }
```

- [ ] **Step 7: Call new visual zones from `build()`**

In `src/hqbase.js`, change the end of `build()` to:

```js
    this._addHeroMannequin();
    this._addSaveTrophies();
    this._addWorldBossTrophies();
    this._addMegaQuestBoard();
    this._addSkinCollection();
    this._addHallOfFame();
    this._addTrainingTargets();
```

- [ ] **Step 8: Add world boss trophies**

In `src/hqbase.js`, after `_addSaveTrophies()`, add:

```js
  _addWorldBossTrophies() {
    this.worldBossTrophies = 0;
    const done = this.game.save.worldBosses || {};
    WORLD_BOSSES.forEach((boss, i) => {
      if (!done[boss.id]) return;
      const trophy = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 18, 12),
        new THREE.MeshLambertMaterial({ color: boss.id === 'radiation' ? 0x77d56c : boss.id === 'ice' ? 0xa8e8ff : 0xff5c5c })
      );
      trophy.position.set(-3 + i * 1.2, 1.05, -6.1);
      trophy.userData.kind = 'world-boss-trophy';
      trophy.userData.label = boss.id;
      this.scene.add(trophy);
      this._addBox(-3 + i * 1.2, 0.45, -6.1, 0.8, 0.25, 0.8, 0x3a2f22, { kind: 'world-boss-stand' });
      this.worldBossTrophies++;
    });
  }
```

- [ ] **Step 9: Add mega quest board**

In `src/hqbase.js`, after `_addWorldBossTrophies()`, add:

```js
  _addMegaQuestBoard() {
    this.megaQuestRows = 0;
    this.game.quests.ensureMegaQuests();
    const quests = this.game.quests.megaList;
    this._addBox(0, 1.55, -6.8, 4.8, 2.1, 0.18, 0x20324d, { kind: 'mega-board' });
    quests.forEach((q, i) => {
      const y = 2.3 - i * 0.28;
      const ratio = Math.max(0.04, Math.min(1, q.progress / q.target));
      const rowColor = q.done ? 0x6fe06f : 0xf5c542;
      this._addBox(-1.9, y, -6.65, 0.18, 0.14, 0.12, rowColor, { kind: 'mega-row-icon', id: q.id });
      this._addBox(-0.55, y, -6.63, 2.2, 0.08, 0.08, 0x0b1422, { kind: 'mega-row-bg', id: q.id });
      this._addBox(-1.65 + ratio * 1.1, y, -6.58, 2.2 * ratio, 0.08, 0.1, rowColor, { kind: 'mega-row-fill', id: q.id });
      this.megaQuestRows++;
    });
  }
```

- [ ] **Step 10: Add owned skin collection**

In `src/hqbase.js`, after `_addMegaQuestBoard()`, add:

```js
  _addSkinCollection() {
    this.skinDisplays = 0;
    const owned = (this.game.save.skins || []).filter((id) => HERO_SKINS[id]).slice(0, 6);
    owned.forEach((id, i) => {
      const hero = makeHero(id, this.game.save.hero);
      hero.group.position.set(3.1 + (i % 3) * 1.0, 0.18, -3.6 + Math.floor(i / 3) * 1.2);
      hero.group.rotation.y = Math.PI * 0.78;
      hero.group.scale.setScalar(0.48);
      hero.group.userData.kind = 'skin-display';
      hero.group.userData.skin = id;
      this.scene.add(hero.group);
      this._addBox(hero.group.position.x, 0.08, hero.group.position.z, 0.75, 0.16, 0.75, 0xffffff, { kind: 'skin-stand', skin: id });
      this.skinDisplays++;
    });
  }
```

- [ ] **Step 11: Add Hall of Fame plaques**

In `src/hqbase.js`, after `_addSkinCollection()`, add:

```js
  _addHallOfFame() {
    this.hallPlaques = 0;
    const s = this.game.save.stats || {};
    const worldBossDone = Object.keys(this.game.save.worldBosses || {}).filter((id) => this.game.save.worldBosses[id]).length;
    const values = [
      ['kills', s.killed || 0, 0xf05a5a],
      ['bosses', s.bosses || 0, 0xffd45a],
      ['worldBosses', worldBossDone, 0x77d56c],
      ['combo', s.bestCombo || 0, 0x8fd0ff],
    ];
    values.forEach(([id, n, color], i) => {
      const x = -4.5 + i * 1.0;
      const h = 0.35 + Math.min(1.2, n / (id === 'kills' ? 100 : 10));
      this._addBox(x, 0.25, 5.4, 0.65, 0.25, 0.65, 0x3a2f22, { kind: 'hall-stand', id });
      this._addBox(x, 0.5 + h / 2, 5.4, 0.42, h, 0.42, color, { kind: 'hall-plaque', id, value: n });
      this.hallPlaques++;
    });
  }
```

- [ ] **Step 12: Reset new counters on dispose**

In `dispose()`, after current resets, make the reset block:

```js
    this.hero = null;
    this.targets = [];
    this.dummies = [];
    this.countryTrophies = 0;
    this.beastTrophies = 0;
    this.worldBossTrophies = 0;
    this.megaQuestRows = 0;
    this.skinDisplays = 0;
    this.hallPlaques = 0;
    this.damageTotal = 0;
```

- [ ] **Step 13: Extend `debugState()`**

In `debugState()`, return:

```js
  debugState() {
    return {
      ready: this.ready,
      hitCount: this.hitCount,
      damageTotal: this.damageTotal,
      children: this.scene.children.length,
      countryTrophies: this.countryTrophies || 0,
      beastTrophies: this.beastTrophies || 0,
      worldBossTrophies: this.worldBossTrophies || 0,
      megaQuestRows: this.megaQuestRows || 0,
      skinDisplays: this.skinDisplays || 0,
      hallPlaques: this.hallPlaques || 0,
      dummyCount: (this.dummies || []).length,
      hasHero: !!this.hero,
    };
  }
```

- [ ] **Step 14: Run test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected:

```text
🎉 ЖИВИЙ ШТАБ ПРОЙДЕНО
```

- [ ] **Step 15: Commit**

Run:

```bash
git add src/hqbase.js test/living-hq.mjs
git commit -m "Add Base 2.0 visual zones"
```

---

## Task 2: Damage Mannequins

**Files:**

- Modify: `test/living-hq.mjs`
- Modify: `src/hqbase.js`

### Goal

Add safe damage mannequins to the training arena. They do not affect save data; they only show session damage inside the base.

### Steps

- [ ] **Step 1: Add failing mannequin assertions**

In `test/living-hq.mjs`, replace the current training target block:

```js
console.log('▸ Тренувальна мішень');
const before = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
await page.evaluate(() => window.__game.hqbase.hitFirstTarget());
const after = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
check(after === before + 1, `мішень реагує (${before} → ${after})`);
```

with:

```js
console.log('▸ Тренувальна арена і манекени шкоди');
const beforeTarget = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
await page.evaluate(() => window.__game.hqbase.hitFirstTarget());
const afterTarget = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
check(afterTarget === beforeTarget + 1, `мішень реагує (${beforeTarget} → ${afterTarget})`);

const beforeDummy = await page.evaluate(() => window.__game.hqbase.debugState());
await page.evaluate(() => window.__game.hqbase.hitFirstDummy());
const afterDummy = await page.evaluate(() => window.__game.hqbase.debugState());
check(beforeDummy.dummyCount >= 3, `манекени створено (${beforeDummy.dummyCount})`);
check(afterDummy.damageTotal === beforeDummy.damageTotal + 25, `манекен рахує шкоду (${beforeDummy.damageTotal} → ${afterDummy.damageTotal})`);
check(await page.textContent('#hqbase-ui').then((s) => /Шкода.*25|Damage.*25|Урон.*25/.test(s || '')), 'UI бази показує шкоду по манекенах');
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL with:

```text
hitFirstDummy is not a function
```

or:

```text
❌ манекени створено
```

- [ ] **Step 3: Reset damage in `enter()`**

In `src/hqbase.js`, update `enter()`:

```js
  enter() {
    this.ready = true;
    this.hitCount = 0;
    this.damageTotal = 0;
    this._ensureUi();
    this.build();
    this.onResize();
    this.game.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
  }
```

- [ ] **Step 4: Add damage mannequins to training zone**

In `src/hqbase.js`, add this method after `_addTrainingTargets()`:

```js
  _addDamageDummies() {
    this.dummies = [];
    for (let i = 0; i < 3; i++) {
      const x = -2 + i * 2;
      const body = this._addBox(x, 1.05, 6.1, 0.55, 1.5, 0.32, 0x6f8fb8, {
        isHqTarget: true,
        isHqDummy: true,
        hp: 100,
        maxHp: 100,
      });
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 10),
        new THREE.MeshLambertMaterial({ color: 0xffc9a3 })
      );
      head.position.set(x, 2.0, 6.1);
      head.userData.isHqDummyHead = true;
      body.add(head);
      this.targets.push(body);
      this.dummies.push(body);
    }
  }
```

- [ ] **Step 5: Call mannequins from `build()`**

In `build()`, after `_addTrainingTargets();`, add:

```js
    this._addDamageDummies();
```

- [ ] **Step 6: Add `hitFirstDummy()` and dummy damage**

In `src/hqbase.js`, after `hitFirstTarget()`, add:

```js
  hitFirstDummy() {
    if (this.dummies && this.dummies[0]) this._hitTarget(this.dummies[0]);
  }
```

Then update `_hitTarget(target)` to:

```js
  _hitTarget(target) {
    if (target.userData.isHqDummy) {
      this._hitDummy(target);
      return;
    }
    this.hitCount++;
    target.material.color.setHex(0xffd45a);
    target.scale.setScalar(1.18);
    target.userData.flash = 0.25;
    if (this.game.audio && this.game.audio.click) this.game.audio.click();
    const ui = document.getElementById('hqbase-hit-count');
    if (ui) ui.textContent = String(this.hitCount);
  }
```

Add `_hitDummy` after `_hitTarget`:

```js
  _hitDummy(dummy) {
    const dmg = 25;
    this.damageTotal += dmg;
    dummy.userData.hp = Math.max(0, (dummy.userData.hp || dummy.userData.maxHp || 100) - dmg);
    dummy.material.color.setHex(dummy.userData.hp <= 0 ? 0xffd45a : 0xf05a5a);
    dummy.scale.setScalar(1.08);
    dummy.userData.flash = 0.25;
    if (dummy.userData.hp <= 0) dummy.userData.hp = dummy.userData.maxHp || 100;
    if (this.game.audio && this.game.audio.click) this.game.audio.click();
    const ui = document.getElementById('hqbase-damage-count');
    if (ui) ui.textContent = String(this.damageTotal);
  }
```

- [ ] **Step 7: Make flash reset handle dummies**

In `update(dt)`, keep the current loop and change the reset color line to:

```js
          target.material.color.setHex(target.userData.isHqDummy ? 0x6f8fb8 : 0xf05a5a);
```

- [ ] **Step 8: Add damage counter element**

In `_ensureUi()` innerHTML counter, Task 3 will expand the whole UI. For this task, minimally add this fragment into `.hqbase-counter`:

```html
 · 💥 ${t('Шкода')}: <b id="hqbase-damage-count">0</b>
```

After the existing hit counter reset, add:

```js
    const dmg = document.getElementById('hqbase-damage-count');
    if (dmg) dmg.textContent = '0';
```

- [ ] **Step 9: Run test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected:

```text
🎉 ЖИВИЙ ШТАБ ПРОЙДЕНО
```

- [ ] **Step 10: Commit**

Run:

```bash
git add src/hqbase.js test/living-hq.mjs
git commit -m "Add Base damage mannequins"
```

---

## Task 3: Base 2.0 UI, Quick Buttons, and Compact Summaries

**Files:**

- Modify: `test/living-hq.mjs`
- Modify: `src/hqbase.js`
- Modify: `styles.css`

### Goal

Make Base 2.0 understandable without tutorial text: counters, compact mega quest summary, and quick buttons to Quests and Wardrobe.

### Steps

- [ ] **Step 1: Add failing UI assertions**

In `test/living-hq.mjs`, after existing checks for `#btn-hqbase-wardrobe` and `#btn-hqbase-panel`, add:

```js
check(!!await page.$('#btn-hqbase-quests'), 'у базі є швидка кнопка Квестів');
check(await page.textContent('#hqbase-ui').then((s) => /Скіни.*5|Skins.*5|Скины.*5/.test(s || '')), 'UI бази показує кількість скінів');
check(await page.textContent('#hqbase-ui').then((s) => /Зал.*4|Hall.*4|Зал.*4/.test(s || '')), 'UI бази показує зал слави');
check(await page.textContent('#hqbase-mega-list').then((s) => /МЕГА|MEGA/.test(s || '')), 'UI бази показує мега-квести');
```

After the Escape exit block, add a quick button roundtrip:

```js
await page.click('#btn-menu');
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 10000 });
await page.click('#btn-hqbase');
await page.waitForFunction(() => window.__game.state === 'hqbase', null, { timeout: 10000 });
await page.click('#btn-hqbase-quests');
await page.waitForSelector('#overlay-quests.show', { timeout: 10000 });
check(await page.textContent('#quest-list').then((s) => /Мега-квести|Mega quests|Мега-квесты/.test(s || '')), 'кнопка Квести відкриває мега-квести');
await page.click('[data-close="overlay-quests"]');
await page.waitForFunction(() => !document.getElementById('overlay-quests').classList.contains('show'), null, { timeout: 10000 });
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node test/living-hq.mjs
```

Expected: FAIL with missing `#btn-hqbase-quests` or missing `#hqbase-mega-list`.

- [ ] **Step 3: Replace `_ensureUi()` HTML**

In `src/hqbase.js`, inside `_ensureUi()`, replace `ui.innerHTML = ...` with:

```js
      ui.innerHTML = `<div class="hqbase-actions">
        <button id="btn-hqbase-exit" class="btn">🌍 ${t('На глобус')}</button>
        <button id="btn-hqbase-panel" class="btn">🏠 ${t('База')}</button>
        <button id="btn-hqbase-quests" class="btn">📅 ${t('Квести')}</button>
        <button id="btn-hqbase-wardrobe" class="btn">🎒 ${t('Гардероб')}</button>
      </div><div class="hqbase-counter">
        🗺️ ${t('Країни')}: <b id="hqbase-country-count">0</b> ·
        📖 ${t('Бестіарій')}: <b id="hqbase-beast-count">0</b> ·
        🌋 ${t('Боси')}: <b id="hqbase-worldboss-count">0</b> ·
        👕 ${t('Скіни')}: <b id="hqbase-skin-count">0</b> ·
        🏆 ${t('Зал')}: <b id="hqbase-hall-count">0</b> ·
        🎯 ${t('Мішені')}: <b id="hqbase-hit-count">0</b> ·
        💥 ${t('Шкода')}: <b id="hqbase-damage-count">0</b>
      </div><div id="hqbase-mega-list" class="hqbase-mini"></div>`;
```

- [ ] **Step 4: Add Quest button listener**

In `_ensureUi()`, after `btn-hqbase-panel` listener, add:

```js
      document.getElementById('btn-hqbase-quests').addEventListener('click', () => {
        this.game.exitHQBase();
        this.game.renderQuestsPanel();
        this.game._showOverlay('overlay-quests');
      });
```

- [ ] **Step 5: Update all counters**

At the bottom of `_ensureUi()`, replace the counter update section with:

```js
    const hit = document.getElementById('hqbase-hit-count');
    if (hit) hit.textContent = '0';
    const dmg = document.getElementById('hqbase-damage-count');
    if (dmg) dmg.textContent = '0';
    const save = this.game.save;
    const saved = save.liberated || {};
    const bestiary = save.bestiary || {};
    const countries = Object.keys(saved).filter((id) => saved[id]).length;
    const beasts = Object.keys(bestiary).filter((id) => bestiary[id] > 0).length;
    const worldBosses = Object.keys(save.worldBosses || {}).filter((id) => save.worldBosses[id]).length;
    const skins = (save.skins || []).filter((id) => HERO_SKINS[id]).length;
    const hall = 4;
    const cc = document.getElementById('hqbase-country-count');
    const bc = document.getElementById('hqbase-beast-count');
    const wc = document.getElementById('hqbase-worldboss-count');
    const sc = document.getElementById('hqbase-skin-count');
    const hc = document.getElementById('hqbase-hall-count');
    if (cc) cc.textContent = String(countries);
    if (bc) bc.textContent = String(beasts);
    if (wc) wc.textContent = String(worldBosses);
    if (sc) sc.textContent = String(skins);
    if (hc) hc.textContent = String(hall);

    this.game.quests.ensureMegaQuests();
    const mini = document.getElementById('hqbase-mega-list');
    if (mini) {
      mini.innerHTML = this.game.quests.megaList.slice(0, 3).map((q) => {
        const pct = Math.round((q.progress / q.target) * 100);
        return `<div class="hqbase-mini-row ${q.done ? 'done' : ''}">
          <span>${q.icon} ${q.title}</span><b>${pct}%</b>
        </div>`;
      }).join('');
    }
```

- [ ] **Step 6: Add UI CSS**

In `styles.css`, replace the current Base CSS block with:

```css
/* 🏠 База */
.hqbase-row { display: flex; justify-content: center; margin: 8px 0 14px; }
.hqbase-enter { width: min(100%, 360px); }
#hqbase-ui {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  right: max(12px, env(safe-area-inset-right));
  z-index: 20;
  max-width: 720px;
  pointer-events: auto;
}
.hqbase-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.hqbase-actions .btn { min-height: 38px; }
.hqbase-counter {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, .48);
  color: #fff;
  font-weight: 800;
  line-height: 1.55;
}
.hqbase-mini {
  margin-top: 8px;
  display: grid;
  gap: 5px;
  max-width: 560px;
}
.hqbase-mini-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, .42);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.hqbase-mini-row.done { background: rgba(76, 193, 88, .48); }
@media (max-width: 640px) {
  #hqbase-ui { max-width: none; }
  .hqbase-counter { font-size: 12px; }
  .hqbase-mini-row { font-size: 11px; }
}
```

- [ ] **Step 7: Run test and verify it passes**

Run:

```bash
node test/living-hq.mjs
```

Expected:

```text
🎉 ЖИВИЙ ШТАБ ПРОЙДЕНО
```

- [ ] **Step 8: Commit**

Run:

```bash
git add src/hqbase.js styles.css test/living-hq.mjs
git commit -m "Add Base 2.0 controls"
```

---

## Task 4: Base 2.0 Localization

**Files:**

- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Modify: `test/i18n.mjs`

### Goal

Keep Base 2.0 clean in English and Russian.

### Steps

- [ ] **Step 1: Add failing EN/RU i18n assertions**

In `test/i18n.mjs`, after the existing EN hero editor assertions, add:

```js
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true };
  g.save.skins = ['classic', 'custom', 'gold'];
  g.hqbase.enter();
});
const enBase = await page.textContent('#hqbase-ui');
check(/Quests/.test(enBase) && /Skins/.test(enBase) && /Damage/.test(enBase), 'en: Base 2.0 UI translated', enBase);
await page.evaluate(() => window.__game.hqbase.exit());
```

After the existing RU hero editor assertions, add:

```js
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true };
  g.save.skins = ['classic', 'custom', 'gold'];
  g.hqbase.enter();
});
const ruBase = await page.textContent('#hqbase-ui');
check(/Квесты/.test(ruBase) && /Скины/.test(ruBase) && /Урон/.test(ruBase), 'ru: Base 2.0 UI translated', ruBase);
await page.evaluate(() => window.__game.hqbase.exit());
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node test/i18n.mjs
```

Expected: FAIL because at least one new Base 2.0 key remains Ukrainian in EN/RU.

- [ ] **Step 3: Add English translations**

In `src/i18n/en.js`, add these entries to the exported dictionary:

```js
"Квести": "Quests",
"Боси": "Bosses",
"Зал": "Hall",
"Шкода": "Damage",
"Зал слави": "Hall of Fame",
"Колекція скінів": "Skin Collection",
"Манекени шкоди": "Damage Dummies",
```

If some keys already exist, keep the existing entry and add only missing keys.

- [ ] **Step 4: Add Russian translations**

In `src/i18n/ru.js`, add these entries to the exported dictionary:

```js
"Квести": "Квесты",
"Боси": "Боссы",
"Зал": "Зал",
"Шкода": "Урон",
"Зал слави": "Зал славы",
"Колекція скінів": "Коллекция скинов",
"Манекени шкоди": "Манекены урона",
```

If some keys already exist, keep the existing entry and add only missing keys.

- [ ] **Step 5: Run i18n test**

Run:

```bash
node test/i18n.mjs
```

Expected:

```text
🎉 ЛОКАЛІЗАЦІЯ ПРАЦЮЄ
```

- [ ] **Step 6: Commit**

Run:

```bash
git add src/i18n/en.js src/i18n/ru.js test/i18n.mjs
git commit -m "Localize Base 2.0"
```

---

## Task 5: Base 2.0 Regression Pass

**Files:**

- Modify only if a test exposes a real defect:
  - `src/hqbase.js`
  - `styles.css`
  - `test/living-hq.mjs`

### Goal

Catch regressions before the release bump: scene cleanup, repeated entry, quick buttons, and mobile-safe UI.

### Steps

- [ ] **Step 1: Run focused Base test**

Run:

```bash
node test/living-hq.mjs
```

Expected:

```text
🎉 ЖИВИЙ ШТАБ ПРОЙДЕНО
```

- [ ] **Step 2: Run smoke test**

Run:

```bash
npm test
```

Expected:

```text
🎉 СМОУК ПРОЙДЕНО
```

- [ ] **Step 3: Run i18n test**

Run:

```bash
node test/i18n.mjs
```

Expected:

```text
🎉 ЛОКАЛІЗАЦІЯ ПРАЦЮЄ
```

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit only if fixes were needed**

If Step 1-4 required a code fix, commit:

```bash
git add src/hqbase.js styles.css test/living-hq.mjs
git commit -m "Tighten Base 2.0 regression coverage"
```

If no fixes were needed, do not create an empty commit.

---

## Task 6: Release v153 Metadata

**Files:**

- Modify: `version.json`
- Modify: `src/main.js`
- Modify: `sw.js`
- Modify: `README.md`

### Goal

Ship Base 2.0 as v153 with synchronized app version and service worker cache.

### Steps

- [ ] **Step 1: Bump `version.json`**

Change:

```json
{ "v": 152 }
```

to:

```json
{ "v": 153 }
```

- [ ] **Step 2: Bump `APP_VERSION`**

In `src/main.js`, change:

```js
const APP_VERSION = 152;
```

to:

```js
const APP_VERSION = 153;
```

- [ ] **Step 3: Bump service worker cache**

In `sw.js`, change:

```js
const CACHE = 'zr-cache-v152';
```

to:

```js
const CACHE = 'zr-cache-v153';
```

- [ ] **Step 4: Update README current release note**

In `README.md`, replace the current top release note with:

```markdown
**v153 «База Рятівника 2.0»**: 3D-база стала справжнім місцем трофеїв: видно звільнені країни, переможених світових босів, дошку мега-квестів, колекцію скінів, зал слави і тренувальні манекени для шкоди.
```

- [ ] **Step 5: Run version sync test**

Run:

```bash
node test/version-sync.mjs
```

Expected:

```text
version.json.v=153  APP_VERSION=153
🎉 ВЕРСІЇ СИНХРОНІЗОВАНІ
```

- [ ] **Step 6: Commit**

Run:

```bash
git add version.json src/main.js sw.js README.md
git commit -m "Release v153 Base 2.0"
```

---

## Task 7: Final Verification and Push

**Files:**

- No planned code edits.

### Goal

Verify and push `main` only after all evidence is fresh.

### Steps

- [ ] **Step 1: Ensure server is running**

Run in one terminal:

```bash
npm run serve
```

Expected:

```text
Serving HTTP on :: port 8741
```

- [ ] **Step 2: Run full focused verification**

Run:

```bash
npm test
node test/living-hq.mjs
node test/i18n.mjs
node test/version-sync.mjs
git diff --check
```

Expected:

```text
🎉 СМОУК ПРОЙДЕНО
🎉 ЖИВИЙ ШТАБ ПРОЙДЕНО
🎉 ЛОКАЛІЗАЦІЯ ПРАЦЮЄ
🎉 ВЕРСІЇ СИНХРОНІЗОВАНІ
```

`git diff --check` must produce no output.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short --branch
```

Expected before push:

```text
## main...origin/main [ahead N]
```

No modified or untracked files.

- [ ] **Step 4: Fetch origin**

Run:

```bash
git fetch origin main
git status --short --branch
```

Expected: still only ahead of `origin/main`; no behind state.

- [ ] **Step 5: Push**

Run:

```bash
git push origin main
```

Expected:

```text
main -> main
```

- [ ] **Step 6: Stop local server**

Press `Ctrl-C` in the `npm run serve` terminal.

- [ ] **Step 7: Final status**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main
```

---

## Self-Review

### Spec Coverage

- Trophies: Task 1 adds country trophies already present, plus world boss trophies.
- Mega quests: Task 1 adds the 3D board; Task 3 adds compact UI summary and Quests button.
- Training arena: existing targets remain; Task 2 adds damage mannequins.
- Damage mannequins: Task 2 adds click damage and UI counter.
- Skin collection: Task 1 adds owned skin displays.
- Hall of Fame: Task 1 adds stat plaques.
- Atmosphere without too much combat scope: no new economy, no new mode, no save migration.
- Release to main: Task 6 and Task 7 cover version, verification, and push.

### Placeholder Scan

No placeholder work remains. Every task has concrete files, exact snippets, commands, expected outputs, and commit messages.

### Type and Name Consistency

Names introduced and reused consistently:

- `worldBossTrophies`
- `megaQuestRows`
- `skinDisplays`
- `hallPlaques`
- `dummies`
- `damageTotal`
- `hitFirstDummy()`
- `#hqbase-damage-count`
- `#hqbase-mega-list`
- `#btn-hqbase-quests`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-28-rescuer-base-2.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
