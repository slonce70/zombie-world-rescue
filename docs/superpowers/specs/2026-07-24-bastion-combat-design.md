# Bastion Combat Kit — Design

## Scope

Bastion becomes playable in solo Expedition. This change does not add Bastion
to co-op, change the network protocol, or alter other fighters.

## Level Stats

These are Bastion's exact base values and replace the generic `+10%` fighter
scaling:

| Level | Max HP | Fist damage |
|---:|---:|---:|
| 1 | 50 | 50 |
| 2 | 65 | 75 |
| 3 | 100 | 95 |
| 4 | 175 | 110 |
| 5 | 215 | 125 |

Expedition run upgrades still apply after these base values, so temporary HP
and damage cards remain useful.

## Basic Attack: Fists

- Uses the current attack controls; Bastion does not equip a starting weapon.
- Hits every zombie inside a rectangle 3 m forward and 1 m wide.
- One attack per second.
- Holds 10 attacks, has infinite reserve, and reloads all 10 attacks in 1.5
  seconds.
- Reload starts automatically when empty and can also be started with the
  existing reload control.
- The implementation reuses the existing melee hit flow with an internal
  fists entry. The profile and HUD present it as an attack, not a weapon.

## Super: Super Punch

- Activated with `C` on desktop and the existing Super button on touch devices.
- Hits every zombie inside a rectangle 7 m forward and 2 m wide.
- Deals exactly 100 damage, unaffected by Bastion level or temporary damage
  upgrades.
- Charges by 20% for each basic attack that hits at least one zombie. Hitting
  several zombies with one attack still counts once; a miss gives no charge.

## Gadgets

The Bastion profile shows both gadgets. Clicking a gadget selects it for the
next Expedition run. The selected gadget is saved in one field,
`bastionGadget`; the default is `healing-punch`.

`F` activates the selected gadget on desktop. A separate compact gadget button
is shown for Bastion on touch devices. Gadget selection cannot be changed
during a run.

### Healing Punches

- The next two basic attacks that hit at least one zombie each restore 30 HP.
- One attack heals only once even if it hits several zombies.
- Missing does not consume a healing attack.
- Healing cannot exceed Bastion's current maximum HP.
- Cooldown is 30 seconds and begins on activation.
- The gadget cannot be activated again while its two attacks remain or while
  it is cooling down.

### Provoke

- For 5 seconds, zombies within 12 m target Bastion.
- Bastion receives 40% less damage during the effect.
- Zombies outside the radius keep their current behavior.
- Cooldown is 30 seconds and begins on activation.
- The effect does not stack and cannot be restarted while active.

This is a tank-control tool rather than a copy of the existing heal, dash,
shield, or stun gadgets.

## UI and Save Compatibility

- Reuse the existing fighter profile modal, gadget cards, HUD cooldown display,
  melee effects, and Expedition input handlers.
- Add only the selected Bastion gadget to the existing save/cloud-save flow;
  missing or invalid values migrate to `healing-punch`.
- Existing saves, fighter levels, coins, crystals, modes, and rewards remain
  unchanged.

## Acceptance Checks

- Each level produces the exact HP and fist damage from the table without an
  additional fighter-level multiplier.
- Fists use the exact 3×1 m area, 10-attack capacity, 1 s attack interval, and
  1.5 s reload.
- Super uses `C`, deals 100 damage in the exact 7×2 m area, and becomes ready
  after five successful basic attacks.
- Both gadgets respect hit counting, cooldowns, non-stacking rules, and their
  desktop/touch controls.
- Gadget selection persists through local and cloud saves.
- Other fighters, co-op controls, and the network protocol behave as before.
