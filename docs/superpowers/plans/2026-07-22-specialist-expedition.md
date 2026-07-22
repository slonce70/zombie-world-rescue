# Specialist Expedition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v607 as a focused upgrade to the existing Expedition: three specialists with distinct kits, passives, charge-based Supers, biased solo card drafts, and persistent mastery ranks.

**Architecture:** Keep Expedition as the only multi-stage container and reuse the existing co-op role ids, weapons, gadget effects, RunBuild cards, HUD control, save system, and host-authoritative route. Put specialist data, mastery, validation, and passive math in one pure module; keep runtime input/effects in the existing game systems. Migrate old Expedition saves from v1 to v2 without losing route progress or rewards.

**Tech Stack:** Plain JavaScript modules, Three.js, existing DOM/CSS overlays, Node `node:test`, existing Playwright browser tests, current WebSocket relay, cloud-save drift guard, and PWA service worker.

**Design spec:** `docs/superpowers/specs/2026-07-22-specialist-expedition-design.md`

## Global Constraints

- Target one release only: `APP_VERSION = 607`, `version.json.v = 607`, service-worker cache `zr-cache-v607`.
- Bump `PROTO_VERSION` once, from `22` to `23`, because serialized `ex` changes to Expedition v2 and roster adds validated specialist rank.
- Do not add a top-level mode, new game, dependency, backend, currency, matchmaking system, named hero collection, model, animation, or 3D asset.
- Keep skins, dances, pets, tracers, titles, and the custom hero cosmetic; a skin never changes stats or specialist identity.
- Reuse ids `guard`, `medic`, and `scout`. Do not create a parallel set of role ids or a second co-op selector.
- In an Expedition lobby/runtime, a missing co-op role resolves to guard; outside Expedition, the role remains optional as in v606.
- Specialist rank bonuses apply only while `level.expedition` is active. Existing co-op role balance outside Expedition remains v606 behavior.
- Reuse the existing `F` / `#tb-gadget` control. Inside Expedition it activates Super; outside Expedition it activates the player's selected gadget exactly as before.
- Do not spawn the existing random Shkval/Magnet Super pickup inside Expedition. Preserve it in every other supported mode.
- Keep co-op route choices and `run.build` shared and host-authoritative. Card weighting is solo-only.
- Treat `radiation` as a hard contract: 50 HP and no specialist kit, passive, Super, or charge for that stage.
- Treat `turretwar` as hammer-only while allowing the specialist passive and Super.
- Preserve deterministic route generation for a given seed, specialist, current build, and co-op flag.
- Ukrainian source strings require English and Russian translations with exact placeholder parity.
- Use existing test helpers and frameworks; add no new test runner or generalized abstraction.
- Do not bump version or protocol metadata before Task 8.

## Canonical Rules

```js
export const SPECIALIST_IDS = Object.freeze(['guard', 'medic', 'scout']);

export const SPECIALISTS = Object.freeze({
  guard: {
    kit: ['pistol', 'shotgun'],
    chargePerHit: 18,
    bias: { tags: ['tank'], ids: [] },
  },
  medic: {
    kit: ['pistol', 'rifle'],
    chargePerHit: 8,
    bias: { tags: [], ids: ['spdheal', 'spdfull', 'dmgvamp', 'spdvamp', 'vamp', 'vamp2'] },
  },
  scout: {
    kit: ['pistol', 'smg'],
    chargePerHit: 5,
    bias: { tags: ['speed'], ids: [] },
  },
});
```

- Mastery thresholds: rank 1 at 0 XP, rank 2 at 100 XP, rank 3 at 300 XP.
- Full win: 100 XP. Terminal failure: `15 * run.wins` XP. Abandoning an active run: 0 XP.
- Claim id: `expedition:<seed>:<solo|coop>`; save the last 50 unique, sanitized ids.
- Runtime state: `{ id, rank, charge: 0, maxCharge: 100, active }`.
- Guard: +25 max HP at rank 1, +35 at rank 2+, shield 50 at ranks 1–2, shield 100 at rank 3.
- Medic: healing ×1.25 and revive 1.8 s at rank 1, healing ×1.40 and revive 1.5 s at rank 2+, heal Super 50 at ranks 1–2 and 100 at rank 3 before the multiplier.
- Scout: speed ×1.08 and pickup ×1.25 at rank 1, speed ×1.12 and pickup ×1.35 at rank 2+, 1 s dash/invulnerability at ranks 1–2 and 3 s at rank 3.
- A failed Super activation does not spend charge; a successful one resets charge to 0.

## File Map

