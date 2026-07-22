# Spain Destruction Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give destroyed Spain one exact six-objective recovery operation and leave its normal campaign unchanged.

**Architecture:** Derive three Spain-only Front presets from the canonical destroyed country state. Reuse `DynamicMissions`: extend `rebuild` for the musician/tools/resources/Music Center stage, and add two thin mission types that reuse existing village-zone and defense mechanics.

**Tech Stack:** Browser JavaScript modules, Three.js, existing Front reducer, DynamicMissions, Node/Playwright checks.

## Global Constraints

- The order is musicians → tools → 50 iron/100 stone/55 wood → 30-second Music Center build → clear village → defend fireworks.
- The sequence applies only when Spain's Front state is `destroyed`; normal Spain campaign is unchanged.
- Reuse existing mission, co-op, revive, result, and reward systems; no new dependency, asset, protocol message, or mission framework.
- Host remains authoritative and guest personal Front saves are never replaced.
- Release metadata must end synchronized at app/version/cache `601`; protocol remains `22` unless the wire format changes.

---

### Task 1: Select Spain's destroyed recovery stages

**Files:**
- Modify: `src/worldfront.js:36-52,188-214,531-547`
- Modify: `src/ui/frontui.js:12-24`
- Test: `test/worldfront-unit.mjs`

**Interfaces:**
- Consumes: `frontCountryState(front, 'ESP')`, `frontStageConfig(front)`.
- Produces: presets `spain-rebuild-center`, `spain-clear-village`, `spain-defend-fireworks`.

- [ ] **Step 1: Write the failing reducer/config check**

Add a case that creates an ESP Front, applies three `DAMAGE_COUNTRY` events, starts the ESP operation, and expects:

```js
assert.deepEqual([
  stage0.missionPreset,
  stage1.missionPreset,
  stage2.missionPreset,
], ['spain-rebuild-center', 'spain-clear-village', 'spain-defend-fireworks']);
```

Also create an undamaged ESP Front and assert it still uses its normal template stages.

- [ ] **Step 2: Run the check and verify RED**

Run: `node --test test/worldfront-unit.mjs`

Expected: destroyed ESP still returns a generic template preset.

- [ ] **Step 3: Add the minimum state-derived stage selector**

Use one helper in `src/worldfront.js`:

```js
const SPAIN_REBUILD_STAGES = Object.freeze([
  'spain-rebuild-center',
  'spain-clear-village',
  'spain-defend-fireworks',
]);

function operationStages(front, operation) {
  if (operation.country === 'ESP' && front.world.countries.ESP?.damage >= 3) {
    return SPAIN_REBUILD_STAGES;
  }
  // existing evacuation/template selection
}
```

Pass `front` to every `operationStages` call. Add the three labels to the existing Front label map; do not add another mapper.

- [ ] **Step 4: Run the check and verify GREEN**

Run: `node --test test/worldfront-unit.mjs`

Expected: all tests pass and normal Spain remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/worldfront.js src/ui/frontui.js test/worldfront-unit.mjs
git commit -m "feat: route destroyed Spain to recovery"
```

---

### Task 2: Build the exact six-objective mission flow

**Files:**
- Modify: `src/main.js:154-168`
- Modify: `src/missionpool.js:20-58,190-330,480-550,850-900,1035-1070,1420-1510,1719-1800,2520-2560`
- Test: `test/spain-rebuild-browser.mjs`

**Interfaces:**
- Consumes: `DynamicMissions(level, forcedTypes, { objectiveOnly: true })`.
- Produces: Spain-specific `rebuild`, `villageclear`, and `fireworks` stages using normal `missionDone` sync.

- [ ] **Step 1: Write the failing browser scenario**

Add a focused check that starts each destroyed-Spain preset and inspects the live mission state. Required assertions:

```js
check(stage1.phases.join(',') === 'musicians,tools,resources,build,done');
check(stage1.required.iron === 50 && stage1.required.stone === 100 && stage1.required.wood === 55);
check(stage1.buildSeconds === 30 && new Set(stage1.attackSides).size === 4);
check(stage2.site === 'village' && stage2.type === 'villageclear');
check(stage3.site === 'fireworks' && stage3.type === 'fireworks');
```

Confirm a normal Spain campaign still starts `esp-band` and does not contain the special Front mission types.

- [ ] **Step 2: Run the check and verify RED**

Run: `node test/spain-rebuild-browser.mjs`

Expected: the special presets/types do not exist.

- [ ] **Step 3: Wire the presets to existing DynamicMissions**

Extend the existing preset object only:

```js
'spain-rebuild-center': ['rebuild'],
'spain-clear-village': ['villageclear'],
'spain-defend-fireworks': ['fireworks'],
```

Add `villageclear` and `fireworks` to `MISSION_TYPES`. In `_makeMission`, place them at `map.sites.village` and `map.storySites.fireworks`. `fireworks` creates the existing defense zone and delegates update behavior to `_up_defense` with a 30-second timer. `villageclear` spawns a bounded village group and completes when that group is dead; it does not open the warehouse crate or unlock a weapon.

- [ ] **Step 4: Extend `rebuild` only for Spain's special preset**

Derive the flag once:

```js
const spanish = level.countryId === 'ESP'
  && level.operation?.missionPreset === 'spain-rebuild-center';
