# Campaign 2.0: Living Countries Design

## Goal

Turn the campaign from repeated mission slots on similar maps into country-specific story episodes with local NPCs, short dialogue, unique objectives, and replay modifiers.

## Problem

The current campaign has good ingredients: different countries, landmarks, bosses, gadgets, difficulty, and live events. The weak part is the mission contract. Most countries still feel like the same loop with different decoration:

- The player starts on a map.
- Missions attach to fixed role slots: rescue, tower, warehouse, village bonus.
- The objective pool changes, but many routes and interactions feel similar.
- Higher difficulty mostly asks the player to replay familiar work with harder enemies.

Adding more generic mission types would not fix this. The game needs stronger identity per country and clearer motivation for the player.

## Design Direction

Create a new campaign layer called "Living Countries". A country becomes a small episode:

1. The player enters the country.
2. A local NPC gives a short, readable reason for the mission.
3. The player completes two or three country-specific objectives tied to local landmarks.
4. A local event or twist changes the map state.
5. The boss opens as the finale.

The system should feel like an adventure, not a checklist. Dialogue must stay short because the game is for children and should remain action-first.

## Scope For First Release

The first implementation should convert only three countries:

- Ukraine: tutorial story country.
- Poland: winter rescue episode.
- Egypt: adventure/pyramid episode.

All other countries keep the current dynamic mission system for this release. This keeps the release realistic and prevents the campaign from breaking everywhere at once.

## Country Stories

### Ukraine: Sunny Village Rescue

NPC: village medic or rescuer.

Fantasy: the village is under attack, and the player becomes the first hero who teaches the rules of the campaign.

Objectives:

- Rescue civilians from the barn.
- Restore the village signal or water source.
- Defend the village square from a horde.
- Open the boss arena when the village is safe.

Ukraine should stay beginner-friendly. It can reuse existing mechanics, but the player should understand why each objective matters.

### Poland: Frozen Depot

NPC: station keeper or winter scout.

Fantasy: the town is freezing, the rescue train cannot move, and zombies are blocking the old depot and castle road.

Objectives:

- Light bonfires to push back the cold.
- Repair or start the rescue train near the rail depot.
- Clear a castle-ruin ambush.
- Fight the boss after the evacuation route is open.

Poland should teach that each country can have a different mission shape, not just a different skin.

### Egypt: Pyramid Secret

NPC: young archaeologist or desert guide.

Fantasy: the zombies opened an ancient tomb, and the player must seal the curse before the Pharaoh boss fully wakes.

Objectives:

- Find seals near the sphinx and pyramid.
- Carry the seals to the tomb door.
- Survive a mummy ambush when the tomb opens.
- Start the boss fight after the curse is weakened.

Egypt should be the first "adventure" country, using its landmarks as actual gameplay locations.

## Replay Design

Replay should not be a plain second loop through the same mission script.

After a country is liberated, replay mode becomes "infected return" for that country. The objectives can reuse the same story shell, but a modifier changes the run:

- Night raid: visibility and zombie detection change.
- Counterattack: more elite enemies and a mini-boss before the boss.
- Cursed houses: some buildings become risky optional loot spots.
- Radiation leak: one optional hazard zone appears for bonus reward.

The first release ships only one replay modifier: Night Raid. When a converted country has already been liberated, its replay starts at night, zombies notice the player from farther away, and one extra elite wave appears before the boss unlocks.

## Architecture

Add a story mission layer above the current dynamic mission system. It should not make `src/missionpool.js` even larger.

Proposed responsibilities:

- `src/story/countryStories.js`: declarative story definitions per country.
- `src/story/npcs.js`: NPC data, short dialogue, and helper metadata.
- `src/story/storymissions.js`: runtime engine for story objectives, markers, NPC prompts, completion, rewards, and boss unlock.
- Existing `src/missionpool.js`: remains the fallback for countries without a story definition and for existing dynamic mission tests.
- Existing map files in `src/maps/`: gain story anchors only when needed, for example `storySites` or named landmark points.