- Create `src/specialists.js`: canonical specialist definitions, sanitizers, mastery calculations, claim ledger, and passive math.
- Modify `src/expedition.js`: v1→v2 migration, solo specialist ownership, deterministic weighted route cards.
- Modify `src/runbuild.js`: optional weighted offers without changing default callers.
- Modify `src/draft.js`: pass the active solo Expedition specialist bias to RunBuild.
- Modify `src/main.js`: save defaults/sanitization, Expedition selection/result flow, runtime setup, kits, hit charge, random pickup suppression, and mastery claim.
- Modify `src/player.js`: apply the Medic healing multiplier in the existing `Player.heal()` boundary.
- Modify `src/extras.js`: route `F` to a charge-based Expedition Super while preserving ordinary gadgets elsewhere.
- Modify `src/hud.js`: render specialist name/rank/Super charge through the existing gadget HUD.
- Modify `src/net/coop.js`: consume the shared specialist definitions and preserve per-player roles with a shared unbiased route/build.
- Modify `src/net/cloudsave.js`: protect `specialistXp` and `specialistClaims` as progress.
- Modify `src/net/protocol.js`: protocol bump in Task 8 only.
- Modify `index.html`, `styles.css`: specialist cards, terminal mastery result, responsive and accessible states.
- Modify `src/i18n/en.js`, `src/i18n/ru.js`: translations for all new source strings.
- Modify `sw.js`: cache the new module and bump cache in Task 8 only.
- Modify `README.md`, `CHANGELOG.md`, `version.json`: release metadata in Task 8 only.
- Add `test/specialists.mjs` and extend existing Expedition, RunBuild, save, co-op, Super, accessibility, i18n, version, and release checks.

---

### Task 1: Add the pure specialist domain and migrate Expedition v1 to v2

**Files:**
- Create: `src/specialists.js`
- Create: `test/specialists.mjs`
- Modify: `src/expedition.js`
- Modify: `test/expedition-unit.mjs`

**Interfaces:**
- Produces: `SPECIALIST_IDS`, `SPECIALISTS`, `sanitizeSpecialistId`, `sanitizeSpecialistXp`, `sanitizeSpecialistClaims`, `specialistRank`, `specialistBias`, `specialistModifiers`, `specialistMasteryAward`, `specialistClaimId`, `claimSpecialistMastery`.
- Changes: `EXPEDITION_VERSION` from `1` to `2`.
- Changes: `createExpedition({ seed, countries, coop, specialist })` stores `specialist` for solo and `null` for co-op.
- Changes: `sanitizeExpedition(value)` accepts both v1 and v2, always returns canonical v2, and still rejects unknown future versions.
- Preserves: step, wins, current branch, choices, build, status, reward, and claimed reward across v1→v2 migration.

- [ ] **Step 1: Write failing pure-domain tests**

Create `test/specialists.mjs` with `node:test` assertions for exact ids, clamping, ranks, awards, claims, and passives. The core cases are:

```js
test('specialist mastery has three fixed ranks', () => {
  assert.equal(specialistRank(0), 1);
  assert.equal(specialistRank(99), 1);
  assert.equal(specialistRank(100), 2);
  assert.equal(specialistRank(299), 2);
  assert.equal(specialistRank(300), 3);
});

test('terminal mastery is deterministic and claimed once', () => {
  const save = { specialistXp: { guard: 0, medic: 0, scout: 0 }, specialistClaims: [] };
  const run = { seed: 607, coop: false, status: 'won', wins: 5 };
  const first = claimSpecialistMastery(save, run, 'guard');
  assert.deepEqual(first.result, { awarded: 100, rankBefore: 1, rankAfter: 2 });
  assert.equal(first.specialistXp.guard, 100);
  assert.equal(save.specialistXp.guard, 0);
  assert.equal(claimSpecialistMastery(first, run, 'guard').result.awarded, 0);
});

test('active and abandoned runs never grant mastery', () => {
  assert.equal(specialistMasteryAward({ status: 'active', wins: 4 }), 0);
  assert.equal(specialistMasteryAward({ status: 'failed', wins: 2 }), 30);
});
```

Add mutation-style player fixtures proving that Expedition guard, medic, and scout passives use the canonical rank values and that `{ expedition: false }` changes nothing.

- [ ] **Step 2: Add failing migration coverage**

In `test/expedition-unit.mjs`, preserve the current test loader but replace all imported dependencies (`countries.js`, `runbuild.js`, and `specialists.js`) before loading the data URL. Add:

```js
test('v1 solo run migrates to v2 guard without losing progress', () => {
  const old = {
    v: 1, seed: 405, coop: false, countries: ['UKR'], step: 2, wins: 2,
    status: 'active', current: { id: '2-1-rescue-UKR' }, choices: [],
    build: ['dmg25'], reward: { coins: 0, crystals: 0, claimed: false },
  };
  const run = sanitizeExpedition(old);
  assert.equal(run.v, 2);
  assert.equal(run.specialist, 'guard');
  assert.equal(run.step, 2);
  assert.deepEqual(run.build, ['dmg25']);
});

test('co-op migration never stores the host specialist in shared ex state', () => {
  const run = sanitizeExpedition({ ...createExpedition({ seed: 406, coop: true }), v: 1 });
  assert.equal(run.specialist, null);
});
```

Retain the forged future-version assertion: `{ v: 999 }` must still sanitize to `null`.

- [ ] **Step 3: Run the focused tests and confirm the missing-module failures**

Run: `node --test test/specialists.mjs test/expedition-unit.mjs`

Expected: FAIL because `src/specialists.js` does not exist and Expedition v1 is not migrated.

- [ ] **Step 4: Implement the smallest pure domain module**

Keep `src/specialists.js` free of DOM, Three.js, `Game`, network, and storage imports. Use these stable signatures:

```js
export function sanitizeSpecialistId(value, fallback = null) {}
export function sanitizeSpecialistXp(value) {}
export function sanitizeSpecialistClaims(value) {}
export function specialistRank(xp) {}
export function specialistBias(id) {}
export function specialistModifiers(id, rank) {}
export function specialistMasteryAward(run) {}
export function specialistClaimId(run) {}
export function claimSpecialistMastery(save, run, id) {}
```

