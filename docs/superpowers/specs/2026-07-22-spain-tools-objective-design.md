# Spain Tools Objective Design

## Goal

Make the destroyed-Spain recovery route lead to the item that can be picked up, and show tools, resources, and Music Center construction as one objective.

## Behavior

- The HUD shows four objectives: rescue musicians; rebuild the Music Center; clear the village; defend the fireworks.
- The Music Center objective keeps the existing ordered phases: tools, resources, 30-second construction.
- Its active text continues to show the current phase and progress.
- The waypoint, minimap, and world beam point to the same current rebuild target.
- Pickup remains `E`/the existing interact control; no new interaction system is added.

## Verification

Use the in-app browser. In destroyed Spain, confirm that the marker coordinates equal the next tool coordinates, pressing `E` adds the tool to the player, and the HUD returns four rows.
