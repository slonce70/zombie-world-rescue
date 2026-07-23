# Expedition Fighter Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Додати п’ять профілів бійців Експедиції та безпечну платну прокачку готових бійців до рівня 5.

**Architecture:** `src/specialists.js` залишається канонічним джерелом бійців і pure-логіки прогресії. `src/main.js` лише мігрує сейв, викликає купівлю, рендерить dialog і застосовує множник у соло-Експедиції. Два нові профілі видимі, але не запускаються до появи авторських бойових наборів.

**Tech Stack:** Native ES modules, Three.js runtime, DOM overlays, Node assert tests, Playwright browser tests.

## Global Constraints

- Рівень 1 безкоштовний; рівні 2–5 коштують `250`, `500+3`, `1000+10`, `2000+25`.
- Кожен рівень дає `+10%` HP і шкоди тільки в соло-Експедиції.
- Бастіон та Імпульс не отримують тимчасової зброї, атаки, Super або гаджетів.
- `PROTO_VERSION` залишається `23`.
- Жодної нової залежності.

---

### Task 1: Pure fighter model and save contract

**Files:**
- Modify: `src/specialists.js`
- Modify: `src/main.js`
- Modify: `src/net/cloudsave.js`
- Test: `test/specialists.mjs`
- Test: `test/save-migration.mjs`
- Test: `test/cloudsave.mjs`

**Interfaces:**
- Produces: `EXPEDITION_FIGHTER_IDS`, `FIGHTER_UPGRADE_COSTS`, `sanitizeFighterId(value)`, `sanitizeFighterLevels(value)`, `fighterLevelMultiplier(level)`, `buyFighterLevel(state, id)`.

- [ ] **Step 1: Write failing unit assertions**

```js
assert.deepEqual(EXPEDITION_FIGHTER_IDS, ['guard', 'medic', 'scout', 'bastion', 'impulse']);
assert.deepEqual(sanitizeFighterLevels({ guard: 9, bastion: -1 }), {
  guard: 5, medic: 1, scout: 1, bastion: 1, impulse: 1,
});
assert.equal(fighterLevelMultiplier(5), 1.4);
assert.deepEqual(buyFighterLevel({ fighterLevels: {}, coins: 250, crystals: 0 }, 'guard'), {
  ok: true, reason: null, level: 2, coins: 0, crystals: 0,
  fighterLevels: { guard: 2, medic: 1, scout: 1, bastion: 1, impulse: 1 },
});
```

- [ ] **Step 2: Verify RED**

Run: `node test/specialists.mjs`  
Expected: FAIL because fighter progression exports do not exist.

- [ ] **Step 3: Implement minimum pure model**

Add five canonical profile ids, immutable level costs, integer sanitization,
the `1 + (level - 1) * 0.1` multiplier, and atomic currency validation.
`buyFighterLevel` must return reasons `unknown`, `unavailable`, `max`,
`coins`, or `crystals` without mutating input.

- [ ] **Step 4: Wire save migration and cloud progress**

Default and sanitized saves contain `fighterLevels`. Cloud progress treats any
level above 1 as progress. Existing saves without the key become level 1.

- [ ] **Step 5: Verify GREEN**

Run: `node test/specialists.mjs && node test/save-migration.mjs && SLOW=1 node test/cloudsave.mjs`  
Expected: all pass.

### Task 2: Fighter profile dialog and purchases

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/main.js`
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Create: `test/fighter-progression-browser.mjs`

**Interfaces:**
- Consumes: pure model from Task 1.
- Produces: `Game.openExpeditionFighter(id)` and `Game.renderExpeditionFighter()`.

- [ ] **Step 1: Write failing browser test**

The test opens Expedition, clicks `data-specialist="guard"`, checks the dialog,
injects currency, upgrades to level 2, verifies exact balances and stored level,
then opens `bastion` and checks disabled select/upgrade plus four
`Очікує твоєї ідеї` ability labels.

- [ ] **Step 2: Verify RED**

Run: `node test/fighter-progression-browser.mjs`  
Expected: FAIL because the fighter dialog is absent.

- [ ] **Step 3: Add native DOM dialog**

Add `overlay-fighter` with existing overlay focus helpers. Change specialist
card clicks from immediate selection to opening the profile. A profile owns the
select action, upgrade action, exact cost copy and two gadget slots.

- [ ] **Step 4: Add minimal responsive styles and translations**

Reuse the dark panel palette, 44px controls, internal scroll and existing
reduced-motion behavior. Add Ukrainian keys with English and Russian parity.

- [ ] **Step 5: Verify GREEN**

Run: `node test/fighter-progression-browser.mjs && node test/i18n-parity.mjs`  
Expected: both pass with no browser console errors.

### Task 3: Level bonuses and release gates

**Files:**
- Modify: `src/main.js`
- Modify: `src/hud.js`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `version.json`
- Modify: `sw.js`
- Modify: `test/quick-release.mjs`
- Test: `test/expedition-browser.mjs`

**Interfaces:**
- Consumes: `fighterLevelMultiplier()` and sanitized fighter levels.
- Produces: `level.specialist.level` for HUD and runtime checks.

- [ ] **Step 1: Extend the browser test with runtime stats**

At level 3, start a solo Expedition node and assert
`maxHealth === round(level-1 maxHealth * 1.2)` and
`damageMult === level-1 damageMult * 1.2`. Assert co-op still reports the old
mastery rank and protocol 23.

- [ ] **Step 2: Verify RED**

Run: `node test/fighter-progression-browser.mjs`  
Expected: FAIL because fighter level does not affect runtime stats.

- [ ] **Step 3: Apply the multiplier once**

During Expedition player construction, after the existing specialist passive
and before RunBuild restoration, multiply max HP and `damageMult` only when
`run.coop === false`. Set current health to the new max and expose level in HUD.

- [ ] **Step 4: Bump release truth**

Set `APP_VERSION`, `version.json` and SW cache to `609`; keep
`PROTO_VERSION = 23`. Add the focused browser test to quick-release and document
the new visible behavior.

- [ ] **Step 5: Run verification**

Run:

```bash
node test/fighter-progression-browser.mjs
node test/specialists.mjs
node test/save-migration.mjs
node test/i18n-parity.mjs
node test/version-sync.mjs
node test/sw-cache.mjs
npm test
npm run test:quick-release
git diff --check
```

Expected: every command exits 0.
