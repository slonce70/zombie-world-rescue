# Staged Project Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitHub issues #5-#14 as small, testable improvements without adding new gameplay systems.

**Architecture:** Player-facing guidance lands first: recommended next action, clickable Base hints, and mission previews. Risk controls stay narrow: accessibility labels, save-progress drift guard, coop reconnect guard, compact release subgate, SaveVault throttling coverage, and a light offline smoke expansion.

**Tech Stack:** Plain browser JavaScript modules, Three.js, Playwright-based `.mjs` tests, GitHub issues as backlog.

---

### Task 1: Player Compass, HQ Hints, Mission Preview

**Files:**
- Modify: `src/main.js`
- Modify: `src/hqbase.js`
- Modify: `src/missionpool.js`
- Modify/Test: `test/living-hq.mjs`, focused menu/mission test if needed

- [ ] Add a minimal helper that decides one recommended next action from the current save.
- [ ] Show that action in Play/HQ without hiding existing tabs.
- [ ] Reuse `rollMissionSet(countryId, seed, runIndex)` for country mission preview.
- [ ] Add click hints to existing HQ trophy objects, keeping target/dummy clicks unchanged.
- [ ] Verify with focused browser tests and `npm test`.

### Task 2: Mobile, A11y, PWA Polish

**Files:**
- Modify: `index.html`
- Modify: `src/touch.js`
- Modify: `src/main.js` only if the touch globe hint is already set there
- Modify: `manifest.json`
- Test: existing mobile/i18n/PWA tests or a small focused assertion

- [ ] Add live-region semantics for toasts/banner feedback without visual layout changes.
- [ ] Make touch globe hint use touch wording.
- [ ] Add explicit weapon wheel labels and close/focus sanity.
- [ ] Refresh stale manifest text.
- [ ] Verify with `node test/version-sync.mjs`, `node test/sw-cache.mjs`, and focused mobile/i18n checks.

### Task 3: Save Progress Drift Guard

**Files:**
- Modify: `test/cloudsave.mjs` or add one tiny focused test
- Modify: `src/net/cloudsave.js` only if the guard needs a named manifest

- [ ] Add a failing test for an untracked permanent save field.
- [ ] Add the smallest explicit manifest/allowlist that makes drift visible.
- [ ] Keep fresh saves empty and existing permanent categories recognized.
- [ ] Verify with `node test/cloudsave.mjs` and `node test/save-migration.mjs`.

### Task 4: Coop Reconnect and Release Subgate

**Files:**
- Modify: `src/net/coop.js`
- Modify/Add: focused reconnect test
- Modify: `package.json`
- Modify: `README.md`

- [ ] Add a failing regression for guest reconnect pid mismatch.
- [ ] Fail closed when guest resume returns a different pid.
- [ ] Add a minimal `test:coop-release` script and document when to run it.
- [ ] Verify with reconnect/coop focused tests.

### Task 5: SaveVault Throttling and Offline Smoke

**Files:**
- Modify: `relay/dev-relay.mjs` or focused test harness only
- Modify: `src/ui/saveui.js` or `src/net/cloudsave.js` only if status is misleading
- Modify: `test/cloudsave.mjs`
- Modify: `test/pwa-offline.mjs`

- [ ] Model throttled save push in the dev/test path.
- [ ] Keep cloud save fail-soft and UI status honest.
- [ ] Extend offline smoke to open one key UI surface and start one country level.
- [ ] Verify with cloudsave, sw-cache, and pwa-offline tests.

### Task 6: Small Solo Mode Registry

**Files:**
- Modify: `src/main.js`
- Add/Modify: one focused static/menu routing test if needed

- [ ] Introduce a tiny `SOLO_MODES` registry for existing mode metadata.
- [ ] Use it to reduce duplicated menu/click routing without moving mode implementations.
- [ ] Keep retry and unlock behavior unchanged.
- [ ] Verify existing special-mode tests still pass.

