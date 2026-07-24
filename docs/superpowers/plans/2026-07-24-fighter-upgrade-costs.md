# Fighter Upgrade Costs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared level 2–5 upgrade prices for all Expedition fighters.

**Architecture:** Keep `FIGHTER_UPGRADE_COSTS` as the single source used by purchase logic and the fighter profile UI. Update its unit and browser assertions; do not add per-fighter pricing, migrations, or new save fields.

**Tech Stack:** JavaScript ES modules, Node test runner, Playwright browser test.

## Global Constraints

- Level 1 remains free.
- Level 2 costs 1000 coins.
- Level 3 costs 2000 coins and 5 crystals.
- Level 4 costs 2500 coins and 13 crystals.
- Level 5 costs 3000 coins and 15 crystals.
- Prices are shared by all five fighters.
- Existing levels and balances are not recalculated or refunded.

---

### Task 1: Replace and verify the shared price table

**Files:**
- Modify: `test/specialists.mjs`
- Modify: `test/fighter-progression-browser.mjs`
- Modify: `src/specialists.js`

**Interfaces:**
- Consumes: `buyFighterLevel(state, id)` and `FIGHTER_UPGRADE_COSTS`.
- Produces: the same interfaces with the new shared prices.

- [ ] **Step 1: Write failing unit and browser assertions**

Change the expected table and level-2 purchase checks to:

```js
assert.deepEqual(FIGHTER_UPGRADE_COSTS, {
  2: { coins: 1000, crystals: 0 },
  3: { coins: 2000, crystals: 5 },
  4: { coins: 2500, crystals: 13 },
  5: { coins: 3000, crystals: 15 },
});

const bought = buyFighterLevel({ fighterLevels: {}, coins: 1000, crystals: 0 }, 'guard');
assert.equal(bought.coins, 0);
assert.equal(buyFighterLevel({
  fighterLevels: { guard: 2 }, coins: 2000, crystals: 4,
}, 'guard').reason, 'crystals');
```

In `test/fighter-progression-browser.mjs`, require the level-2 button to contain
`1000`, set the balance to `1000`, and assert that the purchase leaves `0`
coins.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/specialists.mjs
node test/fighter-progression-browser.mjs
```

Expected: both fail because the game still exposes and charges 250 coins for
level 2.

- [ ] **Step 3: Replace the canonical costs**

Set:

```js
export const FIGHTER_UPGRADE_COSTS = Object.freeze({
  2: Object.freeze({ coins: 1000, crystals: 0 }),
  3: Object.freeze({ coins: 2000, crystals: 5 }),
  4: Object.freeze({ coins: 2500, crystals: 13 }),
  5: Object.freeze({ coins: 3000, crystals: 15 }),
});
```

- [ ] **Step 4: Run focused and regression checks**

Run:

```bash
node --test test/specialists.mjs
node test/fighter-progression-browser.mjs
npm test
```

Expected: all commands exit `0`, and the browser profile shows and charges
exactly 1000 coins for level 2.

- [ ] **Step 5: Commit**

```bash
git add src/specialists.js test/specialists.mjs test/fighter-progression-browser.mjs
git commit -m "feat: revise fighter upgrade costs"
```
