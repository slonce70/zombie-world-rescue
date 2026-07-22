# Spain Destruction Rebuild Design

## Goal

When Spain is in the `destroyed` Front state, its recovery operation contains only the six approved objectives, in this order:

1. Rescue the fiesta musicians.
2. Find the axe and pickaxe.
3. Gather 50 iron, 100 stone, and 55 wood.
4. Rebuild the Music Center for 30 seconds while zombies attack from every direction.
5. Clear the village of zombies.
6. Defend the fireworks.

Spain's normal campaign remains unchanged. The custom sequence is selected only for a destroyed Spain Front operation.

## Recommended structure

Keep the existing three-stage Front contract and group the six objectives into three continuous stages:

- Stage 1 — `spain-rebuild-center`: rescue musicians, find tools, gather exact resources, then rebuild the Music Center for 30 seconds.
- Stage 2 — `spain-clear-village`: clear the village of zombies.
- Stage 3 — `spain-defend-fireworks`: defend the fireworks and complete Spain's recovery.

The player moves directly between stages through the existing Front result overlay and never returns to the globe. No commander or unrelated random mission is added.

## Reuse

- Extend the existing `rebuild` mission instead of adding a second mission engine.
- Reuse Spain's musician civilian models and rescue site.
- Reuse the existing axe, pickaxe, resource-hit, 30-second construction, defense-zone, horde, co-op, and mission-completion paths.
- Add iron as another pickaxe resource alongside stone.
- Reuse the existing `clear` mission at Spain's village and the existing `defense` mission at the fireworks site.

## Selection and state flow

`frontStageConfig` selects the Spain-only stage list when all of these are true:

- active operation country is `ESP`;
- Spain's Front country state is `destroyed`;
- the operation is a recovery operation, not the normal campaign.

The special selection is derived from the canonical Front snapshot, so host, guest, reconnect, and solo produce the same stage configuration without a new protocol message.

Stage 1 phases are authoritative and sequential:

`musicians → tools → resources → build → complete`

Resource completion requires at least `iron=50`, `stone=100`, and `wood=55`; extra hits cannot regress progress. Construction advances only while a living player is in the Music Center zone and holding the interaction control. Spawn waves surround the center on four sides during the 30-second build.

## Presentation

- The HUD shows only the current objective and exact counters.
- The navigation beacon follows the next musician, tool, unfinished resource node, Music Center, village, or fireworks zone.
- Spain-specific Ukrainian copy names the Music Center, village, musicians, iron, stone, wood, and fireworks.
- Existing English and Russian localization parity remains complete.

## Failure and co-op

- Player death keeps the existing co-op downed/revive behavior.
- A failed Front stage uses the existing retry/end flow; completed recovery progress never regresses.
- Host remains authoritative for stage completion and rewards.
- Existing mission sync events are reused; no guest save is overwritten and no protocol bump is required.

## Validation

The smallest useful regression coverage must prove:

- normal Spain campaign still uses its original objectives;
- only destroyed Spain receives the three special Front presets;
- the six objectives occur in the approved order;
- exact resource totals are 50 iron, 100 stone, and 55 wood;
- construction lasts 30 seconds and attackers spawn from four sides;
- village clear and fireworks defense use Spain's intended map sites;
- solo and co-op/reconnect derive the same stage presets;
- app version, service-worker cache, and `version.json` are bumped together for release.

## Out of scope

- New art assets, mission framework, country-state system, enemy family, protocol message, or separate Spain mode.
- Changes to Spain's normal campaign, boss, manor, or other countries.
