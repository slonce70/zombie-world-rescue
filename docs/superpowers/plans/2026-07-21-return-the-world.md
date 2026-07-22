# Return the World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing campaign, Living Front, co-op, destruction, and rebuilding systems into one clear loop where every operation visibly changes a recoverable country.

**Architecture:** Keep `src/worldfront.js` as the only persistent domain model and keep co-op host-authoritative. Reuse the existing three Front stages as consecutive checkpoints of one player-facing operation, add a dedicated Front result flow, and make globe/Front UI/HUD consume one semantic country-state presentation instead of rendering raw counters independently.

**Tech Stack:** Plain JavaScript modules, Three.js, existing DOM/CSS overlays, Node `node:test`, Playwright browser checks, current WebSocket relay and PWA service worker.

**Design spec:** `docs/superpowers/specs/2026-07-21-return-the-world-design.md`

## Global Constraints

- Target release: `APP_VERSION = 600`, `version.json = 600`, service-worker cache `zr-cache-v600`.
- Bump `PROTO_VERSION` once, from `21` to `22`, because lobby readiness changes the wire format.
- Country destruction is fully reversible and changes only after a terminal operation result; elapsed offline days never damage a country.
- Optimize the experience for two equal online players while preserving the current four-player room ceiling.
- Preserve host-authoritative Front state; a guest receives rewards but never replaces their personal Front with the host's world.
- Keep co-op roles optional self-buffs; no objective may require a specific role.
- Reuse current currencies, modes, mission presets, builds, enemies, panels, colors, and low-poly assets.
- Add no dependency, new backend, new currency, global shared-world simulation, AI replacement teammate, or new top-level mode.
- Keep one dominant globe CTA: `Продовжити порятунок`. Put secondary activities under `Інші операції`.
- Ukrainian strings remain source keys and must have English and Russian translations.
- Do not perform a security audit.
- Verification is targeted: extend existing Front/co-op checks, add no broad new test framework, and finish with manual desktop/mobile/co-op playtests.
- Do not bump release or protocol versions before Task 8.

## File Map

- Create `src/ui/frontcopy.js`: shared human-language labels, consequence copy, and next-action copy for globe and Front UI.
- Modify `src/worldfront.js`: country-state derivation, no offline attacks, terminal failure, repeatable recovery chain, idempotent rewards.
- Modify `src/main.js`: continuous Front phase flow, dedicated result actions, primary rescue routing, co-op continuation.
- Modify `src/globe.js`: semantic Front colors/status and one recommended rescue target.
- Modify `src/ui/frontui.js`: human country cards, primary co-op and secondary solo actions.
- Modify `src/hud.js`, `src/missionpool.js`, `src/story/storymissions.js`: one active objective and compact optional objective.
- Modify `src/net/coop.js`, `src/net/frontsync.js`, `src/net/protocol.js`, `src/ui/coopui.js`: ready state, pending Front operation, host-controlled continuation.
- Modify `index.html`, `styles.css`: grouped globe actions, Front result overlay, responsive country card and lobby readiness.
- Modify `src/i18n/en.js`, `src/i18n/ru.js`: exact translations for all new Ukrainian copy.
- Modify existing tests only: `test/worldfront-unit.mjs`, `test/worldfront-browser.mjs`, `test/globe-front.mjs`, `test/living-front-browser.mjs`, `test/story-campaign2-browser.mjs`, `test/coop-worldfront.mjs`, `test/coop-roles.mjs`, `test/mobile-a11y.mjs`, `test/i18n-parity.mjs`, `test/version-sync.mjs`.
- Modify release metadata in Task 8 only: `src/main.js`, `src/net/protocol.js`, `version.json`, `sw.js`, `README.md`, `CHANGELOG.md`.

---

### Task 1: Make World Front transitions match the approved country lifecycle

**Files:**
- Modify: `src/worldfront.js:1-610`
- Modify: `src/globe.js:8-16,355-375,414-435`
- Modify: `src/ui/frontui.js:300-345`
- Test: `test/worldfront-unit.mjs`
- Test: `test/globe-front.mjs`

**Interfaces:**
- Produces: `frontCountryState(front, countryId).state` is exactly one of `peaceful`, `attacked`, `destroyed`, `rebuilding`, `saved`.
- Produces: `applyFrontEvent(front, { type: 'END_FAILED_OPERATION' })` commits one player-confirmed defeat and clears the active run.
- Preserves: `frontStageConfig(front)` and the persisted `save.front.v = 1` shape.
- Preserves: `CLAIM_OPERATION` grant effects and stable claim ledger, now unique per recovery step.

- [ ] **Step 1: Replace the offline-attack expectations with lifecycle expectations**

In `test/worldfront-unit.mjs`, replace the daily attack/refugee tests and extend the claim/failure tests with:

