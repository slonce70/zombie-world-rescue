# Living World Design

## Goal

Make campaign replays feel less predictable by adding short live events during a run, using the existing mission, horde, reward, zombie, and HUD systems.

## Design

After a normal campaign mission completes, the game may offer one "Living World" event. Events are small, readable, and child-safe: save a stranded survivor, clear a cursed supply crate, or defeat a golden horde. They are not required for boss unlocks and do not add another menu.

The first version is deliberately campaign-only. Storm, Arena, co-op mirrors, Chapter 3 lab, and Turret War stay unchanged. Rewards use existing coins and XP only.

## Event Rules

- At most one active event at a time.
- Events start after mission completion, with deterministic seeded selection for stable tests.
- Events end when the objective is completed or its local threat is defeated.
- The HUD uses existing toast/banner messaging.
- Spawned enemies use existing zombie types and horde helpers.

## Testing

Add one focused unit-style test for deterministic event selection and reward math, then run quick release and browser smoke checks.