`claimSpecialistMastery` does not mutate its input. It returns `{ specialistXp, specialistClaims, result: { awarded, rankBefore, rankAfter } }`, appending a claim only when award > 0. `specialistModifiers` returns numbers only and does not mutate a Player. `sanitizeSpecialistClaims` accepts strings no longer than 80 characters, removes duplicates while preserving most-recent order, and keeps the last 50.

- [ ] **Step 5: Implement explicit Expedition migration**

Set `EXPEDITION_VERSION = 2`. Before canonical reconstruction, accept only `v === 1 || v === 2`. Rebuild through `createExpedition`, then restore the canonical fields already restored by v606. The specialist rule must be exactly:

```js
const specialist = coop
  ? null
  : sanitizeSpecialistId(value.v === 1 ? 'guard' : value.specialist, 'guard');
```

Do not trust saved `current`, `choices`, or reward amounts; continue regenerating them from seed/status as v606 does.

- [ ] **Step 6: Run the pure tests**

Run: `node --test test/specialists.mjs test/expedition-unit.mjs`

Expected: PASS with canonical v2 data, preserved v1 progress, one mastery claim, and no non-Expedition passive mutation.

- [ ] **Step 7: Commit the domain slice**

```bash
git add src/specialists.js src/expedition.js test/specialists.mjs test/expedition-unit.mjs
git commit -m "feat: add specialist expedition domain"
```

---

### Task 2: Bias solo route cards and in-level drafts without changing co-op

**Files:**
- Modify: `src/runbuild.js`
- Modify: `src/draft.js`
- Modify: `src/expedition.js`
- Modify: `test/runbuild.mjs`
- Modify: `test/expedition-unit.mjs`

**Interfaces:**
- Changes: `RunBuild.offer(rng, count = 3, bias = null)` accepts `{ tags, ids, multiplier }`.
- Changes: `cardFor(seed, step, branch, build, bias)` uses the same weight helper as RunBuild.
- Consumes: `specialistBias(id)` from Task 1.
- Preserves: default offer behavior, unique cards, rarity weights, deck reset, supplier count 4, and unbiased co-op.

- [ ] **Step 1: Add deterministic weighting tests**

In `test/runbuild.mjs`, use an RNG that records the requested range and returns a selected edge. Assert that a tank card contributes exactly twice its normal rarity weight when `{ tags: ['tank'], multiplier: 2 }` is passed, while default totals remain unchanged. Also assert three distinct results and no picked-card repeats.

In `test/expedition-unit.mjs`, add:

```js
test('solo specialist changes deterministic card weighting but co-op stays shared', () => {
  const guard = createExpedition({ seed: 470, specialist: 'guard' });
  const scout = createExpedition({ seed: 470, specialist: 'scout' });
  const coop = createExpedition({ seed: 470, coop: true, specialist: 'guard' });
  assert.equal(guard.specialist, 'guard');
  assert.equal(scout.specialist, 'scout');
  assert.equal(coop.specialist, null);
  assert.deepEqual(sanitizeExpedition(coop), coop);
});
```

Test a short fixed seed table and assert each result is stable on a second call; do not assert that every offer contains a preferred card.

- [ ] **Step 2: Run focused tests and confirm signature/weight failures**

Run: `node test/runbuild.mjs && node --test test/expedition-unit.mjs`

Expected: FAIL because `offer` and route generation ignore specialist bias.

- [ ] **Step 3: Add one shared card-weight helper**

In `src/runbuild.js`, export a small pure helper:

```js
export function cardWeight(card, bias = null) {
  const base = RARITY_WEIGHT[card.rarity] || RARITY_WEIGHT.common;
  if (!bias) return base;
  const preferred = bias.tags?.includes(card.tag) || bias.ids?.includes(card.id);
  return base * (preferred ? (bias.multiplier || 2) : 1);
}
```

Use it inside `RunBuild.offer`. Import and reuse it in `src/expedition.js`; do not duplicate the rules.

- [ ] **Step 4: Pass bias only for solo Expedition**

In `Draft.open()` compute:

```js
const bias = level.expedition && !level.expedition.coop
  ? specialistBias(level.expedition.specialist)
  : null;
this.offered = level.runBuild.offer(level.zombies.rng, count, bias);
```

Keep `Draft.openNet(ids)` unchanged. In route generation pass `null` whenever `run.coop` is true.

- [ ] **Step 5: Run the card and Expedition tests**

Run: `node test/runbuild.mjs && node --test test/expedition-unit.mjs`

Expected: PASS; old default offers remain stable, preferred cards have ×2 selection weight, and co-op stays unbiased.

- [ ] **Step 6: Commit the weighted-card slice**

```bash
git add src/runbuild.js src/draft.js src/expedition.js test/runbuild.mjs test/expedition-unit.mjs
git commit -m "feat: bias solo expedition upgrades"
```

---

### Task 3: Persist mastery and add solo specialist selection