```js
test('offline days never change a country', () => {
  let front = reduce(null, { type: 'INIT', seed: 910, liberated: ['UKR'], day: '2026-07-17' }).front;
  front.world.countries.UKR = { damage: 2, population: 64 };
  const before = structuredClone(front.world.countries);
  const result = reduce(front, { type: 'INIT', liberated: ['UKR'], day: '2026-07-24' });
  assert.deepEqual(result.front.world.countries, before);
  assert.equal(result.effects.some((effect) => effect.key === 'front.worldAttacked'), false);
});

test('terminal defeat is explicit, idempotent and rebuilding never regresses', () => {
  let front = createFront({ seed: 913, liberated: ['UKR'] });
  const operationId = front.board[0].id;
  front = reduce(front, { type: 'START_OPERATION', operationId }).front;
  front = reduce(front, { type: 'START_STAGE' }).front;
  front = reduce(front, { type: 'FAIL_STAGE' }).front;
  const failed = reduce(front, { type: 'END_FAILED_OPERATION' });
  assert.equal(failed.front.active, null);
  assert.equal(failed.front.world.countries.UKR.damage, 1);
  assert.deepEqual(reduce(failed.front, { type: 'END_FAILED_OPERATION' }).front, failed.front);

  front = createFront({ seed: 914, liberated: ['UKR'] });
  front.restored.UKR = 1;
  const restoredBefore = structuredClone(front);
  front = reduce(front, { type: 'START_OPERATION', operationId: front.board[0].id }).front;
  front = reduce(front, { type: 'START_STAGE' }).front;
  front = reduce(front, { type: 'FAIL_STAGE' }).front;
  front = reduce(front, { type: 'END_FAILED_OPERATION' }).front;
  assert.equal(front.restored.UKR, restoredBefore.restored.UKR);
});

test('a next-cycle counterattack preserves completed rebuilding', () => {
  let front = createFront({ seed: 509, liberated: ['UKR', 'POL', 'DEU', 'FRA'] });
  front.restored = { UKR: 3, POL: 3, DEU: 3, FRA: 3 };
  const protectedCountries = new Set(front.board.map((operation) => operation.country));
  const exposedCountry = ['UKR', 'POL', 'DEU', 'FRA'].find((country) => !protectedCountries.has(country));
  for (const operation of front.board.slice()) front = saveCountry(front, operation.country).front;
  const before = front.restored[exposedCountry];
  const result = reduce(front, { type: 'ADVANCE_GENERATION', liberated: ['UKR', 'POL', 'DEU', 'FRA'] });
  assert.equal(result.front.restored[exposedCountry], before);
  assert.equal(result.front.world.countries[exposedCountry].damage, 1);
  assert.equal(result.front.board.find((operation) => operation.country === exposedCountry).counterattack, true);
});
```

Replace the old “three board rows means one completed cycle” helper with a recovery-aware helper, then make the cycle test save every country completely:

```js
function saveCountry(front, country) {
  const effects = [];
  while ((front.restored[country] || 0) < 3
    || front.world.countries[country].damage > 0
    || front.board.some((row) => row.country === country && row.status !== 'claimed')) {
    const operation = front.board.find((row) => row.country === country && row.status === 'available');
    assert.ok(operation, `available recovery operation for ${country}`);
    const result = winAndClaim(front, operation.id);
    front = result.front;
    effects.push(...result.effects);
  }
  return { front, effects };
}

const countries = [...new Set(front.board.map((row) => row.country))];
const allEffects = [];
for (const country of countries) {
  const result = saveCountry(front, country);
  front = result.front;
  allEffects.push(...result.effects);
}
assert.equal(front.board.every((row) => row.status === 'claimed'), true);
assert.equal(allEffects.filter((effect) => effect.key === 'front.cycleComplete').length, 1);
```

For every `grant` ending in `:operation`, keep the existing canonical coin/crystal calculation using the matching operation threat captured before `winAndClaim`. Keep the existing project, cycle egg/crystal, generation-advance, and duplicate-claim assertions after the final cycle claim so repeated recovery operations remain canonical and idempotent.

- [ ] **Step 2: Run the domain checks and confirm they fail for the current behavior**

Run: `node --test test/worldfront-unit.mjs`

Expected: FAIL because `INIT` still applies elapsed-day damage and `END_FAILED_OPERATION` is not implemented.

- [ ] **Step 3: Remove elapsed-day damage and add explicit terminal failure**

In `src/worldfront.js`, remove `elapsedDays()` and the attack loop from `INIT`. Keep the legacy `world.day` sanitized and updated, but never use it to mutate countries. Add this reducer branch after `FAIL_STAGE`:

```js
if (event.type === 'END_FAILED_OPERATION') {
  if (!front.active || front.active.status !== 'ready') return unchanged(sanitized);
  const operation = operationById(front, front.active.operationId);
  if (!operation) return unchanged(sanitized);
  const rebuilding = (front.restored[operation.country] || 0) > 0 && !operation.counterattack;
  if (!rebuilding) {
    const country = front.world.countries[operation.country] || { damage: 0, population: 100 };
    country.damage = Math.min(3, country.damage + 1);
    country.population = Math.max(20, country.population - 4 - operation.threat * 2);
    front.world.countries[operation.country] = country;
  }
  operation.status = 'available';
  front.active = null;
  return changed(front, [], 'front.operationFailed');
}
```