```

For `spanish`, initialize:

```js
m.phase = 'musicians';
m.required = { iron: 50, stone: 100, wood: 55 };
m.iron = m.stone = m.wood = 0;
```

Use Spain's existing barn/musician civilian path, then transition to `tools`. Spawn deterministic nodes totaling exactly 50 iron, 100 stone, and 55 wood. Iron and stone both require the pickaxe; wood requires the axe. Resource completion checks the three required counters instead of assuming every point was consumed.

During `build`, keep the existing 30-second interaction and spawn each wave around angles `0`, `π/2`, `π`, and `3π/2` from `fiestaSquare`. Spain-specific HUD copy says `Музичний центр`.

- [ ] **Step 5: Reuse existing cleanup, beacon, and co-op paths**

Update `_beamTarget`, `resourceHitTest`, `damageResource`, `netMissionDone`, and mission marker generation only where their existing type/phase guards need the new data. Do not add a new network event: stage completion remains the existing `md`/Front checkpoint flow.

- [ ] **Step 6: Run focused checks and verify GREEN**

Run:

```bash
node test/spain-rebuild-browser.mjs
node test/coop-worldfront.mjs
node test/worldfront-browser.mjs
node test/i18n-parity.mjs
```

Expected: every command exits `0` with no browser JavaScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/missionpool.js test/spain-rebuild-browser.mjs
git commit -m "feat: rebuild destroyed Spain through music"
```

---

### Task 3: Localize, release, and validate v601

**Files:**
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Modify: `src/main.js:131-134`
- Modify: `version.json`
- Modify: `sw.js:4`
- Modify: `CHANGELOG.md`
- Test: `test/version-sync.mjs`
- Test: `test/pwa-offline.mjs`

**Interfaces:**
- Consumes: all Spain recovery copy and release metadata.
- Produces: installable v601 with protocol 22.

- [ ] **Step 1: Add exact EN/RU mappings**

Translate every new Ukrainian key with identical placeholders. Run `node test/i18n-parity.mjs` and fix only reported missing/mismatched Spain keys.

- [ ] **Step 2: Bump release metadata together**

Set:

```js
const APP_VERSION = 601;
const CACHE = 'zr-cache-v601';
```

Set `version.json` to `{ "v": 601 }`. Keep `PROTO_VERSION = 22` because the existing mission/Front messages are unchanged.

- [ ] **Step 3: Document the player-facing change**

Add one v601 changelog entry: destroyed Spain now has the approved six-step Music Center recovery, exact resources, four-direction build attack, village clear, and fireworks defense.

- [ ] **Step 4: Run final validation**

Run:

```bash
node --test test/worldfront-unit.mjs test/worldevents.mjs
node test/spain-rebuild-browser.mjs
node test/globe-front.mjs
node test/worldfront-browser.mjs
node test/coop-worldfront.mjs
node test/mobile-a11y.mjs
node test/i18n-parity.mjs
node test/version-sync.mjs
node test/pwa-offline.mjs
npm test
git diff --check
```

Expected: all commands exit `0`, version output is `601/601/22/601`, and no browser JavaScript errors are reported.

- [ ] **Step 5: Commit and stop before publication**

```bash
git add src/i18n/en.js src/i18n/ru.js src/main.js version.json sw.js CHANGELOG.md test/version-sync.mjs test/pwa-offline.mjs
git commit -m "release: ship Spain recovery v601"
```

Do not push, create a PR, merge, deploy, or publish without a separate user instruction.