**Files:**
- Modify: `src/main.js`
- Modify: `src/net/cloudsave.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `test/cloudsave.mjs`
- Modify: `test/save-migration.mjs`
- Modify: `test/expedition-browser.mjs`

**Interfaces:**
- Adds save defaults: `specialistXp: { guard: 0, medic: 0, scout: 0 }`, `specialistClaims: []`.
- Reuses: `save.coopRole` as the last chosen specialist id.
- Adds: `Game._selectExpeditionSpecialist(id)`; selection is allowed only for solo runs with `status === 'active'`, `step === 0`, and `wins === 0`.
- Adds protected progress keys: `specialistXp`, `specialistClaims`.
- Preserves: opening an existing Expedition, reward claim, abandon flow, and all non-Expedition save fields.

- [ ] **Step 1: Add save drift and migration tests**

Extend the expected progress-key lists in `test/cloudsave.mjs` with both new keys. In `test/save-migration.mjs`, inject malformed values and assert canonical output:

```js
check(JSON.stringify(clean.specialistXp) === JSON.stringify({ guard: 0, medic: 999999, scout: 0 }),
  'specialist XP is integer-clamped without resetting the profile');
check(clean.specialistClaims.length === 50 && new Set(clean.specialistClaims).size === 50,
  'claim ledger is deduplicated and capped at 50');
```

Include negative, fractional, oversized, non-string, duplicate, and >80-character fixtures.

- [ ] **Step 2: Add browser selection expectations**

Before starting the first level in `test/expedition-browser.mjs`, assert three `button[data-specialist]` elements, `aria-pressed="true"` on the saved selection, then select scout and verify:

```js
const selected = await page.evaluate(() => ({
  run: window.__game.save.expedition.specialist,
  last: window.__game.save.coopRole,
}));
check(selected.run === 'scout' && selected.last === 'scout', 'solo specialist selection persists');
```

After one successful node, reopen the overlay and assert the three controls are disabled and the lock copy is visible.

- [ ] **Step 3: Run the focused checks and confirm failures**

Run: `node test/cloudsave.mjs && node test/save-migration.mjs && node test/expedition-browser.mjs`

Expected: FAIL because the save fields, selection section, and lock behavior do not exist.

- [ ] **Step 4: Add and sanitize permanent save fields**

Import the Task 1 sanitizers in `src/main.js`. Add exact defaults in `_newSave()`, sanitize independently during save migration, and never replace the rest of a profile because one new field is malformed. Add both keys to `SAVE_PROGRESS_KEYS`.

When a new solo run is created, choose:

```js
const specialist = sanitizeSpecialistId(this.save.coopRole, 'guard');
run = createExpedition({ countries: this._expeditionCountries(), coop: false, specialist });
```

- [ ] **Step 5: Add the Expedition selection section**

Add `#expedition-specialists` above `#expedition-route`. Render three real buttons with icon, translated name, current rank, short passive, and Super. Set `aria-pressed`, `disabled`, and a rank-3 CSS class from state rather than only visual color.

Implement `_selectExpeditionSpecialist(id)` to sanitize, enforce the lock rule, update `save.expedition.specialist` and `save.coopRole`, call `saveGame()`, and rerender. Do not modify a co-op run's shared `specialist: null`.

- [ ] **Step 6: Add minimal responsive styles**

Use the existing panel/card tokens. Desktop uses three equal columns; the current mobile breakpoint uses one column. Preserve minimum 44×44 px button targets, visible keyboard focus, readable wrapping, selected state, disabled state, and a gold rank-3 border. Add no new font, image, or animation asset.

- [ ] **Step 7: Run save and selection checks**

Run: `node test/cloudsave.mjs && node test/save-migration.mjs && node test/expedition-browser.mjs`

Expected: PASS; corrupted specialist data is isolated, selection persists, and it locks after the first won stage.

- [ ] **Step 8: Commit the persistence/UI slice**

```bash
git add src/main.js src/net/cloudsave.js index.html styles.css test/cloudsave.mjs test/save-migration.mjs test/expedition-browser.mjs
git commit -m "feat: add expedition specialist selection"
```

---

### Task 4: Apply specialist kits, passives, charge, Super, HUD, and touch behavior

**Files:**
- Modify: `src/main.js`
- Modify: `src/player.js`
- Modify: `src/extras.js`
- Modify: `src/hud.js`
- Modify: `styles.css`
- Modify: `test/expedition-browser.mjs`
- Modify: `test/super-pickup.mjs`
- Modify: `test/mobile-a11y.mjs`

**Interfaces:**
- Adds runtime: `level.specialist = { id, rank, charge, maxCharge: 100, active }`.
- Adds: `Game._configureExpeditionSpecialist(level)` and `Game._chargeSpecialistSuper(level)`.
- Adds: `Gadgets.useSpecialistSuper()` returning `true` only when an effect successfully activates.
- Changes: `Player.heal(amt)` applies `player.healMult || 1`; every ordinary player starts with `healMult = 1`.
- Changes: `Gadgets.active` returns the specialist Super effect id in active Expedition stages and preserves existing behavior elsewhere.
- Consumes: local `hitmarker` only; no charge network message.
- Preserves: `KeyF`, `#tb-gadget`, ordinary gadget cooldowns, gadget playground, mode shield, and non-Expedition Super pickup.

- [ ] **Step 1: Add runtime browser assertions**

Extend `test/expedition-browser.mjs` to start scout, then assert:

