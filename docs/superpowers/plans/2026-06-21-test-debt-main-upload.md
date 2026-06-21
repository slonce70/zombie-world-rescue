# Test Debt Cleanup And Main Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the v65-v68 audit actionable by fixing stale/flaky tests, verifying the game and prod relay, then committing and pushing the clean result to `main`.

**Architecture:** Do not change runtime gameplay unless a failing test proves a real bug. The audit showed the game works; the cheapest correct fix is to align old tests with current contracts and replace wall-clock waits with deterministic simulation checks. Keep changes in existing test files only, plus this plan.

**Tech Stack:** Vanilla JS browser game, Playwright tests, local static server on `127.0.0.1:8741`, Cloudflare Worker relay via `worker/`, Git `main`.

---

## File Structure

- Modify: `test/update8.mjs` - campaign order assertion should expect `ESP` after `FRA`.
- Modify: `test/update9.mjs` - turret purchase assertion should expect the current gadget price `1000`.
- Modify: `test/update10.mjs` - campaign click should assert the inline country list, not immediate overlay close.
- Modify: `test/update2.mjs` - mobile joystick test should wait for game simulation progress or assert live touch velocity, not raw wall-clock distance.
- Modify: `test/update4.mjs` - scooter acceleration should drive `player.update()` directly like `test/update5.mjs`.
- Modify: `test/maps.mjs` - soccer ball test should wait until movement occurs, not sleep exactly `1500ms`.
- Keep: `src/**`, `worker/**`, `relay/**` - no runtime change planned.

## Task 1: Review And Keep Existing Stale-Test Fixes

**Files:**
- Review: `test/update8.mjs:166-179`
- Review: `test/update9.mjs:36-47`
- Review: `test/update10.mjs:51-57`

- [ ] **Step 1: Confirm update8 expects the current campaign order**

Expected code in `test/update8.mjs`:

```js
// після UKR->POL->DEU->FRA наступна незвільнена в CAMPAIGN_ORDER - Іспанія (далі ITA->TUR->SWE->EGY)
check(target === 'ESP', `після Франції ціль - Іспанія (${target})`);
```

- [ ] **Step 2: Confirm update9 expects the current gadget price**

Expected code in `test/update9.mjs`:

```js
g.test.giveCoins(1000);
const before = g.save.coins;
g.test.shopBuy('turret');
return {
  owned: g.save.gadgetsOwned.includes('turret'),
  spent: before - g.save.coins,
};
});
check(shopT.owned && shopT.spent === 1000, `купується в магазині за 1000₴ (витрачено ${shopT.spent})`);
```

- [ ] **Step 3: Confirm update10 expects inline country selection**

Expected code in `test/update10.mjs`:

```js
await page.click('.solo-mode[data-mode="campaign"]');
// новий флоу: країну обирають ІНЛАЙН у меню (не закриваючи його, не йдучи на глобус)
await page.waitForSelector('#country-list .country-item', { timeout: 10000 });
const campCountries = await page.evaluate(() =>
  document.querySelectorAll('#country-list .country-item').length);
check('Кампанія -> інлайн-список країн у меню', campCountries >= 8, `${campCountries}`);
await page.evaluate(() => window.__game._hideOverlay('overlay-solo'));
```

- [ ] **Step 4: Run the three stale-test checks**

Run:

```bash
SLOW=4 node test/update8.mjs
SLOW=4 node test/update9.mjs
SLOW=4 node test/update10.mjs
```

Expected: all three exit `0` with no real console errors.

- [ ] **Step 5: Commit only if this task is isolated**

If doing small commits:

```bash
git add test/update8.mjs test/update9.mjs test/update10.mjs
git commit -m "test: align legacy update checks with current game flow"
```

If batching all test debt into one commit, skip this commit and stage in Task 5.

## Task 2: Make Touch Movement Test Deterministic Enough

**Files:**
- Modify: `test/update2.mjs:238-260`

- [ ] **Step 1: Replace the fixed 5-second sleep block**

Replace:

```js
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const canvas = window.__game.renderer.domElement;
  const t = new Touch({ identifier: 1, target: canvas, clientX: 200, clientY: 540 });
  canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true, cancelable: true }));
});
const posAfter = await page.evaluate(() => ({ x: window.__game.level.player.pos.x, z: window.__game.level.player.pos.z }));
const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z);
check(moved > 2, `джойстик рухає гравця (${moved.toFixed(1)} м)`);
```

