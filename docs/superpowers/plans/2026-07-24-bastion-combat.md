# Bastion Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bastion fully playable in solo Expedition with exact level stats, fists, a 500-damage Super Punch, and two selectable gadgets.

**Architecture:** Extend the existing specialist, melee, Super, gadget, HUD, touch, and save paths. Keep Bastion solo-only and reuse `FIGHTER_UPGRADE_COSTS`, the current melee resolver, `Gadgets`, and the fighter profile instead of adding a second combat framework.

**Tech Stack:** JavaScript ES modules, Three.js, DOM/CSS overlays, Node test runner, Playwright.

## Global Constraints

- Bastion remains unavailable in co-op; `PROTO_VERSION` stays `23`.
- Base HP by level is `50 / 65 / 100 / 175 / 215`.
- Base fist damage by level is `50 / 75 / 95 / 110 / 125`.
- Fists hit a `3×1 m` forward rectangle, hold 10 attacks, attack once per second, and reload in 1.5 seconds from infinite reserve.
- Super Punch uses `C`, hits a `7×2 m` forward rectangle, and deals exactly `500` damage without level or run multipliers.
- Five successful basic attacks charge Super; multi-hit attacks count once.
- Healing Punches heal 30 HP on each of the next two successful basic attacks and have a 30-second cooldown.
- Provoke lasts 5 seconds, aggros zombies within 12 m, reduces incoming damage by 40%, and has a 30-second cooldown.
- The selected gadget persists as `bastionGadget`, defaulting to `healing-punch`.

---

### Task 1: Bastion data and save contract

**Files:**
- Modify: `src/specialists.js`
- Modify: `src/main.js`
- Modify: `src/net/cloudsave.js`
- Modify: `test/specialists.mjs`
- Modify: `test/save-migration.mjs`
- Modify: `test/cloudsave.mjs`

**Interfaces:**
- Produces: `BASTION_LEVEL_STATS`, `bastionLevelStats(level)`, and `sanitizeBastionGadget(value)`.
- Produces: playable `SPECIALISTS.bastion` with `kit: ['fists']`, `signature: 'fists'`, and `chargePerHit: 20`.

- [ ] **Step 1: Write failing data and migration tests**

Assert:

```js
assert.deepEqual([1, 2, 3, 4, 5].map(bastionLevelStats), [
  { maxHealth: 50, damage: 50 },
  { maxHealth: 65, damage: 75 },
  { maxHealth: 100, damage: 95 },
  { maxHealth: 175, damage: 110 },
  { maxHealth: 215, damage: 125 },
]);
assert.equal(sanitizeBastionGadget('provoke'), 'provoke');
assert.equal(sanitizeBastionGadget('bad'), 'healing-punch');
assert.equal(SPECIALISTS.bastion.playable, true);
```

Extend save tests so `{}` yields `bastionGadget === 'healing-punch'`, an invalid
value migrates to that default, and `bastionGadget` is covered by the cloud-save
manifest.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test test/specialists.mjs
node test/save-migration.mjs
node test/cloudsave.mjs
```

Expected: failures for missing Bastion exports, missing save default, and the
cloud manifest drift guard.

- [ ] **Step 3: Add the minimal canonical data**

Add:

```js
export const BASTION_LEVEL_STATS = Object.freeze([
  null,
  Object.freeze({ maxHealth: 50, damage: 50 }),
  Object.freeze({ maxHealth: 65, damage: 75 }),
  Object.freeze({ maxHealth: 100, damage: 95 }),
  Object.freeze({ maxHealth: 175, damage: 110 }),
  Object.freeze({ maxHealth: 215, damage: 125 }),
]);

export function bastionLevelStats(level) {
  return BASTION_LEVEL_STATS[clampInt(level, 1, 5)];
}

export function sanitizeBastionGadget(value) {
  return value === 'provoke' ? 'provoke' : 'healing-punch';
}
```

Set Bastion's profile to `playable: true`, its names to `Кулаки`,
`Суперкулак`, `Лікувальні кулаки`, and `Провокація`, and add the save default,
migration call, and cloud manifest key.

- [ ] **Step 4: Run tests and verify GREEN**

Run the three commands from Step 2. Expected: exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/specialists.js src/main.js src/net/cloudsave.js test/specialists.mjs test/save-migration.mjs test/cloudsave.mjs
git commit -m "feat: define bastion combat data"
```

### Task 2: Fighter profile and gadget selection

**Files:**
- Modify: `src/main.js`
- Modify: `styles.css`
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Modify: `test/fighter-progression-browser.mjs`

**Interfaces:**
- Consumes: `bastionLevelStats(level)` and `sanitizeBastionGadget(value)`.
- Produces: two `button[data-bastion-gadget]` cards with `aria-pressed`.

- [ ] **Step 1: Write the failing browser assertions**

Require Bastion's profile to be selectable and upgradeable, show exact level-1
`50 HP` and `50` damage, show attack/Super names, and persist a click on
`[data-bastion-gadget="provoke"]`.

- [ ] **Step 2: Run and verify RED**

Run `node test/fighter-progression-browser.mjs`.
Expected: Bastion is still pending and has no gadget buttons.

- [ ] **Step 3: Render the existing profile with selectable gadget cards**

For Bastion only, render gadget rows as native buttons:

```js
`<button type="button" class="fighter-ability fighter-gadget"
 data-bastion-gadget="${gadgetId}" aria-pressed="${selected}">
 <strong>${t(label)}</strong><span>${t(value)}</span></button>`
```

On click, set `save.bastionGadget`, call `saveGame()`, and re-render. Keep the
buttons disabled once the Expedition fighter is locked.