- [ ] **Step 4: Make completed countries continue through rebuilding instead of disappearing from the board**

Change the operation reward id to include the pre-claim recovery level:

```js
const operationRewardId = (front, operation) =>
  `front:${front.seed}:${operation.id}:r${front.restored[operation.country] || 0}:operation`;
```

In `CLAIM_OPERATION`, after repairing damage and increasing `restored`, keep the same board slot available until the country is fully saved:

```js
const saved = country.damage === 0 && front.restored[operation.country] >= 3;
if (saved) {
  operation.status = 'claimed';
} else {
  operation.template = country.damage >= 2 ? 'evacuation' : 'siege';
  operation.id = operationId(front.generation, operation.country, operation.template);
  operation.threat = Math.max(1, Math.min(3, country.damage || 1));
  operation.counterattack = false;
  operation.status = 'available';
}
front.active = null;
```

Compute cycle completion only from fully claimed board slots. In `ADVANCE_GENERATION`, keep `front.restored[counterattackCountry]` unchanged; a next-cycle counterattack increases `damage` and reduces `population`, but never erases the completed outpost or memorial. In `frontViewModel`, recommend an available country with `restored > 0` before unrelated operations.

- [ ] **Step 5: Replace the ambiguous state names at the single domain boundary**

Implement `frontCountryState` with this priority and update the two consumers in `src/globe.js` and `src/ui/frontui.js`:

```js
const restored = front.restored[countryId] || 0;
const activeAttack = !!operation && ['available', 'active'].includes(operation.status)
  && (operation.counterattack || restored === 0);
let state = 'peaceful';
if (world.damage >= 3) state = 'destroyed';
else if (activeAttack) state = 'attacked';
else if (world.damage === 0 && restored >= 3) state = 'saved';
else if (restored > 0 || (operation && ['completed', 'claimed'].includes(operation.status))) state = 'rebuilding';
else if (world.damage > 0 || operation) state = 'attacked';
```

Use matching globe colors by renaming the existing map keys to `attacked`, `rebuilding`, and `saved`; add `peaceful` only as a neutral fallback.

- [ ] **Step 6: Run the focused domain and globe checks**

Run: `node --test test/worldfront-unit.mjs && node test/globe-front.mjs`

Expected: both PASS; the test output confirms no offline mutation, one explicit defeat, reversible rebuilding, and the five state names.

- [ ] **Step 7: Commit the domain slice**

```bash
git add src/worldfront.js src/globe.js src/ui/frontui.js test/worldfront-unit.mjs test/globe-front.mjs
git commit -m "feat: complete reversible country lifecycle"
```

---

### Task 2: Turn three Front stages into one continuous player-facing operation

**Files:**
- Modify: `index.html:690-715`
- Modify: `styles.css` near existing victory/front overlay rules
- Modify: `src/main.js:490-520,2520-2610,2890-2945,4100-4145`
- Test: `test/worldfront-browser.mjs`

**Interfaces:**
- Produces: `Game._showFrontResult({ won, terminal, before, after })` owns the dedicated Front result overlay.
- Produces: `Game._finishFrontResult(action)` accepts `continue`, `retry`, `end`, or `globe`.
- Consumes: `END_FAILED_OPERATION` and the five-state `frontCountryState` from Task 1.
- Preserves: underlying levels may rebuild between stages, but the player never returns to the globe until the operation ends.

- [ ] **Step 1: Update the browser scenario to expect checkpoint continuation**

In `test/worldfront-browser.mjs`, change the three-stage loop so stage 0 and 1 assert that `#overlay-front-result` appears with `data-kind="checkpoint"`, then click `#btn-front-result-primary` and wait for the next Front level. Add a defeat assertion:

```js
await page.evaluate(() => window.__game._showFrontModeResult(window.__game.level, false, '💀', 'Операцію провалено', ''));
await page.waitForSelector('#overlay-front-result.show[data-kind="failed"]');
await page.click('#btn-front-result-end');
await page.waitForFunction(() => window.__game.state === 'globe');
```

Expected final assertions: retry keeps the same `active.stage`; ending the failed operation clears `active` and worsens at most one country step.

- [ ] **Step 2: Run the browser check and confirm the missing overlay failure**

Run: `node test/worldfront-browser.mjs`

Expected: FAIL because the dedicated result overlay and continuous actions do not exist.

- [ ] **Step 3: Add a Front-only result overlay**

Add after `overlay-arena-end` in `index.html`:

```html
<div id="overlay-front-result" class="overlay" data-kind="" aria-hidden="true">
  <div class="overlay-card victory-card front-result-card">
    <h1 id="front-result-title"></h1>
    <p id="front-result-summary" class="storm-sub"></p>
    <div id="front-result-change" class="front-result-change"></div>
    <div class="btn-row">
      <button id="btn-front-result-primary" class="btn btn-primary big"></button>
      <button id="btn-front-result-end" class="btn big"></button>
    </div>
  </div>
</div>
```