```js
const runtime = await page.evaluate(() => ({
  specialist: window.__game.level.specialist,
  weapons: window.__game.level.player.weapons,
}));
check(runtime.specialist.id === 'scout' && runtime.specialist.charge === 0, 'scout runtime starts empty');
check(runtime.weapons.includes('pistol') && runtime.weapons.includes('smg'), 'scout kit is applied');
```

Emit 20 local `hitmarker` events and assert charge caps at 100. Trigger `KeyF`, assert charge resets to 0, and verify the rank-appropriate invulnerability duration. Emit hitmarkers from the same local bus on a guest in the co-op test later; each client's charge must remain independent.

- [ ] **Step 2: Add contract and regression assertions**

Add browser fixtures for stage configuration:

- rescue/elite/boss: specialist kit only;
- defense/zone/portal: required tool weapons plus signature weapon;
- turretwar: hammer only, passive and Super active;
- radiation: maxHealth 50, `level.specialist.active === false`, no charge, no Super use.

In `test/super-pickup.mjs`, retain the existing non-Expedition pickup assertion and add an Expedition start where no Shkval/Magnet pickup is spawned. In `test/mobile-a11y.mjs`, assert the existing touch button remains present and its accessible name contains `Super` plus the exact percentage during Expedition.

Add a Medic fixture at 40/100 HP: rank 1 `player.heal(20)` restores 25 HP, rank 2 restores 28 HP, and a non-Expedition player restores 20 HP. Confirm max-health grants themselves are not multiplied.

- [ ] **Step 3: Run the focused checks and confirm missing runtime failures**

Run: `node test/expedition-browser.mjs && node test/super-pickup.mjs && node test/mobile-a11y.mjs`

Expected: FAIL because the specialist runtime, charge display, contracts, and Expedition pickup exclusion are absent.

- [ ] **Step 4: Configure one runtime after player creation**

In the existing level setup path, after the Player and mode constraints exist but before restored RunBuild cards apply, derive the id from `run.specialist` in solo or the existing roster role in co-op. Derive rank from local save XP. Apply the passive once and mark `active: false` for radiation.

Do not apply both the old co-op role block and the new Expedition passive. Refactor the condition so non-Expedition co-op retains the old v606 values, while Expedition reads `specialistModifiers(id, rank)` and applies each modifier exactly once.

Initialize `Player.healMult = 1` in `src/player.js` and multiply inside `Player.heal()`. Route existing direct regenerative healing that is meant to count as healing (life steal and invisibility regeneration) through `Player.heal()`. Keep max-health grants and resurrection health assignment direct because they are stat/respawn rules, not healing events.

- [ ] **Step 5: Apply deterministic weapon contracts**

Add one local mapping from specialist id to signature weapon and compose it with existing mode weapon setup. Avoid a second weapon inventory system. Deduplicate weapon ids and keep the current weapon valid after composition.

- [ ] **Step 6: Charge only from confirmed local hits**

In the existing `level.bus.on('hitmarker', ...)` setup, add a separate compact listener that calls `_chargeSpecialistSuper(level)`. Guard on active runtime, living player, and active level. Add the canonical per-hit amount and clamp to `maxCharge`. Ignore `crit`, weapon, and zone arguments so a critical hit does not double-charge.

- [ ] **Step 7: Route `F` through existing Gadgets**

Extract the existing shield, heal, and dash bodies into private helpers accepting explicit strength/duration so both ordinary gadgets and Specialist Super reuse the same effect code. At the start of `Gadgets.use()`, detect active `level.specialist`. If charge < 100, emit a translated `Super: {n}%` toast, deny audio, and return `false`. At full charge:

- guard calls the existing shield effect with 50/100 durability;
- medic heals 50/100 before `player.healMult`, returns `false` at full health, and never spends charge on that failure;
- scout calls the existing dash/hyper-dash path with 1/3 seconds of invulnerability.

Only after the selected effect succeeds, set charge to 0, play the existing power-up feedback, and return `true`. Do not use or mutate ordinary gadget cooldown for Specialist Super.

- [ ] **Step 8: Reuse the gadget HUD and touch button**

In `src/hud.js`, branch before ordinary gadget rendering. Show specialist icon/name, rank, and `Super {charge}%`; set the badge to the integer percentage; update `aria-label`; add a ready class only at 100; render the radiation contract when inactive. Outside Expedition, execute the existing gadget HUD code unchanged.

Use a restrained ready pulse that respects the existing reduced-motion rule. Do not add another HUD panel or touch control.

- [ ] **Step 9: Suppress only the conflicting random pickup**

At the existing random Super pickup spawn condition in `src/main.js`, add `!level.expedition`. Do not change pickup data, chance, missions, or behavior in other modes.

- [ ] **Step 10: Run runtime, contract, pickup, and accessibility checks**

Run: `node test/expedition-browser.mjs && node test/super-pickup.mjs && node test/mobile-a11y.mjs`

Expected: PASS for kit composition, exact charge, successful/failed spend, radiation/turretwar contracts, non-Expedition regression, touch label, and ready state.

- [ ] **Step 11: Commit the combat slice**

```bash
git add src/main.js src/player.js src/extras.js src/hud.js styles.css test/expedition-browser.mjs test/super-pickup.mjs test/mobile-a11y.mjs
git commit -m "feat: add charge based specialist supers"
```

