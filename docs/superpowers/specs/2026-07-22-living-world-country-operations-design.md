# Living World Country Operations

## Goal

Extend the existing reversible Living Front instead of adding another mode. Poland and Germany receive country-specific, continuous three-stage operations whose completion feeds the existing destruction, rebuilding, population, outpost, and saved-country state.

## Operations

- Poland: light three bonfires, launch the rescue train, defeat the Ice Pursuer.
- Germany: rescue the mechanics, start three convoy trucks, defeat the Iron Baron.
- Spain keeps its existing destroyed-country music recovery operation.

All three stages are shown in the in-level HUD. Finished stages are crossed out, the current stage is highlighted, and future stages are locked. A successful checkpoint immediately starts the next stage without returning to a result screen. Only the final commander ends the operation.

## Reuse and persistence

Reuse `bonfire`, train repair, `rescue`, and `convoy` mission engines; do not add new mission engines or a new save format. `src/worldfront.js` remains the only persistent model, so wins continue to repair damage, restore population, and advance the country outpost. Existing co-op host authority remains unchanged.

## Validation

Do not manually run the repository test suites. Use syntax checks, diff checks, version synchronization, GitHub's required checks, and a cache-busted live version fetch after Pages deployment.