Style it by reusing `.victory-card`, `.front-status`, and existing button rules. Add only layout rules for `.front-result-change`; do not introduce a new palette.

- [ ] **Step 4: Route stage completion into checkpoint, retry, or terminal result**

In `_finishFrontStage(won)`, capture `before = frontCountryState(...)`, apply `COMPLETE_STAGE` or `FAIL_STAGE`, claim only after the final stage, then call:

```js
const terminal = won && !this.save.front.active;
const after = frontCountryState(this.save.front, level.countryId);
this._showFrontResult({ won, terminal, before, after });
```

The primary button label is `ПРОДОВЖИТИ ОПЕРАЦІЮ` for a won checkpoint, `ПОВТОРИТИ ФАЗУ` for a loss, and `ПРОДОВЖИТИ ПОРЯТУНОК` for a terminal win. The secondary button is `ЗАВЕРШИТИ ОПЕРАЦІЮ` only after defeat; otherwise it is `ДО ГЛОБУСА`.

- [ ] **Step 5: Implement one restart path for solo and co-op host**

Add a transient `this._frontNextAction` consumed by `endLevel()`:

```js
_finishFrontResult(action) {
  this._hideOverlay('overlay-front-result');
  if (action === 'end') this._applyFrontTransition({ type: 'END_FAILED_OPERATION' });
  this._frontNextAction = action;
  this.endLevel();
}
```

After cleanup, route `continue` and `retry` to `startFrontOperation(active.operationId)` for solo or the host; guests return to the lobby and wait for the host's next `start`. Route `end` and `globe` to `openFront()`. Clear `_frontNextAction` after consuming it so other modes cannot inherit the action.

- [ ] **Step 6: Run the focused browser check**

Run: `node test/worldfront-browser.mjs`

Expected: PASS with one uninterrupted three-checkpoint flow, explicit retry/end choices, one terminal claim, and no use of `overlay-arena-end` for Front.

- [ ] **Step 7: Commit the operation-flow slice**

```bash
git add index.html styles.css src/main.js test/worldfront-browser.mjs
git commit -m "feat: keep Front operations continuous"
```

---

### Task 3: Replace raw destruction counters with a clear country decision card

**Files:**
- Create: `src/ui/frontcopy.js`
- Modify: `src/ui/frontui.js:1-410`
- Modify: `src/globe.js:1-550`
- Modify: `src/main.js:480-505,1370-1420,2510-2580`
- Modify: `index.html:35-150`
- Modify: `styles.css:760-930` and Front responsive rules
- Test: `test/globe-front.mjs`
- Test: `test/living-front-browser.mjs`

**Interfaces:**
- Produces: `frontCountryCopy(countryState, countryName)` returns `{ label, summary, consequence, action }` with escaped text supplied by consumers.
- Produces: `Game.continueRescue()` routes to the next campaign country before Front unlock and to the recommended Front operation afterward.
- Produces: `Game.prepareFrontTogether(operationId, specialist)` prepares the operation and opens co-op without starting a solo level.

- [ ] **Step 1: Change existing UI checks to assert human meaning, not raw ratios**

Update `test/globe-front.mjs` and `test/living-front-browser.mjs` to require `ЩО СТАЛОСЯ`, `НАСТУПНА ОПЕРАЦІЯ`, a consequence sentence, and one recommended card. Assert that the primary card line does not contain `🧱 2/3` or `👥 60%`; those values may exist only inside `<details class="front-details">`.

- [ ] **Step 2: Run the two UI checks and confirm the current raw-copy failure**

Run: `node test/globe-front.mjs && node test/living-front-browser.mjs`

Expected: FAIL because globe and operation cards still render raw damage/population as the main message.

- [ ] **Step 3: Add one shared copy mapper**

Create `src/ui/frontcopy.js`:

```js
import { t } from '../i18n.js';

export function frontCountryCopy(state, countryName) {
  const people = Math.max(0, Math.min(100, state && state.population || 0));
  const copy = {
    peaceful: ['Мирна', '{country} поки в безпеці.', 'Поразка відкриє шлях орді.', 'Підготувати захист'],
    attacked: ['Під атакою', 'Орда атакує {country}.', 'Поразка посилить руйнування.', 'Зупинити атаку'],
    destroyed: ['Зруйнована', 'Люди в {country} залишилися серед руїн.', 'Країна чекатиме на повторний порятунок.', 'Врятувати людей'],
    rebuilding: ['Відбудова', '{country} повертається до життя.', 'Поразка не забере вже відновлений район.', 'Продовжити відбудову'],
    saved: ['Врятована', '{country} повністю відновлена.', 'Нові загрози зʼявляться лише в наступному циклі.', 'Захистити результат'],
  }[state && state.state] || ['Мирна', '{country} чекає на рятувальників.', '', 'Почати операцію'];
  const fill = (value) => t(value, { country: countryName, people });
  return { label: fill(copy[0]), summary: fill(copy[1]), consequence: fill(copy[2]), action: fill(copy[3]) };
}
```

