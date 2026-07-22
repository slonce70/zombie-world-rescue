# Spain Continuous Operation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chain all three destroyed-Spain phases and show victory only after fireworks.

**Architecture:** Keep the existing `COMPLETE_STAGE` transitions. In `_finishFrontStage()`, bypass the generic checkpoint overlay only for won, non-terminal Spain recovery stages and reuse `endLevel()`'s existing `continue` action to start the next phase.

**Tech Stack:** JavaScript, existing Front state machine and browser runtime.

## Global Constraints

- Do not change ordinary Spain campaign completion.
- Do not change other Front operations or failure screens.
- Do not add local automated tests; verify in the in-app browser as requested.

---

### Task 1: Chain Spain phases

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `_finishFrontStage(won)`, `level.operation.missionPreset`, `_frontNextAction`, and `endLevel()`.
- Produces: automatic continuation for non-terminal `spain-*` stages.

- [ ] **Step 1: Record the failing browser state**

Complete stage 0 and confirm the Front state advances to stage 1 while `overlay-front-result` still shows `✅ ЕТАП ПРОЙДЕНО!`.

- [ ] **Step 2: Skip only the Spain checkpoint overlay**

After applying and synchronizing the Front transition, detect a won, non-terminal Spain preset. Set `_frontNextAction = 'continue'` and schedule `endLevel()` for the current level instead of calling `_showFrontResult()`.

- [ ] **Step 3: Verify all three outcomes**

Confirm stages 0 and 1 start the next presets without the result overlay. Confirm stage 2 still completes the operation and shows the final result.

### Task 2: Release v604

**Files:**
- Modify: `src/main.js`
- Modify: `sw.js`
- Modify: `version.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the existing three-file version contract.
- Produces: live GitHub Pages version `604`.

- [ ] **Step 1: Bump version values to 604**

Set `APP_VERSION`, the service-worker cache suffix, and `version.json` to `604`, then add the changelog entry.

- [ ] **Step 2: Publish and verify**

Commit, push, merge the PR, wait for Pages, and confirm live `version.json` is `{ "v": 604 }`.