With:

```js
const touchMoveOk = await waitFor(async () => {
  return page.evaluate((before) => {
    const g = window.__game;
    const p = g.level.player;
    const moved = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    window.__touchMoveState = {
      moved,
      speed,
      simTime: g.level.stats.time,
      touchMove: !!g.input.touchMove,
      touchSprint: !!g.input.touchSprint,
    };
    return moved > 2 || (window.__touchMoveState.touchMove && window.__touchMoveState.touchSprint && speed > 1);
  }, posBefore);
}, 10000, 'джойстик рухає або дає швидкість');
await page.evaluate(() => {
  const canvas = window.__game.renderer.domElement;
  const t = new Touch({ identifier: 1, target: canvas, clientX: 200, clientY: 540 });
  canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true, cancelable: true }));
});
const touchState = await page.evaluate(() => window.__touchMoveState || { moved: 0, speed: 0, touchMove: false, touchSprint: false });
check(touchMoveOk, `джойстик активний (move ${touchState.moved.toFixed(1)} м, speed ${touchState.speed.toFixed(1)} м/с)`);
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
SLOW=4 node test/update2.mjs
```

Expected: mobile joystick and fire button both pass; no real console errors.

## Task 3: Make update4 Scooter Acceleration Deterministic

**Files:**
- Modify: `test/update4.mjs:238-253`

- [ ] **Step 1: Replace wall-clock scooter acceleration**

Replace the current `rideRes` evaluate block with:

```js
const rideRes = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.mountScooter(0);
  const riding = !!p.riding;
  const tp = !p.firstPerson;
  const drive = (n) => { for (let i = 0; i < n; i++) p.update(0.05, g.input, true); };
  g.test.key('KeyW', true);
  drive(60);
  g.test.key('KeyW', false);
  const accelerated = p.rideSpeed >= 4;
  g.test.dismountScooter();
  return { riding, tp, accelerated, dismounted: !p.riding, speed: p.rideSpeed };
});
```

Keep the existing checks, but make the acceleration message show the measured speed:

```js
check(rideRes.accelerated, `самокат розганяється газом (W, ${rideRes.speed.toFixed(1)} м/с)`);
```

- [ ] **Step 2: Run the focused test twice**

Run:

```bash
SLOW=4 node test/update4.mjs
SLOW=4 node test/update4.mjs
```

Expected: both runs exit `0`. Running twice is intentional because this test was previously flaky.

## Task 4: Make maps Soccer Ball Check Wait For Movement

**Files:**
- Modify: `test/maps.mjs:169-184`

- [ ] **Step 1: Replace fixed sleep with polling**

Replace:

