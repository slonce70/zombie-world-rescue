# Living World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a campaign-only Living World event layer that makes repeated missions more surprising without adding a new mode.

**Architecture:** Put event selection and reward rules in a small pure module, then have `DynamicMissions` trigger and update one live event after mission completion. Rendering stays minimal: existing beams, pickups, zombies, toasts, and banners.

**Tech Stack:** Browser JavaScript modules, Three.js runtime already in the game, Node-based tests.

---

### Task 1: Event Rules

**Files:**
- Create: `src/livingworld.js`
- Test: `test/livingworld.mjs`

- [ ] Write a failing test that proves event selection is deterministic, skips early tutorial Ukraine, and scales rewards.
- [ ] Implement the smallest pure rule module to pass it.
- [ ] Run `node test/livingworld.mjs`.

### Task 2: Campaign Integration

**Files:**
- Modify: `src/missionpool.js`
- Modify: `src/main.js`
- Modify: `README.md`

- [ ] Trigger at most one live event after a mission completes in campaign runs.
- [ ] Update the active event each frame and grant existing coins/XP on completion.
- [ ] Bump version text and runtime version to v242.
- [ ] Run `node test/livingworld.mjs` and `npm run test:quick-release`.

### Task 3: Ship Check

**Files:**
- Modify: `version.json`
- Modify: `sw.js`

- [ ] Run `python3 /Users/trend/.codex/tools/codex-setup-toolkit/bin/codex_setup_toolkit.py vlad-gate --path /Users/trend/Documents/Владос/claude --json`.
- [ ] Run a browser smoke check.
- [ ] Commit, push `main`, and verify deployed `version.json`.
