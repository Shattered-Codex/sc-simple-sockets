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

## 2. Item Socket Flow

- Open a weapon or equipment item.
- Add socket slots.
- Drag a valid gem into a socket.
- Confirm the item sheet updates immediately.
- Remove the gem and confirm the item sheet updates immediately.

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

## 7. Regression Sweep

- Reload the world.
- Reopen a previously socketed item and actor.
- Confirm sockets, activities, effects, and badges are still in sync.
- Repeat one full add/remove cycle with console open and confirm no new warnings or stack traces appear.
