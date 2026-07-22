# Spain Tools Objective Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point destroyed-Spain navigation at usable tools and combine the three Music Center substeps into one HUD objective.

**Architecture:** Reuse `DynamicMissions._beamTarget()` as the single source of truth for rebuild navigation. Reshape only the Spain-specific HUD projection; keep mission phases and pickup mechanics unchanged.

**Tech Stack:** JavaScript, Three.js, existing HUD and browser runtime.

## Global Constraints

- Do not add dependencies or a second pickup system.
- Do not add or run local automated tests; validate in the in-app browser as requested by the owner.
- Keep ordinary campaign missions unchanged.

---

### Task 1: Rebuild navigation and HUD grouping

**Files:**
- Modify: `src/missionpool.js`
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`

**Interfaces:**
- Consumes: `DynamicMissions._beamTarget(mission)` and the current `mission.phase`.
- Produces: `getMarkers()` pointing at the current rebuild target and a four-row Spain Front HUD list.

- [ ] **Step 1: Record the failing browser state**

Inspect `getMarkers()[0]` and `mission.tools.find(item => !item.taken)` during `phase === 'tools'`.

Expected before the fix: their coordinates differ.

- [ ] **Step 2: Route rebuild markers through the existing target selector**

Add a `rebuild` branch in `getMarkers()` before the generic `m.points` branch. Use `_beamTarget(m)` and select the icon from the current phase or target kind.

- [ ] **Step 3: Group the HUD objectives**

Change the Spain stage mapping to four indices: musicians `0`, Music Center recovery `1`, village `2`, fireworks `3`. Replace the three separate tool/resource/build rows with one translated Music Center row while retaining the active `m.title` progress text.

- [ ] **Step 4: Verify in the in-app browser**

Expected after the fix: marker and next-tool coordinates match; pressing `E` marks the tool taken and adds it to `player.weapons`; `getHudList()` returns four rows.

### Task 2: Release v603

**Files:**
- Modify: `src/main.js`
- Modify: `sw.js`
- Modify: `version.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the existing three-file version contract.
- Produces: live GitHub Pages version `603`.

- [ ] **Step 1: Bump all version values to 603**

Set `APP_VERSION`, the service-worker cache suffix, and `version.json` to `603`, then add the changelog entry.

- [ ] **Step 2: Publish and verify**

Commit, push, open and merge a PR, wait for Pages deployment, then fetch the live cache-busted `version.json` and confirm `{ "v": 603 }`.