- [ ] **Step 4: Rebuild the Front card hierarchy around the shared copy**

In `FrontUI._operationHtml`, render the semantic label, summary, consequence, three phase names, reward, and an optional `<details class="front-details">` containing `damage`, `population`, and `restored`. Replace `btn-front-go` with two buttons:

```html
<button id="btn-front-together" class="btn btn-primary big">🤝 ПОЧАТИ РАЗОМ</button>
<button id="btn-front-solo" class="btn big">🎮 ГРАТИ СОЛО</button>
```

The co-op handler calls `prepareFrontTogether`; the solo handler calls `startFrontOperation`.

- [ ] **Step 5: Make the globe expose one primary rescue route**

Keep `#btn-front` as the dominant button but label it `Продовжити порятунок` and route its click to `game.continueRescue()`. Move the current solo, co-op, expedition, and other mode buttons into a native `<details id="globe-other">` titled `Інші операції`; do not duplicate their handlers.

Use `frontCountryCopy` in `_frontStatusLine()` so the tooltip reads state → summary → next action. On touch, country click opens the same Front card; no hover-only information remains.

- [ ] **Step 6: Add the pre-Front campaign fallback**

Implement `continueRescue()` so a profile with no unlocked Front opens the existing campaign country picker focused on `nextTarget(save.liberated)`. Once Front is unlocked, it selects `recommendedOperationId` and opens `FrontUI`. Do not invent a new onboarding overlay.

- [ ] **Step 7: Run UI checks at desktop and mobile sizes**

Run: `node test/globe-front.mjs && node test/living-front-browser.mjs`

Expected: PASS; the primary copy is actionable, raw numbers are secondary, and the same country card works at `1280x720` and `390x844`.

- [ ] **Step 8: Commit the country-decision slice**

```bash
git add src/ui/frontcopy.js src/ui/frontui.js src/globe.js src/main.js index.html styles.css test/globe-front.mjs test/living-front-browser.mjs
git commit -m "feat: make country consequences actionable"
```

---

### Task 4: Give the HUD one active objective and compact team feedback

**Files:**
- Modify: `src/missionpool.js:760-815`
- Modify: `src/story/storymissions.js:200-225,350-365`
- Modify: `src/hud.js:460-500`
- Modify: `styles.css:190-210,470-490,700-715`
- Test: `test/story-campaign2-browser.mjs`

**Interfaces:**
- Produces: every mission item returned by `getHudList()` may include `primary: boolean`.
- Consumes: HUD renders exactly one non-completed `primary` item as the main objective.
- Preserves: existing `{ icon, title, done }` fields for all current callers and tests.

- [ ] **Step 1: Add an assertion for a single visible active objective**

In `test/story-campaign2-browser.mjs`, after entering the first Ukraine story mission, assert:

```js
const visible = await page.locator('#missions .story-objective').count();
check(visible === 1, 'HUD renders exactly one primary objective');
const text = await page.locator('#missions').innerText();
const objective = 'Врятуй людей із хліва';
check(text.split(objective).length - 1 === 1, 'primary objective is not duplicated');
```

- [ ] **Step 2: Run the story browser check and confirm the duplicate**

Run: `node test/story-campaign2-browser.mjs`

Expected: FAIL because `currentStoryObjective()` and `getHudList()` both render the same active objective.

- [ ] **Step 3: Mark the primary objective at the mission source**

In `StoryMissions.getHudList()`, add `primary: obj.state === 'active'` to story objectives. In `DynamicMissions.getHudList()`, add `primary: m.state === 'active' && !m.optional`. Keep completed and optional items in the returned list.

- [ ] **Step 4: Render one source in HUD**

Remove the `currentStoryObjective()` rendering branch from `src/hud.js`. Use:

```js
const list = level.missions.getHudList();
const primary = list.find((mission) => mission.primary && !mission.done)
  || list.find((mission) => !mission.done);
let html = primary
  ? `<div class="story-objective"><span class="mi">${primary.icon}</span> ${primary.title}</div>`
  : '';
for (const mission of list) {
  if (mission === primary || (!mission.done && !mission.optional)) continue;
  if (mission.optional) html += renderCompactOptional(mission);
}
```

Keep the existing `secondaryObjective` chip as the single compact optional row. Do not display completed history during combat.

- [ ] **Step 5: Run the focused story check**

Run: `node test/story-campaign2-browser.mjs`

Expected: PASS with one active line, unchanged mission progression, and no duplicated barn-rescue text.

- [ ] **Step 6: Commit the HUD slice**

```bash
git add src/missionpool.js src/story/storymissions.js src/hud.js styles.css test/story-campaign2-browser.mjs
git commit -m "fix: show one active mission objective"
```