The story layer owns saveable mission progress and objective state. The renderer still owns meshes, beams, NPC rigs, effects, and HUD presentation.

## Data Flow

When a campaign level starts:

1. `Game.startLevel()` creates the level and world as it does today.
2. The campaign mission selector checks whether the country has a story definition.
3. If the country has a story definition, it creates `StoryMissions`.
4. If the country has no story definition, it creates the current `DynamicMissions`.
5. `StoryMissions.update()` drives objective prompts, markers, NPC dialogue, enemy waves, rewards, and boss unlock.

This keeps the change incremental. Converted countries use the new path; unconverted countries stay stable.

## NPC And Dialogue Rules

NPCs should guide, not interrupt.

- Dialogue appears as a compact HUD panel or banner.
- One NPC line should be short enough to read while playing.
- The player should be able to continue without clicking through long text.
- NPCs can use existing civilian rigs at first; custom models are not required for release one.
- Dialogue should explain the next action: where to go, what changed, why danger appeared.

Example tone:

- "The signal tower is silent. Restore it, and I can call survivors home."
- "The tomb seal cracked. Get ready, the mummies heard us."
- "The depot is clear. Light the last fire, then we move the train."

## Rewards And Progression

Rewards should stay close to the current economy:

- Main objectives grant coins and star-path XP through existing reward helpers.
- Optional replay events can grant extra coins, XP, or a small chance at crystals.
- First liberation rewards remain owned weapons, coins, medals, pets, or existing country rewards.
- Converted stories must still count for quests, chapter progress, cloud saves, co-op-safe state where supported, and country liberation.

No new currency is needed for this update.

## Co-op Boundary

First release should be solo campaign only for story missions.

If co-op starts a converted country, the game should use the old `DynamicMissions` fallback in co-op. This is safer than shipping half-synced story state.

Story co-op is outside this release.

## UI Boundary

Do not add a large quest journal in the first release.

Use existing HUD surfaces:

- Banner for story start and major objective transitions.
- Toast for short NPC comments.
- Minimap markers for the current objective.
- Existing interact prompt for NPCs and objects.

Add one compact "current story objective" line to the HUD, but keep the playfield clear.

## Map Boundary

The first release should reuse existing map landmarks and add only lightweight anchors:

- Ukraine can use village, barn, tower, and square.
- Poland can use rail depot, frozen lake, castle ruin, and town square.
- Egypt can use pyramid, sphinx, oasis, and tomb-style delivery point.

Avoid building huge new geometry in this update. The goal is to make existing maps play differently.

## Testing

The first release needs focused tests before browser smoke:

- Story selector chooses `StoryMissions` for Ukraine, Poland, Egypt.
- Story selector falls back to `DynamicMissions` for unconverted countries.
- Ukraine story completes objectives and unlocks the boss.
- Egypt seal/tomb objective is deterministic from map anchors.
- Replay modifier appears only after liberation.
- Save migration keeps old saves working.
- Version sync and service worker cache stay aligned before release.

Browser QA should verify:

- Start Ukraine, see NPC/story objective.
- Complete one objective and see the next marker.
- Start Poland and Egypt to confirm their identity is visible in the first minute.
- Start an unconverted country and confirm the old mission system still works.

## Risks

- `src/missionpool.js` is already large. Adding story code there would make future changes harder.
- Story objectives can become too text-heavy. Keep text short and action-led.
- Co-op synchronization is a separate problem. Do not mix it into the first story release unless necessary.
- Converting all countries at once would be too risky. Three countries are enough to prove the new campaign direction.

## Success Criteria

The update is successful if a player can describe Ukraine, Poland, and Egypt as different adventures, not just different maps.

Concrete signs:

- Each converted country has a visible NPC and a country-specific objective chain.
- The first minute of each converted country feels different.
- Replaying a liberated converted country applies a modifier instead of feeling like the same mission loop.
- Existing unconverted countries and existing modes still work.