---

### Task 5: Claim mastery exactly once at terminal Expedition results

**Files:**
- Modify: `src/main.js`
- Modify: `src/net/coop.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `test/expedition-browser.mjs`
- Modify: `test/cloudsave.mjs`

**Interfaces:**
- Adds: `Game._claimExpeditionMastery(run)` wrapping the pure domain claim and `saveGame()`.
- Changes: terminal Expedition result shows XP gained, total XP, current rank, next threshold, and rank-up feedback.
- Preserves: existing coins/crystals reward claim and `reward.claimed` behavior as a separate ledger.

- [ ] **Step 1: Add terminal result browser coverage**

Use a test-only terminal run injected through the public sanitized save path. Open the overlay twice and assert:

```js
const first = await page.evaluate(() => ({
  xp: window.__game.save.specialistXp.guard,
  claims: window.__game.save.specialistClaims.slice(),
  text: document.getElementById('expedition-mastery').textContent,
}));
await page.evaluate(() => window.__game.renderExpedition());
const second = await page.evaluate(() => ({
  xp: window.__game.save.specialistXp.guard,
  claims: window.__game.save.specialistClaims.slice(),
}));
check(first.xp === second.xp && first.claims.length === second.claims.length,
  'terminal mastery is rendered without duplicate claim');
```

Cover a 5-win success (100 XP), a 2-win failure (30 XP), and abandoning an active run (0 XP and no claim id).

- [ ] **Step 2: Run the terminal checks and confirm missing mastery UI**

Run: `node test/expedition-browser.mjs && node test/cloudsave.mjs`

Expected: FAIL because terminal mastery is not claimed or rendered.

- [ ] **Step 3: Claim whenever a terminal run is accepted**

Call `_claimExpeditionMastery` whenever a canonical terminal run is accepted: local `completeExpeditionNode`, guest `xprun`, terminal `welcome/start` resume, or opening a terminal save migrated from v606. The method calls pure `claimSpecialistMastery`, assigns its returned `specialistXp` and `specialistClaims`, stores `result` transiently for display, and persists once. Rendering may safely invoke this acceptance guard again because the ledger makes later calls award 0.

For co-op, use `save.coopRole`; for solo, use `run.specialist`. If no valid local co-op role exists, sanitize to guard for the personal claim without mutating shared `run.specialist`. Route the existing co-op assignments of `save.expedition` through this acceptance path so guests do not depend on being the host or manually reopening the overlay.

- [ ] **Step 4: Render compact mastery progress in the existing overlay**

Add `#expedition-mastery` below the terminal route result. Show `+{n} XP`, total XP, rank, and either progress to 100/300 or `МАКС. РАНГ`. Add rank-up feedback only when `rankAfter > rankBefore`. Do not introduce a new currency bar or modal.

- [ ] **Step 5: Run terminal and cloud-save checks**

Run: `node test/expedition-browser.mjs && node test/cloudsave.mjs`

Expected: PASS; each terminal seed/mode grants once, active abandonment grants nothing, and coins/crystals remain independent.

- [ ] **Step 6: Commit the mastery result slice**

```bash
git add src/main.js src/net/coop.js index.html styles.css test/expedition-browser.mjs test/cloudsave.mjs
git commit -m "feat: award specialist mastery"
```

---

### Task 6: Unify specialists with the existing co-op roles

**Files:**
- Modify: `src/net/coop.js`
- Modify: `src/main.js`
- Modify: `src/ui/coopui.js`
- Modify: `test/coop-nick.mjs`
- Modify: `test/coop-roles.mjs`
- Modify: `test/coop-expedition.mjs`

**Interfaces:**
- Reuses: roster `role` and `save.coopRole`; no new wire event or parallel specialist-id field.
- Adds: roster `rank`, clamped to integer `1..3`; private XP and claim ids never leave the client.
- Changes: co-op lobby role copy/cards display specialist name, icon, local mastery rank, passive, and Super.
- Preserves: duplicate roles, four-player ceiling, role persistence, host-authoritative route/votes/build, reconnection, and existing non-Expedition role balance.
- Guarantees: shared `ex.specialist === null`; each client derives runtime id/rank from its own roster role/local save.

- [ ] **Step 1: Extend co-op role and Expedition scenarios**

In `test/coop-nick.mjs`, extend the existing malicious roster fixture so missing, fractional, negative, oversized, and inherited `rank` values sanitize to an own integer `1..3`. In `test/coop-roles.mjs`, retain all v606 non-Expedition assertions (+25 guard HP, medic revive, scout speed, radiation role disabled). Add lobby assertions for specialist labels/ranks without changing the sent role ids.

In `test/coop-expedition.mjs`, set host guard and guest scout before starting. Assert:

```js
const roles = await Promise.all([A, B].map((p) => p.evaluate(() => ({
  sharedSpecialist: window.__game.level.expedition.specialist,
  localSpecialist: window.__game.level.specialist.id,
  charge: window.__game.level.specialist.charge,
}))));
check(roles[0].sharedSpecialist == null && roles[1].sharedSpecialist == null, 'shared run has no specialist');
check(roles[0].localSpecialist === 'guard' && roles[1].localSpecialist === 'scout', 'each client owns its role');
```