---

### Task 5: Make the prepared Front operation the center of the co-op lobby

**Files:**
- Modify: `src/net/coop.js:20-210,240-380,450-590`
- Modify: `src/net/frontsync.js:1-145`
- Modify: `src/ui/coopui.js:20-145,450-680`
- Modify: `src/main.js:2550-2590,4100-4145`
- Modify: `index.html:655-690`
- Modify: `styles.css` near lobby rules
- Test: `test/coop-worldfront.mjs`
- Test: `test/coop-roles.mjs`

**Interfaces:**
- Produces: sanitized roster entries include `ready: boolean`.
- Produces: `CoopSession.setMyReady(ready)` and host handler `_hostSetGuestReady(pid, ready)`.
- Produces: `CoopUI.openForFront()` prepares a room around the already active host Front operation.
- Consumes: `Game.prepareFrontTogether(operationId, specialist)` from Task 3.
- Preserves: guest rewards remain derived through `canonicalFrontRewards`; no reward amount is trusted from the wire.

- [ ] **Step 1: Extend co-op checks for ready state and host-owned world**

In `test/coop-roles.mjs`, assert sanitized roster readiness defaults to `false`, a guest `ready` intent updates only that guest, and changing country/mode resets all readiness. In `test/coop-worldfront.mjs`, assert the host cannot start the prepared operation until every current roster entry is ready, then both clients receive the same compact `fr` start spec.

- [ ] **Step 2: Run the focused co-op checks and confirm they fail**

Run: `node test/coop-roles.mjs && node test/coop-worldfront.mjs`

Expected: FAIL because roster readiness and the prepared Front lobby do not exist.

- [ ] **Step 3: Add sanitized ready state and one wire intent**

Add `ready: own(src, 'ready') === true` to `sanitizeRosterEntry`. Add:

```js
setMyReady(ready) {
  const mine = this.roster.get(this.myPid);
  if (!mine) return;
  mine.ready = ready === true;
  if (this.role === 'host') this._broadcastRoster();
  else this.transport.send(1, { t: 'ready', ready: mine.ready }, true);
  if (this.onRoster) this.onRoster();
}
```

Handle `ready` only from known guest pids, clamp to boolean, and broadcast the sanitized roster. For ordinary modes, reset every entry to `false` when mode/country selection changes or a level ends. For Front, readiness covers the whole prepared operation: preserve it across phase checkpoints and reconnects, and reset it only when the selected operation changes, the roster changes, or the operation reaches a terminal result.

- [ ] **Step 4: Prepare Front before opening co-op**

`Game.prepareFrontTogether(operationId, specialist)` applies `START_OPERATION` if needed, closes Front UI, and calls `this.coop.openForFront()`. `CoopUI.openForFront()` stores only a transient boolean, opens the current co-op entry flow, and after room creation sets `session.mode = 'front'` and calls `session.syncFront(game.save.front)`.

Do not copy the host snapshot into guest saves. The existing `frontRun` session snapshot remains the guest's read-only lobby/level source.

- [ ] **Step 5: Render the prepared operation and ready controls**

Add `#btn-lobby-ready` and `#lobby-front-summary` to `index.html`. In `_renderLobby()`, show the host world owner, country state, current phase, and objective when `s.mode === 'front'`. Render a ready marker beside each player. Disable `#btn-lobby-start` unless the host sees every current roster entry ready.

The start handler uses `frontStageConfig(session.frontSnapshot())` and calls `session.startFrontStage(...)`; ordinary modes still call `session.startLevel()`.

- [ ] **Step 6: Keep continuation host-controlled and reconnect-safe**

When Task 2 requests `continue` or `retry`, the host ends the old level, reuses the updated `frontRun`, and starts the next phase for the same ready roster without reopening the globe or asking everyone to ready again. Guests show `Чекаємо на хоста` during the checkpoint and never apply a local country transition.

If a guest disconnects, remove them from the active roster and readiness quorum immediately. Existing host play continues; a reconnect receives the latest `frun` and current `fr` checkpoint and returns directly to the current phase. Readiness is not rechecked during an active operation.

- [ ] **Step 7: Run focused co-op checks**

Run: `node test/coop-roles.mjs && node test/coop-worldfront.mjs && node test/coop-reconnect-guard.mjs`

Expected: PASS; all players ready before start, guests receive canonical Front state, reconnect restores the checkpoint, and host progress survives a disconnect.

- [ ] **Step 8: Commit the co-op slice**

```bash
git add src/net/coop.js src/net/frontsync.js src/ui/coopui.js src/main.js index.html styles.css test/coop-worldfront.mjs test/coop-roles.mjs
git commit -m "feat: center co-op lobby on Front operations"
```

---

### Task 6: Make destruction, rebuilding, and combat pressure visibly different

**Files:**
- Modify: `src/main.js:2600-2908,3985-4010`
- Modify: `src/worldevents.js:1-170`
- Modify: `src/ui/frontui.js` operation phase copy
- Modify: `src/missionpool.js:1327-1710`
- Test: `test/living-front-browser.mjs`
- Test: `test/worldevents.mjs`

