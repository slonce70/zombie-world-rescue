# Bastion Hypercharge — Design

## Scope

This update extends Bastion in solo Expedition without changing co-op,
`PROTO_VERSION`, currencies, or other fighters.

## Super charge

- A successful basic fist attack charges the normal Super by 10%.
- A miss gives no charge.
- Hitting several zombies with one attack still counts once.
- Normal Super therefore needs 10 successful attacks.

## Gadget level gate

- Bastion's gadget cards remain visible in the fighter profile at every level.
- Levels 1–2 show both gadgets as locked and do not allow selection.
- From level 3, each gadget can be purchased separately for 1000 coins.
- Buying a gadget selects it; selecting an owned gadget costs nothing.
- `F` and the touch gadget button cannot activate a gadget before level 3.
- `F` also rejects a gadget that has not been purchased.
- From level 3 onward selection, cooldowns, Healing Punches, and Provoke keep
  their existing behavior.
- Existing `bastionGadget` selections remain valid.
- Purchases persist in `bastionGadgetsOwned`; invalid values migrate to an
  empty list.

## Hypercharge

- Hypercharge is visible but locked until Bastion level 5.
- At level 5, Hypercharge can be purchased once for 5000 coins.
- Hypercharge does not accumulate or activate until purchased.
- At level 5, every successful basic fist attack charges Hypercharge by 2%.
- Hypercharge therefore needs 50 successful attacks. It charges in parallel
  with the normal Super and is runtime-only for the current Expedition stage.
- `X` activates a full Hypercharge on desktop. Touch devices get a separate
  Hypercharge button.
- Activation consumes the 100% Hypercharge and opens a five-second window.
- If `C` is pressed while normal Super is ready during that window, Bastion
  uses the enhanced Super and closes the window.
- If the five seconds expire first, the Hypercharge is lost.
- Purchase ownership persists in `bastionHyperOwned`; invalid values migrate
  to `false`.

## Enhanced Super Punch

- The normal Super stays `7×2 m`, 500 damage.
- The enhanced Super is `7×4 m`, 750 fixed damage.
- Every zombie hit by the enhanced Super is slowed to 50% movement speed for
  four seconds using the existing `slowT`/`slowMul` zombie state.
- Damage is unaffected by fighter level or Expedition damage cards.

## UI

- Fighter profile explains: gadget unlock at level 3, Hypercharge unlock at
  level 5, `C` for Super, and `X` for Hypercharge.
- HUD shows normal Super percent plus Hypercharge percent or its remaining
  activation time.
- The touch Hypercharge button is visible only for an active level-5 Bastion.
- English, Ukrainian, and Russian text remain in parity.

## Acceptance checks

- Ten successful fist attacks charge normal Super from 0% to 100%.
- Level-2 Bastion cannot select or activate a gadget; level 3 can.
- Each gadget purchase deducts exactly 1000 coins once.
- Level-4 Bastion does not charge or activate Hypercharge.
- Hypercharge purchase deducts exactly 5000 coins once at level 5.
- Level-5 Bastion reaches 100% Hypercharge after 50 successful attacks.
- Hypercharge lasts five seconds and expires if unused.
- Enhanced Super hits only the `7×4 m` rectangle, deals exactly 750 damage,
  slows hit zombies for four seconds, and consumes normal Super.
- Normal Super remains `7×2 m`, 500 damage.
