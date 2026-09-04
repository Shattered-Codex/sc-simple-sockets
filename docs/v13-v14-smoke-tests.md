# v13/v14 Smoke Tests

Use the same world content on both targets:

- Foundry VTT `v13`
- Foundry VTT `v14`
- `dnd5e` `5.3.0+`
- `tidy5e-sheet` enabled

## 1. Boot and Settings

- Start the world with only `sc-simple-sockets` and `libWrapper`.
- Confirm there is no startup exception in the console.
- Open module settings and confirm socket settings menus open correctly.
- Confirm the module section shows one row of links (wiki, Patreon support, Discord) and that no loose Simple Sockets option is left in Foundry's list.
- Open the configuration window, switch to the Advanced tab, and confirm the What's New popup and debug logging toggles save and persist.

## 2. Item Socket Flow

- Open a weapon or equipment item.
- Add socket slots.
- Drag a valid gem into a socket.
- Confirm the item sheet updates immediately.
- Remove the gem and confirm the item sheet updates immediately.
- Open Socket Slot Settings, set an `Empty socket image` on one slot (field and click on the slot preview) and save.
- Confirm the empty slot shows the custom artwork in the Sockets tab, the actor badges, and the socket descriptions, and that the reset button restores the default socket image.

## 3. Actor Inventory Badges

- Put the socketed item on an actor.
- Confirm the actor inventory row shows the gem badges.
- Add or remove a gem while the actor sheet is already open.
- Confirm the actor sheet refreshes and badge state changes without reopening the sheet.

## 4. Activities and Effects

- Socket a gem that grants active effects.
- Confirm the host item receives the expected effects.
- Socket a gem that grants activities.
- Confirm the host item activities appear and activity badges render.
- Socket a gem with an activity that applies one of the gem's own non-transfer effects.
- Confirm the copied activity applies the copied host effect, not the original gem effect ID.
- Remove the gem and confirm transferred effects and activities are removed.

## 5. Tidy Integration

- Open the same host item in Tidy.
- Confirm the `Sockets` tab appears only when expected.
- Confirm the tab counter updates when sockets are filled or emptied.
- Confirm socket descriptions and item toggle content render once, without duplicates.

## 6. Damage Hooks

- Use a socketed weapon or spell that should add gem damage.
- Confirm extra gem damage is added to the damage workflow.
- Confirm crit threshold/multiplier logic still applies when configured on the gem.

## 7. Socket Counts in Active Effects

Foundry resolves effect change values differently on the two generations
(v13 does not resolve `@` paths in changes at all), so this section must be run
on both.

- On an item with sockets, add an Active Effect with the change
  `system.attributes.ac.bonus` / `Add` / `@sc.sockets.gems`.
- Equip the item and confirm the actor AC rises by the number of socketed gems.
- Socket another gem with the actor sheet open and confirm AC rises by one more,
  without reopening the sheet. Extract it and confirm AC drops back.
- Put another socketed gem on a second item the actor owns, then hover the AC
  value and confirm the breakdown tooltip credits the effect with the item count,
  not the character total.
- With that second item still holding an empty socket, change the value to
  `max(0, 2 - @sc.sockets.empty * 2)` on a fully socketed item and confirm the
  effect is listed in the tooltip with +2 — it evaluates to zero against the
  character totals, which is where dnd5e would otherwise drop it from the list.
- Change the value to `@sc.sockets.gems * 2` and confirm the bonus doubles on
  both generations.
- Change the value to `@sc.sockets.actor.gems` and confirm it counts the gems of
  every item the actor owns, including unequipped ones.
- Unequip (or break attunement on) the item and confirm the bonus disappears.
- Confirm the console shows no `failed to resolve` warning for the change.

## 8. Regression Sweep

Before the general regression sweep, verify tag-based consumption on both versions:

- Socket two gems, give only one the tag `poison`, and configure an activity with
  **Socketed Charges → Gem by tag → poison**. Confirm only that gem loses charges.
- Reopen the activity sheet and confirm the tag selector and value persisted.
- Repeat with **Socketed Gem → Gem by tag → poison** and confirm only the tagged
  gem is destroyed.
- For a character with tagged gems on multiple items, verify the current-item,
  equipped-item, and all-item scopes include only matching tagged gems.

- Reload the world.
- Reopen a previously socketed item and actor.
- Confirm sockets, activities, effects, and badges are still in sync.
- Repeat one full add/remove cycle with console open and confirm no new warnings or stack traces appear.