**Interfaces:**
- Consumes: five-state `frontCountryState` and existing `_addFrontDamage`, `_addFrontOutpost`, `_addFrontEvacuees`, `_enterFrontPhase` helpers.
- Produces: each state has a distinct scene composition using existing meshes, citizens, lights, debris, and banners.
- Preserves: existing `encounterPlan()` determinism and the current draw-call budget.

- [ ] **Step 1: Add visible-state and telegraph assertions**

Extend `test/living-front-browser.mjs` to build attacked, destroyed, rebuilding, and saved states and assert monotonic rubble/citizen/outpost changes. Extend `test/worldevents.mjs` to assert every spike exposes either `elite` or a commander with declared mechanics before runtime spawn.

- [ ] **Step 2: Run both focused checks and record the expected gaps**

Run: `node test/living-front-browser.mjs && node --test test/worldevents.mjs`

Expected: the existing deterministic encounter test passes; the new visible-state assertions fail where saved/rebuilding presentation is not distinct enough.

- [ ] **Step 3: Map semantic states to existing world pieces**

In `_buildLevel`, derive presentation from `level.frontCountryState.state`:

```js
const state = level.frontCountryState && level.frontCountryState.state;
if (state === 'attacked' || state === 'destroyed') this._addFrontDamage(level, level.frontCountryState.damage);
if (state === 'rebuilding' || state === 'saved') this._addFrontOutpost(level, level.frontCountryState.restored);
if (state === 'destroyed') this._addFrontEvacuees(level);
```

Use the existing living-city citizens: attacked has fewer residents and more guards; destroyed has evacuees; rebuilding has builders; saved has the tier-3 outpost and full resident cap. Do not add a model or texture.

- [ ] **Step 4: Strengthen pre-spawn warnings without adding another enemy system**

Keep the existing quiet/pressure/spike/reward director. Before commander or elite spawn, show the existing high-priority banner and horde audio for two seconds, then spawn through the current authority-only path. The warning copy names the behavior already declared by `COMMANDERS` (`charger`, `summon`, `shield`, `invisible`) instead of exposing internal ids.

- [ ] **Step 5: Surface existing teamwork instead of rewriting mission interactions**

The mission engine already multiplies repair, rescue, nest, activation, and ship progress by the number of nearby `holdE` players. Add a compact `Разом швидше ×{n}` suffix only in those existing prompt branches when `holders > 1`; do not create a second progress system.

- [ ] **Step 6: Run visual/domain checks**

Run: `node test/living-front-browser.mjs && node --test test/worldevents.mjs`

Expected: PASS; state presentation is distinct, warnings precede spikes, co-op progress remains host-owned, and draw calls stay within the current Front allowance.

- [ ] **Step 7: Commit the gameplay-feedback slice**

```bash
git add src/main.js src/worldevents.js src/ui/frontui.js src/missionpool.js test/living-front-browser.mjs test/worldevents.mjs
git commit -m "feat: show destruction and teamwork consequences"
```

---

### Task 7: Finish responsive, accessible, and translated UI polish

**Files:**
- Modify: `index.html` new/changed labels and ARIA relationships
- Modify: `styles.css` globe, Front card, result, lobby, mobile rules
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Test: `test/mobile-a11y.mjs`
- Test: `test/i18n-parity.mjs`

**Interfaces:**
- Consumes: final DOM ids from Tasks 2, 3, and 5.
- Produces: keyboard/touch access to primary globe action, country cards, result decisions, readiness, and mobile bottom-sheet layout.

- [ ] **Step 1: Extend accessibility checks around the new core flow**

In `test/mobile-a11y.mjs`, assert all new buttons have at least `44x44` CSS pixels, dialogs have `role="dialog"`, `aria-modal="true"`, and labelled headings, focus moves into and back out of Front/result/lobby dialogs, and no content relies on hover at `390x844`.

- [ ] **Step 2: Run mobile and translation checks to expose missing work**

Run: `node test/mobile-a11y.mjs && node test/i18n-parity.mjs`

Expected: FAIL for untranslated new copy and incomplete result/lobby dialog semantics.

- [ ] **Step 3: Apply the approved responsive hierarchy**

At desktop widths, keep globe and card side-by-side. At `max-width: 700px`, make `.front-card` a bottom sheet with `max-height: 72dvh`, sticky action row, visible scroll affordance, and safe-area padding:

```css
@media (max-width: 700px) {
  .front-card { width: 100%; max-height: 72dvh; border-radius: 22px 22px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
  .front-actions { position: sticky; bottom: 0; background: rgba(18, 30, 46, 0.96); }
  #globe-other summary, .front-actions .btn, #btn-lobby-ready { min-height: 44px; }
}
```

Use existing CSS variables and panel classes; do not add a new visual theme.

- [ ] **Step 4: Complete keyboard and focus behavior**