```js
await page.waitForTimeout(1500);
const ballAfter = await page.evaluate(() => {
  const b = window.__game.level.effects.ball.mesh.position;
  return { x: b.x, z: b.z };
});
const ballDist = Math.hypot(ballAfter.x - ballMoved.x, ballAfter.z - ballMoved.z);
check(ballDist > 1.5, `м'яч покотився від удару (${ballDist.toFixed(1)} м)`);
```

With:

```js
let ballDist = 0;
await waitFor(async () => {
  const ballAfter = await page.evaluate(() => {
    const b = window.__game.level.effects.ball.mesh.position;
    return { x: b.x, z: b.z };
  });
  ballDist = Math.hypot(ballAfter.x - ballMoved.x, ballAfter.z - ballMoved.z);
  return ballDist > 1.5;
}, 10000, 'мʼяч покотився');
check(ballDist > 1.5, `м'яч покотився від удару (${ballDist.toFixed(1)} м)`);
```

- [ ] **Step 2: Run the focused test twice**

Run:

```bash
SLOW=4 node test/maps.mjs
SLOW=4 node test/maps.mjs
```

Expected: both runs exit `0`; no real console errors.

## Task 5: Full Verification, Commit, Push Main, Deploy Check

**Files:**
- Stage: `test/update2.mjs`
- Stage: `test/update4.mjs`
- Stage: `test/maps.mjs`
- Stage if still dirty: `test/update8.mjs`
- Stage if still dirty: `test/update9.mjs`
- Stage if still dirty: `test/update10.mjs`
- Stage: `docs/superpowers/plans/2026-06-21-test-debt-main-upload.md`

- [ ] **Step 1: Start or confirm local static server**

Run:

```bash
curl -fsS http://127.0.0.1:8741/version.json
```

Expected: JSON with `"v":68`.

If the server is not running, start the smallest existing server command used by the repo, then rerun the curl. Do not kill unrelated processes on `8741`.

- [ ] **Step 2: Run blocking checks**

Run:

```bash
set -e
node test/version-sync.mjs
SLOW=4 node test/relay-reconnect.mjs
node test/smoke.mjs
node test/version-check.mjs
SLOW=4 node test/cloudsave.mjs
node test/i18n.mjs
node test/coop-damage.mjs
node test/coop-nick.mjs
node test/save-migration.mjs
```

Expected: every command exits `0`.

- [ ] **Step 3: Run changed and previously flaky tests**

Run:

```bash
set -e
SLOW=4 node test/update2.mjs
SLOW=4 node test/update4.mjs
SLOW=4 node test/update5.mjs
SLOW=4 node test/update8.mjs
SLOW=4 node test/update9.mjs
SLOW=4 node test/update10.mjs
SLOW=4 node test/maps.mjs
SLOW=4 node test/maps.mjs
```

Expected: every command exits `0`.

- [ ] **Step 4: Run release-feature checks**

Run:

```bash
set -e
for t in living-hq skins-v66 lobby-today gadget-watchtower campaign flows replay terrain-geometry; do
  SLOW=4 node "test/$t.mjs"
done
```

Expected: every command exits `0`.

- [ ] **Step 5: Verify prod relay health**

Run:

```bash
node test/lobby-today.mjs
curl -fsS https://zr-relay.slonce70.workers.dev/lobby/state
```

Expected: `lobby-today` exits `0`; curl returns JSON containing `online`, `today`, `players`, and `rooms`.

- [ ] **Step 6: Browser smoke**

Manual or browser-agent path:

1. Open `http://127.0.0.1:8741/?fresh&audit=final`.
2. Click `🤝 ГРАТИ РАЗОМ`.
3. Enter nick `Audit`.
4. Confirm coop panel shows numeric `Онлайн` and `Сьогодні грали`.
5. Close coop.
6. Click `☰ Меню` -> `🎖️ Штаб` -> `🏠 Увійти в Живий Штаб`.
7. Confirm `🌍 На глобус` and `🎯 Мішені` are visible.
8. Click `🌍 На глобус`.
9. Confirm browser console has no `error` logs.

- [ ] **Step 7: Inspect final diff**

Run:

```bash
git diff -- test/update2.mjs test/update4.mjs test/maps.mjs test/update8.mjs test/update9.mjs test/update10.mjs docs/superpowers/plans/2026-06-21-test-debt-main-upload.md
git status --short --branch
```

Expected: only planned test/doc files are modified or untracked. No `src/**`, `worker/**`, or secret/config files are staged.

- [ ] **Step 8: Commit**

Run:

```bash
git add test/update2.mjs test/update4.mjs test/maps.mjs test/update8.mjs test/update9.mjs test/update10.mjs docs/superpowers/plans/2026-06-21-test-debt-main-upload.md
git commit -m "test: stabilize post-release audit suite"
```

Expected: commit succeeds.

- [ ] **Step 9: Push to main**

Run:

```bash
git pull --ff-only origin main
git push origin main
```

Expected: pull is already up to date or fast-forwards cleanly; push succeeds.

- [ ] **Step 10: Post-push health**

Run:

```bash
git status --short --branch
curl -fsS https://zr-relay.slonce70.workers.dev/lobby/state
```

Expected: branch is `main...origin/main` with no uncommitted planned files; prod relay returns JSON.

## Self-Review

- Spec coverage: fixes stale test assertions, stabilizes flaky checks, verifies browser/prod relay, then uploads to `main`.
- Placeholder scan: no `TBD`, no generic "write tests"; every changed block has exact code or command.
- Runtime safety: no gameplay code changes planned because the audit did not prove a runtime defect.
