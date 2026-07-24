# Bastion Hypercharge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require 10 hits for Bastion's normal Super, unlock gadgets at level 3, and add a level-5 Hypercharge that upgrades Super Punch for five seconds.

**Architecture:** Reuse the existing specialist charge listener, `Gadgets` input/update loop, `Player.bastionSuperPunch()`, zombie slow state, fighter profile, HUD, touch controls, and cloud-save manifest. Hypercharge combat charge remains runtime state on `level.specialist`; only purchase ownership is persisted.

**Tech Stack:** JavaScript ES modules, Three.js, DOM/CSS overlays, Playwright browser tests.

## Global Constraints

- Normal Super charges by `10%` per successful fist attack.
- Bastion gadgets unlock at fighter level `3`.
- Each Bastion gadget costs `1000` coins and is purchased separately.
- Hypercharge unlocks at fighter level `5` and charges by `2%` per successful fist attack.
- Hypercharge costs `5000` coins once.
- Hypercharge uses `X`, lasts `5 seconds`, and is lost when the timer expires.
- Enhanced Super uses `C`, hits `7×4 m`, deals `750` fixed damage, and slows hit zombies by `50%` for `4 seconds`.
- Normal Super remains `7×2 m` and `500` fixed damage.
- Purchases persist as `bastionGadgetsOwned` and `bastionHyperOwned`.
- `PROTO_VERSION` remains `23`; no dependency is added.

---

### Task 1: Encode thresholds and level gates

**Files:**
- Modify: `src/specialists.js`
- Modify: `src/main.js`
- Modify: `src/extras.js`
- Modify: `src/net/cloudsave.js`
- Modify: `test/specialists.mjs`
- Modify: `test/fighter-progression-browser.mjs`
- Modify: `test/save-migration.mjs`
- Modify: `test/cloudsave.mjs`

**Interfaces:**
- Produces: `SPECIALISTS.bastion.chargePerHit === 10`.
- Produces: `SPECIALISTS.bastion.hyperChargePerHit === 2`.
- Produces: `buyBastionUnlock(state, id)` with atomic 1000/5000 coin purchases.
- Consumes: existing `level.specialist.level`.

- [ ] **Step 1: Write failing tests**

Assert the canonical charge values, disabled gadget cards at level 1, atomic
1000-coin gadget purchases at level 3, atomic 5000-coin Hypercharge purchase at
level 5, cloud/migration defaults, and rejected `F` activation below level 3
or without ownership.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test test/specialists.mjs
node test/fighter-progression-browser.mjs
node test/bastion-browser.mjs
node test/save-migration.mjs
node test/cloudsave.mjs
```

Expected: failures because Bastion still charges by 20% and gadgets have no
level gate.

- [ ] **Step 3: Implement the minimum gates**

Set Bastion's normal and Hypercharge increments to `10` and `2`. Add canonical
purchase costs and ownership sanitizers, defaults, migration, and cloud keys.
Disable gadget profile buttons when `level < 3`; buy/select them from level 3;
reject `useBastionGadget()` under level 3 or without ownership.

- [ ] **Step 4: Verify GREEN and commit**

Run the three commands from Step 2, then:

```bash
git add src/specialists.js src/main.js src/extras.js src/net/cloudsave.js test/specialists.mjs test/fighter-progression-browser.mjs test/bastion-browser.mjs test/save-migration.mjs test/cloudsave.mjs
git commit -m "feat: gate bastion gadgets and super charge"
```

### Task 2: Add Hypercharge combat runtime

**Files:**
- Modify: `src/main.js`
- Modify: `src/extras.js`
- Modify: `src/player.js`
- Modify: `test/bastion-browser.mjs`

**Interfaces:**
- Produces: runtime `specialist.hyperCharge` and `specialist.hyperActiveT`.
- Produces: `Gadgets.activateBastionHyper()`.
- Changes: `Player.bastionSuperPunch(hyper = false)`.

- [ ] **Step 1: Extend the failing browser test**

Assert level 4 does not charge Hypercharge, level 5 gains exactly 2% per
successful attack, 50 attacks reach 100%, `X` starts a five-second timer, expiry
loses the charge, and `C` during the timer performs the enhanced hit.

- [ ] **Step 2: Verify RED**

Run `node test/bastion-browser.mjs`.
Expected: failure because Hypercharge runtime fields and `X` activation do not
exist.

- [ ] **Step 3: Add runtime charge and timer**

Initialize:

```js
{ hyperCharge: 0, hyperActiveT: 0 }
```

For a successful level-5 Bastion hit with purchased Hypercharge, add `2` up to
`100`. On `X`, consume 100 charge and set `hyperActiveT = 5`. Decrement it in
`Gadgets.update()`.

- [ ] **Step 4: Enhance the existing Super handler**

Call `bastionSuperPunch(hyper)` with:

```js
const range = 7;
const width = hyper ? 4 : 2;
const damage = hyper ? 750 : 500;
```

For enhanced hits, set:

```js
z.slowT = Math.max(z.slowT || 0, 4);
z.slowMul = Math.min(z.slowMul || 1, 0.5);
```

- [ ] **Step 5: Verify GREEN and commit**

Run `node test/bastion-browser.mjs`, then:

```bash
git add src/main.js src/extras.js src/player.js test/bastion-browser.mjs
git commit -m "feat: add bastion hypercharge"
```

### Task 3: Add HUD, touch control, localization, and v610

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/hud.js`
- Modify: `src/touch.js`
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Modify: `src/main.js`
- Modify: `version.json`
- Modify: `sw.js`
- Modify: `CHANGELOG.md`
- Modify: `test/bastion-browser.mjs`

**Interfaces:**
- Produces: `#tb-bastion-hyper` bound to `KeyX`.

- [ ] **Step 1: Add failing HUD assertions**

Require the Hypercharge touch button to be hidden below level 5, visible at
level 5, and to show percent or remaining seconds.

- [ ] **Step 2: Verify RED**

Run `node test/bastion-browser.mjs`.
Expected: failure because `#tb-bastion-hyper` does not exist.

- [ ] **Step 3: Add the minimal DOM HUD**

Add one touch button, bind it to `KeyX`, update it from the existing HUD loop,
and add profile/HUD strings in English and Russian.

- [ ] **Step 4: Bump release identifiers**

Set `APP_VERSION`, `version.json`, and service-worker cache to `610`; add a
concise v610 changelog entry. Keep `PROTO_VERSION = 23`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
node test/bastion-browser.mjs
node test/fighter-progression-browser.mjs
node test/i18n-parity.mjs
node test/version-sync.mjs
npm test
npm run test:quick-release
```

Expected: every command exits `0`.

Commit:

```bash
git add index.html styles.css src/hud.js src/touch.js src/i18n/en.js src/i18n/ru.js src/main.js version.json sw.js CHANGELOG.md test/bastion-browser.mjs
git commit -m "release: prepare bastion hypercharge v610"
```