Emit six local hitmarkers on host and twenty on guest; assert host/guest charges follow 18/5 independently and both cap at 100. Give the guest rank-2 scout XP before joining and assert the sanitized roster exposes `rank: 2` and the host uses pickup multiplier 1.35 for that remote player. After the existing vote flow, assert the shared build remains identical.

- [ ] **Step 2: Run co-op checks and confirm runtime/UI failures**

Run: `node test/coop-nick.mjs && node test/coop-roles.mjs && npm run test:coop-expedition`

Expected: FAIL because the lobby lacks mastery presentation and Expedition runtime still risks using host/shared role logic.

- [ ] **Step 3: Make one source of specialist identity**

Import `SPECIALISTS`, `sanitizeSpecialistId`, and `specialistRank` where needed. Keep `sanitizeCoopRole` as a thin compatibility wrapper or replace its internals with `sanitizeSpecialistId(value, null)`. Do not create a second role registry.

When starting an Expedition level, resolve the local role from the local roster/save with guard fallback, never from `run.specialist`. `myInfo()` derives `rank` from local XP for the selected role; `sanitizeRosterEntry()` clamps untrusted input to `1..3`. Treat a missing role as guard only while Expedition is selected; do not change optional-role behavior in other modes. Ensure the host's `ex` broadcast stays sanitized and contains `specialist: null`.

- [ ] **Step 4: Upgrade lobby presentation without adding a new event**

Render the same three ids and canonical copy in the existing role section. Roster rows show the validated derived rank, never XP or claim history. This is part of the v607 protocol-23 format; do not create a second message type.

- [ ] **Step 5: Preserve non-Expedition balance and special contracts**

Keep current role application outside Expedition byte-for-byte where practical. In Expedition, skip the old role math and use Task 4 specialist passives once. Set Medic revive rate to `1 / 1.8` at rank 1 and `1 / 1.5` at rank 2+, and use the sanitized remote Scout rank for host-authoritative pickup multiplier 1.25/1.35. Radiation still clears/ignores the role runtime for that stage. Duplicate role choices remain valid.

- [ ] **Step 6: Run co-op regression and Expedition checks**

Run: `node test/coop-nick.mjs && node test/coop-roles.mjs && npm run test:coop-expedition && npm run test:coop`

Expected: PASS; role ids remain compatible, local Supers charge independently, shared route/build match, and ordinary co-op balance is unchanged.

- [ ] **Step 7: Commit the co-op slice**

```bash
git add src/net/coop.js src/main.js src/ui/coopui.js test/coop-nick.mjs test/coop-roles.mjs test/coop-expedition.mjs
git commit -m "feat: unify expedition specialists with coop roles"
```

---

### Task 7: Complete translations, accessibility, and focused regression coverage

**Files:**
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Modify: `test/i18n-parity.mjs`
- Modify: `test/mobile-a11y.mjs`
- Modify: `test/expedition-browser.mjs`
- Modify: `styles.css`

**Interfaces:**
- Adds translations for specialist names, passives, Supers, lock copy, charge, mastery gain, max rank, radiation contract, and rank-up feedback.
- Preserves exact placeholders such as `{n}`, `{xp}`, and `{rank}` in Ukrainian, English, and Russian.
- Guarantees keyboard focus, 44×44 px targets, screen-reader selection state, and reduced-motion-safe ready feedback.

- [ ] **Step 1: Enumerate source strings before editing dictionaries**

Use a focused search over the Task 3–6 diff. Create the exact Ukrainian key list once, then add one English and one Russian value for every key. Reuse existing strings such as `Захисник`, `Медик`, and `Розвідник` when already present rather than creating punctuation variants.

- [ ] **Step 2: Add accessibility assertions**

In `test/mobile-a11y.mjs` and `test/expedition-browser.mjs`, assert:

- three specialist controls have accessible names and minimum 44×44 px bounds;
- exactly one has `aria-pressed="true"` before lock;
- all are disabled after lock and lock copy is visible;
- the touch Super control contains the exact charge and updates to ready at 100;
- keyboard focus is visibly styled;
- at the mobile viewport the cards do not overflow the Expedition panel.

- [ ] **Step 3: Run parity/accessibility checks and confirm missing-copy failures**

Run: `node test/i18n-parity.mjs && node test/mobile-a11y.mjs && node test/expedition-browser.mjs`

Expected: FAIL until all new keys, placeholders, states, and mobile layout are complete.

- [ ] **Step 4: Add translations and final accessibility CSS**

Translate meaning, not identifiers. Keep `Super` as the player-facing borrowed term in all three languages for consistency with the existing game. Use existing `:focus-visible`, disabled, and reduced-motion conventions. Do not use color alone to indicate selection, rank, lock, or ready state.

- [ ] **Step 5: Run the complete focused feature suite**

Run:

```bash
node --test test/specialists.mjs test/expedition-unit.mjs
node test/runbuild.mjs
node test/cloudsave.mjs
node test/save-migration.mjs
npm run test:expedition
node test/coop-roles.mjs
node test/coop-nick.mjs
npm run test:coop-expedition
node test/super-pickup.mjs
node test/mobile-a11y.mjs
node test/i18n-parity.mjs
```

Expected: all PASS with no page errors or translation parity gaps.

- [ ] **Step 6: Commit the language/accessibility slice**