Use real buttons and native `<details>` controls. When a dialog opens, focus its heading/close or primary action; `Escape` closes only non-terminal dialogs; returning from a dialog restores the triggering control. Result decisions require an explicit button and cannot close by clicking the backdrop.

- [ ] **Step 5: Add exact English and Russian translations**

Add every new Ukrainian `t()` key from `frontcopy.js`, Front result, readiness, and the grouped globe menu to both dictionaries. Keep placeholders identical (`{country}`, `{people}`, `{n}`) and do not translate ids.

- [ ] **Step 6: Run accessibility and i18n checks**

Run: `node test/mobile-a11y.mjs && node test/i18n-parity.mjs`

Expected: PASS with no missing keys, touch targets below 44px, hover-only content, or inaccessible modal controls.

- [ ] **Step 7: Commit the polish slice**

```bash
git add index.html styles.css src/i18n/en.js src/i18n/ru.js test/mobile-a11y.mjs test/i18n-parity.mjs
git commit -m "feat: polish rescue flow across mobile and languages"
```

---

### Task 8: Integrate release metadata and perform the approved final validation

**Files:**
- Modify: `src/main.js:131-133`
- Modify: `src/net/protocol.js:4-6`
- Modify: `version.json`
- Modify: `sw.js:4` and ensure `src/ui/frontcopy.js` is in `SHELL`
- Modify: `README.md` version/current-loop section
- Modify: `CHANGELOG.md` top entry
- Test: `test/version-sync.mjs`
- Test: `test/pwa-offline.mjs`

**Interfaces:**
- Consumes: all completed slices.
- Produces: one installable v600 build with protocol 22 and current documentation.

- [ ] **Step 1: Update the PWA shell assertion first**

In `test/pwa-offline.mjs`, import `readFileSync`, read `sw.js`, and add this assertion immediately after `check` is initialized and before `page.goto`:

```js
const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
check(swSource.includes("'./src/ui/frontcopy.js'"), 'Front copy module is cached for offline play');
```

`test/version-sync.mjs` reads all version numbers dynamically, so do not add a duplicated version literal there.

- [ ] **Step 2: Run version/PWA checks and confirm the new shell assertion fails**

Run: `node test/version-sync.mjs && node test/pwa-offline.mjs`

Expected: `test/version-sync.mjs` still passes with synchronized v549 metadata; `test/pwa-offline.mjs` fails because the new copy module is not yet in `SHELL`.

- [ ] **Step 3: Bump the release exactly once**

Apply these final values:

```js
// src/main.js
const APP_VERSION = 600;

// src/net/protocol.js
export const PROTO_VERSION = 22; // v600: lobby readiness and continuous Front checkpoints

// sw.js
const CACHE = 'zr-cache-v600';
```

Set `version.json` to `{ "v": 600 }` and add `./src/ui/frontcopy.js` to the service-worker shell.

- [ ] **Step 4: Update player-facing documentation**

Add a v600 changelog entry covering one rescue CTA, reversible destruction, continuous Front operations, equal co-op play, one HUD objective, mobile polish, and removal of offline attacks. Update README's current version and core loop; do not rewrite unrelated historical docs.

- [ ] **Step 5: Run targeted automated validation**

Run:

```bash
node --test test/worldfront-unit.mjs test/worldevents.mjs
node test/globe-front.mjs
node test/worldfront-browser.mjs
node test/living-front-browser.mjs
node test/story-campaign2-browser.mjs
node test/coop-roles.mjs
node test/coop-worldfront.mjs
node test/coop-reconnect-guard.mjs
node test/mobile-a11y.mjs
node test/i18n-parity.mjs
node test/version-sync.mjs
node test/pwa-offline.mjs
```

Expected: every command exits `0`; no full new test suite is introduced.

- [ ] **Step 6: Perform manual desktop and mobile playtests**

Run `npm run serve`, then use the in-app Browser only. Verify at `1280x720` and `390x844`:

1. first-time campaign fallback;
2. one dominant `Продовжити порятунок` CTA;
3. all five country states and human consequence copy;
4. one complete three-phase solo operation;
5. retry and explicit terminal defeat;
6. no change after simulating a later calendar day;
7. two-player room readiness, full operation, disconnect, reconnect, and guest reward;
8. one HUD objective and contextual interaction prompt;
9. result before/after state and next rescue action;
10. a short no-coaching playtest with the child, recording only observed confusion.

Expected: each flow completes without a blocker, duplicated objective, hover-only instruction, permanent loss, or guest-save overwrite.

- [ ] **Step 7: Commit the final release integration**

```bash
git add src/main.js src/net/protocol.js version.json sw.js README.md CHANGELOG.md test/version-sync.mjs test/pwa-offline.mjs
git commit -m "release: ship Return the World v600"
```

- [ ] **Step 8: Stop before publishing**

Do not push, deploy, create a PR, or publish v600 unless the user separately authorizes that external action after reviewing the completed implementation.