- [ ] **Step 4: Add translations and styles**

Add English/Russian strings for the four Bastion ability names and profile
descriptions. Style `.fighter-gadget[aria-pressed="true"]` with the existing
purple selected border and retain a 44-pixel minimum hit area.

- [ ] **Step 5: Run and verify GREEN**

Run:

```bash
node test/fighter-progression-browser.mjs
node test/i18n-parity.mjs
```

Expected: exit `0`.

- [ ] **Step 6: Commit**

```bash
git add src/main.js styles.css src/i18n/en.js src/i18n/ru.js test/fighter-progression-browser.mjs
git commit -m "feat: add bastion gadget selection"
```

### Task 3: Fists and 500-damage Super Punch

**Files:**
- Modify: `src/player.js`
- Modify: `src/characters.js`
- Modify: `src/main.js`
- Modify: `src/extras.js`
- Create: `test/bastion-browser.mjs`

**Interfaces:**
- Produces: internal `WEAPONS.fists` and `Player.bastionSuperPunch()`.
- Consumes: `level.player.bastionDamage` initialized from `bastionLevelStats`.

- [ ] **Step 1: Write the failing combat browser test**

Start a level-5 Bastion Expedition and assert:

```js
{
  maxHealth: 215,
  weapon: 'fists',
  magazine: 10,
  reload: 1.5,
  damage: 125,
  chargePerHit: 20,
  superDamage: 500,
}
```

Place targets inside and outside the 3×1 and 7×2 rectangles. Verify all inside
targets are hit, outside targets are unchanged, five successful fist attacks
charge Super, `C` resets charge, and the Super target loses exactly 500 HP.

- [ ] **Step 2: Run and verify RED**

Run `node test/bastion-browser.mjs`.
Expected: failure because Bastion cannot start and `fists` does not exist.

- [ ] **Step 3: Add fists to the existing melee engine**

Add:

```js
fists: {
  name: 'Кулаки', icon: '👊', dmg: 50, rpm: 60, mag: 10, spread: 0,
  auto: false, reloadT: 1.5, recoil: 0.04, kick: 1, recover: 6,
  impact: 5, stagger: 0.3, infinite: true, melee: true,
  range: 3, rectWidth: 1, cleave: Infinity,
},
```

In the melee resolver, use forward/side projections for weapons with
`rectWidth`, skip cone/falloff/cleave limits for fists, and use
`player.bastionDamage`. Add a small shared rectangle-target helper so
`bastionSuperPunch()` uses `7`, `2`, and fixed `500`.

- [ ] **Step 4: Apply exact level stats and activate Super**

In solo Expedition, when `id === 'bastion'`, set exact base HP, set
`bastionDamage`, and force `weapons/cur` to `['fists']`. In
`useSpecialistSuper()`, call `bastionSuperPunch()` for Bastion and reset charge
only after activation.

- [ ] **Step 5: Hide the internal weapon model**

Make `makeGunMesh('fists')` return only its muzzle anchor so first- and
third-person views show hands without a gun.

- [ ] **Step 6: Run and verify GREEN**

Run:

```bash
node test/bastion-browser.mjs
node test/expedition-browser.mjs
node --test test/specialists.mjs
```

Expected: exit `0`.

- [ ] **Step 7: Commit**

```bash
git add src/player.js src/characters.js src/main.js src/extras.js test/bastion-browser.mjs
git commit -m "feat: add bastion fists and super punch"
```

### Task 4: Healing Punches, Provoke, and touch HUD

**Files:**
- Modify: `src/extras.js`
- Modify: `src/player.js`
- Modify: `src/hud.js`
- Modify: `src/touch.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `test/bastion-browser.mjs`

**Interfaces:**
- Produces: `Gadgets.useBastionGadget()` and `Gadgets.onBastionHit()`.
- Produces: runtime fields `bastionHealHits` and `bastionProvokeT`.

- [ ] **Step 1: Extend the browser test and verify RED**

Verify Healing Punches heal exactly 30 twice, a miss consumes no charge,
multi-hit heals once, and cooldown starts at 30. Verify Provoke aggros only
zombies within 12 m, lasts 5 seconds, changes 100 incoming damage to 60, and
cannot stack.

- [ ] **Step 2: Implement gadget runtime**

On `F`, for selected `healing-punch`, set `bastionHealHits = 2`; for `provoke`,
set `bastionProvokeT = 5` and mark living zombies within 12 m as aggroed/chasing.
Set `cd = 30` only on successful activation. `onBastionHit()` heals once and
decrements one healing hit. In `Player.takeDamage()`, multiply damage by `0.6`
while `bastionProvokeT > 0`.

- [ ] **Step 3: Add the separate touch gadget button**

Add:

```html
<button id="tb-bastion-gadget" class="tb" aria-label="Гаджет Бастіона">
  🩹<span id="tb-bastion-gadget-n" class="tb-badge">✓</span>
</button>
```

Bind it to `KeyF`. Show it only for active Bastion, while the existing
`tb-gadget` remains the Super button. Display selected icon and cooldown/charges
through the current HUD update.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node test/bastion-browser.mjs
node test/fighter-progression-browser.mjs
node test/expedition-browser.mjs
node test/save-migration.mjs
node test/cloudsave.mjs
node test/i18n-parity.mjs
npm test
```

Expected: every command exits `0` with no browser page errors.

- [ ] **Step 5: Commit**

```bash
git add src/extras.js src/player.js src/hud.js src/touch.js index.html styles.css test/bastion-browser.mjs
git commit -m "feat: add bastion gadgets"
```