```bash
git add src/i18n/en.js src/i18n/ru.js styles.css test/i18n-parity.mjs test/mobile-a11y.mjs test/expedition-browser.mjs
git commit -m "feat: finish specialist expedition experience"
```

---

### Task 8: Bump v607/protocol, update PWA metadata, and verify the release candidate

**Files:**
- Modify: `src/main.js`
- Modify: `src/net/protocol.js`
- Modify: `version.json`
- Modify: `sw.js`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `test/version-sync.mjs` only if its existing generic checks require no value hard-code change

**Interfaces:**
- Changes: `APP_VERSION` 606→607.
- Changes: `version.json.v` 606→607.
- Changes: service-worker cache `zr-cache-v606`→`zr-cache-v607`.
- Changes: `PROTO_VERSION` 22→23 with comment `v607: Expedition v2 specialist and roster rank`.
- Adds: `./src/specialists.js` to the service-worker shell list.
- Documents: Specialist Expedition, mastery storage, Super input, and protocol 23.

- [ ] **Step 1: Confirm the pre-bump feature suite is green**

Run the complete Task 7 suite before changing metadata.

Expected: PASS. If any check fails, fix the owning feature task before continuing; do not mask it with release edits.

- [ ] **Step 2: Make the synchronized release bump**

Change all three application/cache version sources to 607 and the protocol to 23 in one edit. Add `./src/specialists.js` beside `./src/expedition.js` in `sw.js`. Update README's current protocol statement and add a concise v607 CHANGELOG entry covering specialists, Supers, biased solo cards, mastery, save migration, validated roster rank, co-op reuse, and radiation/turretwar contracts.

- [ ] **Step 3: Run metadata and offline checks**

Run: `node test/version-sync.mjs && node test/pwa-offline.mjs`

Expected: PASS with `version.json.v=607`, `APP_VERSION=607`, `PROTO_VERSION=23`, `SW_CACHE_V=607`, and the specialist module available offline.

- [ ] **Step 4: Run focused and release gates**

Run:

```bash
node --test test/specialists.mjs test/expedition-unit.mjs
node test/runbuild.mjs
node test/cloudsave.mjs
node test/save-migration.mjs
npm run test:expedition
node test/coop-roles.mjs
node test/coop-nick.mjs
npm run test:coop-expedition
node test/super-pickup.mjs
node test/mobile-a11y.mjs
node test/i18n-parity.mjs
npm test
npm run test:quick-release
```

Expected: every command exits 0; browser checks report no page errors; version/cache/protocol values agree.

- [ ] **Step 5: Perform manual desktop, mobile, and two-client acceptance playtests**

Desktop solo:

1. Continue an old v1 mid-run save and confirm its route/build/reward remain intact with guard selected.
2. Start fresh runs with all three specialists and verify kits, passives, exact charge rates, failed spend, successful spend, and per-stage reset.
3. Verify route and in-level cards remain varied while preferred cards appear more often over repeated seeded runs.
4. Verify radiation disables everything specialist-related and turretwar remains hammer-only.
5. Verify win/failure mastery awards once, rank 2/3 changes apply, and active abandon grants nothing.
6. Exit Expedition and verify the wardrobe gadget and random Super pickup work as in v606.

Mobile:

1. Select each specialist without horizontal overflow or accidental route selection.
2. Confirm the existing gadget button becomes Super, shows percentage, activates at 100, and returns to gadget behavior outside Expedition.
3. Confirm selected, locked, ready, rank-3, and radiation states are understandable without hover.

Two-client co-op:

1. Choose different and duplicate specialist combinations.
2. Confirm each client receives its own kit/passive/Super and charge while route/build/votes remain identical.
3. Complete one stage, reconnect once, and continue the shared v2 Expedition.
4. Finish a run and confirm each local profile claims XP once for its own chosen specialist.
5. Start ordinary non-Expedition co-op and confirm v606 role balance remains unchanged.

- [ ] **Step 6: Inspect the final diff and commit release metadata**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors, no generated artifacts, no new dependency/asset/currency/top-level mode, and only files named by this plan.

```bash
git add src/main.js src/net/protocol.js version.json sw.js README.md CHANGELOG.md test/version-sync.mjs
git commit -m "release: ship specialist expedition v607"
```

## Definition of Done

- A fresh solo Expedition visibly offers three specialists and locks the choice after the first won stage.
- Each specialist has the exact approved kit, passive, charge rate, rank progression, and Super effect.
- Super uses local confirmed hits, resets per stage, never spends on a failed activation, and reuses `F`/the existing touch button.
- Solo route and in-level cards use ×2 thematic weighting; co-op cards remain shared and unbiased.
- Terminal mastery awards are correct and idempotent; active abandonment grants zero.
- v1 Expedition saves migrate to v2 without route/build/status/reward loss; malformed new fields cannot erase other progress.
- Co-op reuses `guard`/`medic`/`scout`, permits duplicates, keeps shared route/build authoritative, and preserves ordinary v606 role balance outside Expedition.
- Radiation and turretwar contracts match the specification.
- Skins and other cosmetic systems remain stat-free; no new mode, currency, backend, dependency, or asset was added.
- Ukrainian, English, and Russian copy, keyboard/touch accessibility, offline cache, versions, and protocol checks pass.
- All automated and manual gates in Task 8 pass before any release or deployment action.
