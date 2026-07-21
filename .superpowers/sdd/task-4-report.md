# Task 4 — HUD active objective

## RED

Added the requested DOM assertions. The first standard run stopped before them because the newly collapsed “Other operations” menu hid `#btn-solo`; the test now opens that native details control. The assertion uses the live `#mission-list` ID (the brief's `#missions` selector does not exist in this checkout).

## GREEN

An isolated-server browser run showed one `.story-objective`, one barn-rescue string, and one active primary item. The full focused story run also passed both new assertions. Its final exit was non-zero only for three existing UKR campaign expectations: this branch has a fourth `ukr-rebuild` objective, while the test still expects three and boss unlock after `ukr-defense`.

## Files

- `src/missionpool.js` — marks active non-optional dynamic missions primary.
- `src/story/storymissions.js` — marks the active story objective primary.
- `src/hud.js` — renders one primary line and compact active optional feedback only.
- `test/story-campaign2-browser.mjs` — covers one visible, non-duplicated primary objective and opens the collapsed test menu.

## Tests

- Focused isolated browser smoke: passed (`visible: 1`, `primary: 1`, barn-rescue text once).
- `node test/story-campaign2-browser.mjs`: new HUD assertions passed; overall failed on the three pre-existing UKR campaign assumptions above.
- `npm test`: started once; smoke failed its existing movement threshold (`0.14` vs expected movement), then was stopped to avoid a long unrelated run.

## Self-review and concerns

The HUD consumes the existing `getHudList()` contract, retains `icon`, `title`, and `done`, shows no completed mission history, and adds no translation key or dependency. Concern: full-suite baseline expectations need the owner of the fourth UKR objective to update separately.
