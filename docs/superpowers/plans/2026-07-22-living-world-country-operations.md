# Living World Country Operations Implementation Plan

> **For agentic workers:** Execute inline in this task; do not dispatch subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship country-specific continuous Living Front operations for Poland and Germany.

**Architecture:** Reuse the existing three-stage Front reducer and DynamicMissions engines. Country configuration selects stage presets, while the existing claim reducer owns all persistent rebuilding changes.

**Tech Stack:** JavaScript ES modules, Three.js runtime, GitHub Pages PWA.

## Global Constraints

- Do not add another game mode or save schema.
- Preserve reversible destruction and host-authoritative co-op.
- Do not manually run automated or browser test suites.

---

### Task 1: Country operation routing

**Files:** `src/worldfront.js`, `src/main.js`, `src/ui/frontui.js`

- [x] Add fixed Poland and Germany stage lists to `operationStages`.
- [x] Map those presets to the existing `bonfire`, `repair`, `rescue`, and `convoy` mission types.
- [x] Add Ukrainian player-facing stage labels.

### Task 2: Continuous HUD and commanders

**Files:** `src/missionpool.js`, `src/main.js`, `src/worldevents.js`

- [x] Render all three stages for Poland and Germany using the existing mission HUD fields.
- [x] Continue checkpoints automatically for the three country-specific operations.
- [x] Select the Ice Pursuer for Poland and Iron Baron for Germany through the existing commander plan.

### Task 3: Release

**Files:** `src/main.js`, `version.json`, `sw.js`, `CHANGELOG.md`

- [x] Bump all release identifiers to v606 and document the update.
- [x] Run ES-module syntax, diff, and version synchronization checks.
- [ ] Commit, push, merge a pull request, wait for Pages, and verify live v606.
