<p align="center">
  <a href="https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme">
    <img src="https://i.imgur.com/9kf3oWy.png" alt="Shattered Codex" width="200" height="200" />
  </a>
</p>

# SC - Simple Sockets

![Foundry VTT 13+](https://img.shields.io/badge/Foundry%20VTT-13%2B-orange?logo=foundry-vtt&logoColor=white)
![System: dnd5e](https://img.shields.io/badge/System-dnd5e-blue)
[![libWrapper Recommended](https://img.shields.io/badge/libWrapper-Recommended-8A2BE2)](https://github.com/ruipin/fvtt-lib-wrapper)
[![Wiki](https://img.shields.io/badge/Wiki-SC%20Simple%20Sockets-1f6feb)](https://wiki.shattered-codex.com/modules/sc-simple-sockets)
[![Support on Patreon](https://img.shields.io/badge/Patreon-Shattered%20Codex-FF424D?logo=patreon&logoColor=white)](https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme)
![Forks][forks-shield]
![Downloads](https://img.shields.io/github/downloads/Shattered-Codex/sc-simple-sockets/total)


Lightweight socketing for D&D 5e weapons and equipment. Add gem slots to items, drag and drop gem loot, and let the module move active effects and activities to the host item automatically. SC - Simple Sockets keeps your tables focused on play, not bookkeeping.

[Request features or report issues](https://github.com/Shattered-Codex/sc-simple-sockets/issues)
[Official Wiki](https://wiki.shattered-codex.com/modules/sc-simple-sockets)

---

## Installation

1. In Foundry's **Add-on Modules > Install Module** dialog, paste the manifest URL  
   `https://github.com/Shattered-Codex/sc-simple-sockets/releases/latest/download/module.json`
2. Install, then enable **SC - Simple Sockets** in your World's module list.
3. (Optional) Install and activate [`libWrapper`](https://github.com/ruipin/fvtt-lib-wrapper) for safer compatibility with other modules.

The module targets Foundry VTT v13+ with the official **dnd5e** system.

## Quick Start

1. **Prepare a host item**. Open a socketable item and switch to the new **Sockets** tab.
2. **Add slots**. Use `Add` to create one or more empty sockets.
3. **Create or import gems**. Any **Loot** item whose subtype is configured as a gem can be socketed.
4. **Configure the gem**. Optionally define allowed host item types, `Socket Description`, and `Additional Details`.
5. **Socket the gem**. Drag a gem from an actor sheet, compendium, sidebar, or another supported source into an empty slot.
6. **Configure the slot**. Click the slot edit control to add a slot-side condition, description, and color tint.
7. **Unsocket when needed**. Remove the gem or the slot using the slot controls. Hold `Shift` to skip confirmation prompts.

<<image suggestion>>
<<image suggestion>>
<<image suggestion>>

## Overview

SC - Simple Sockets adds a complete socket workflow for **dnd5e** items:

- Host items gain a dedicated **Sockets** tab.
- Gem items gain socket-specific configuration panels.
- Socketed gems transfer their **Active Effects** to the host item.
- Socketed gems mirror their **Activities** onto the host item.
- Item sheets, actor inventory rows, activity rows, and description cards show socket state visually.
- Tidy5e integration is built in, including the alternate layouts used by the module.

In practice, the module works with three document roles:

| Role | What it is | What the module adds |
| --- | --- | --- |
| Host item | Usually a `weapon` or `equipment` item | Receives the **Sockets** tab and stores slots |
| Gem item | A `loot` item whose subtype is treated as a gem | Gains gem-specific configuration and can be dropped into slots |
| Socket slot | A per-item slot entry stored on the host item | May contain a gem and optional slot-side config |

## Features

- **Native sheet integration** – adds a first-class Sockets tab to the dnd5e item sheet and supports both Foundry VTT core and Application V2 layouts.
- **Drag-and-drop socketing** – drop gem items directly into slots; invalid drops raise concise notifications.
- **Automatic effect transfer** – gem active effects are moved onto the host item and marked for easy cleanup when the gem is removed.
- **Activity mirroring** – gem activities (including uses) are cloned to the host item, so players can trigger gem powers without opening the gem document.
- **Per-gem targeting rules** – restrict each gem to specific weapon or equipment subtypes so players only see valid sockets.
- **Per-slot rules** – restrict each slot with its own JavaScript condition, description, and tint color.
- **Visual indicators** – actor inventory lists show socket badges for equipped items, and item activity cards gain gem markers to show their source.
- **Inventory-aware workflow** – gems are consumed or returned from the owning actor automatically, keeping quantities accurate.
- **Tidy5e Sheet styling** – bundled CSS keeps the sockets list attractive and readable on the Tidy5e inventory layout.

## How It Works

### 1. Host items

By default, host items are item types selected in **Socketable Item Types**. The default world selection is:

- `weapon`
- `equipment`

If an item type is enabled as socketable, its sheet gains the **Sockets** tab and can store slots.

### 2. Gem items

By default, a gem is a **Loot** item with subtype `gem`. You can expand this through:

- **Gem Loot Subtypes**
- **Custom Loot Subtypes**

When an item qualifies as a gem, the module exposes gem-side configuration such as:

- **Allowed Item Types**
- **Socket Description**
- **Additional Details**

### 3. Socketing flow

When a valid gem is dropped into a valid empty slot:

1. The module validates the gem against the gem-side allowed types.
2. The module validates the gem against the slot-side condition, if one exists.
3. The gem snapshot is stored in the slot.
4. Active effects are transferred to the host item.
5. Activities are mirrored to the host item.
6. UI badges and descriptions update automatically.

When a gem is removed:

1. The transferred effects and mirrored activities are cleaned up.
2. The gem is either returned to inventory or deleted, depending on settings.
3. The slot configuration remains on the slot unless the slot itself is removed.

### 4. Slot-side behavior

Each slot can now have its own configuration, independent of the gem:

- **Slot condition** – a JavaScript condition that must pass before a gem can be inserted.
- **Slot description** – shown in **Socket Descriptions** while the slot is empty.
- **Slot color** – tints the empty socket frame in supported UIs.

If a gem is present in the slot:

- The slot config window still opens from the slot.
- The gem can be inspected from the slot config window in **read-only** mode.
- The slot description is replaced by the gem's own `Socket Description`.
- The tint is not applied to the gem image itself.

## Layouts

The module currently supports two socket-tab layouts plus Tidy integration:

| Layout | Description |
| --- | --- |
| `Default list` | Vertical list layout with controls and metadata |
| `Grid` | Compact grid-style socket presentation |
| `Tidy5e / tidy 5e` | Integrated rendering inside Tidy5e item sheets, including the module's socket controls and descriptions |

The selected layout is controlled by **Socket tab layout** in the module settings.

## Item Sheet UI

### Sockets tab on host items

Inside the **Sockets** tab, each slot can show:

- The empty socket frame or socketed gem image
- A remove-gem button
- A remove-slot button
- A slot-config button
- A hover pencil indicator for slot editing

The exact presentation depends on the selected layout, but the behavior is consistent across core and Tidy integrations.

### Socket Descriptions

The module injects a **Socket Descriptions** block into the item description area.

Behavior:

- Empty slot with slot description: shows the empty socket icon and the slot description.
- Filled slot with gem description: shows the gem icon and the gem `Socket Description`.
- Slot tint: applied to the empty socket icon in supported views.
- Chat button: sends the selected socket description card to chat.

### Badges on actor sheets

Actor inventory rows display small socket badges for socketed items and empty sockets. Empty slot badges also respect the slot color when configured.

## Configuring Gems

### Allowed Item Types

Every gem can define which host item types or subtypes are allowed.

Use **Allowed Item Types** on the gem sheet to restrict a gem to:

- All socketable item types
- A whole host item type
- Specific subtypes inside that type

This is the **gem-side** validation rule. It stays active even if the slot also has its own condition.

### Socket Description

Every gem can define a `Socket Description`.

This text appears in **Socket Descriptions** when:

- The gem is currently socketed in a host item
- The slot contains that gem

This is separate from the host item's own description and separate from the slot-side description.

### Additional Details

The **Additional Details** section lets a gem define extra combat metadata used by the module's gem features.

Current fields include:

| Field | What it does |
| --- | --- |
| Extra damage rows | Adds configured damage packages to the gem |
| `number` | Number of dice |
| `die` | Die denomination such as `d4`, `d6`, `d8`, etc. |
| `bonus` | Flat bonus added to that row |
| `type` | dnd5e damage type |
| `activity` | Scope for that row: `any`, `attack`, or `spell` |
| Crit threshold | Optional threshold override used by gem logic |
| Crit multiplier | Optional multiplier override used by gem logic |
| Attack bonus | Optional attack bonus override used by gem logic |

### Creating Custom Gems

1. Create a new **Loot** item.
2. Set its subtype to one of the configured gem subtypes.
3. Add any **Active Effects** you want transferred to the host.
4. Add any **Activities** you want mirrored to the host.
5. Configure **Allowed Item Types**.
6. Add a **Socket Description** if you want text shown in the host item.
7. Optionally configure **Additional Details**.

If a gem temporarily stops matching gem criteria, the module preserves important gem data so you do not lose your setup.

## Configuring Slots

Each slot has its own config window. This is opened from the slot edit control.

### Slot config fields

| Field | What it does |
| --- | --- |
| `Slot condition` | JavaScript condition evaluated when a gem is dropped into the slot |
| `Slot description` | Rich text shown in **Socket Descriptions** while the slot is empty |
| `Slot color` | Hex color plus color picker used to tint the empty socket frame |
| `Inspect Gem` | Opens the currently socketed gem in read-only mode |

### Slot condition

The slot condition is evaluated only for that slot. If the condition returns a falsy result, the gem cannot be socketed there.

The field accepts either:

- A full body with `return`
- A simple expression without `return`

Examples:

```js
return gem?.name?.includes("Ruby");
```

```js
getProperty(gem, "flags.world.rarity") === "rare"
```

```js
slotIndex === 0 && actor?.type === "character"
```

### Slot condition context parameters

The slot condition currently receives the following values:

| Parameter | Type | Description |
| --- | --- | --- |
| `actor` | `Actor \| null` | Owner actor of the host item, if any |
| `deepClone` | `Function` | Shortcut to `foundry.utils.deepClone` |
| `game` | `Game` | The current Foundry `game` object |
| `gem` | `Item \| null` | Alias of `gemItem` |
| `gemItem` | `Item \| null` | The gem being dropped |
| `getProperty` | `Function` | Shortcut to `foundry.utils.getProperty` |
| `hasProperty` | `Function` | Shortcut to `foundry.utils.hasProperty` |
| `hostItem` | `Item \| null` | The item that owns the slot |
| `item` | `Item \| null` | Alias of `hostItem` |
| `moduleId` | `string` | The module id, currently `sc-simple-sockets` |
| `slot` | `object \| null` | Deep-cloned snapshot of the slot before the drop |
| `slotConfig` | `object` | Normalized slot configuration object |
| `slotIndex` | `number \| null` | Zero-based slot index |
| `source` | `object \| null` | Source drag/drop payload snapshot when available |
| `user` | `User \| null` | Current user |

Practical usage examples:

```js
return getProperty(gemItem, "flags.world.element") === "fire";
```

```js
return gem?.type === "loot" && hostItem?.type === "weapon";
```

```js
return slotConfig.color === "#FF0000" && user?.isGM;
```

Notes:

- If the field is blank, the slot accepts any gem that already passes the gem-side restrictions.
- The function runs as async JavaScript, so keep it lightweight and deterministic.
- A runtime error in the condition blocks the drop and shows a notification.

### Slot description

`Slot description` is rich text and is used only while the slot is empty.

When a gem is inserted:

- The slot description is hidden for that slot.
- The gem `Socket Description` takes over.

### Slot color

`Slot color` only affects the **empty** socket frame. The tint is used in:

- The Sockets tab
- Tidy socket views
- Actor badge sockets
- Socket Descriptions entries

## Module Settings

All settings live under **Configure Settings > Module Settings > SC - Simple Sockets**.

### Main settings and menus

| Setting / Menu | Scope | Default | What it does |
| --- | --- | --- | --- |
| **Socket settings** | World menu | — | Opens the unified socket settings window |
| **Edit Socket Permission** | World | `GM / Gamemaster` | Minimum role required to add or remove sockets |
| **Maximum Number of Sockets per Item** | World | `6` | Max slot count per host item; use `-1` for unlimited |
| **Delete Gem on Removal** | World | `false` | Deletes the gem instead of returning it to inventory |
| **Gem damage layout in roll dialog** | Client | `true` | Enables the grouped-by-gem damage layout |
| **Socket tab layout** | World | `Default list` | Chooses between list and grid socket layouts |
| **Socketable Item Types** | World menu + stored array | `weapon`, `equipment` | Controls which item types may receive sockets |
| **Gem Loot Subtypes** | World menu + stored array | `gem` | Selects which loot subtypes are treated as gems |
| **Custom Loot Subtypes** | World menu + stored array | empty | Adds new custom loot subtype keys and labels |
| **Support the developer / Patreon support** | World menu | — | Opens the support panel |
| **Hide automatic support message until next update** | Client | `false` | Suppresses the versioned support card after it is shown |

### Socket settings window

The **Socket settings** menu groups the most important behavior options in one place:

- **Socket rules**
- **Display**

Inside this window you can configure:

- Edit permission
- Maximum sockets per item
- Delete on removal
- Gem damage roll layout
- Socket tab layout

### Socketable Item Types

Use **Configure Socketable Item Types** to decide which host item types can receive sockets.

Default selection:

- `weapon`
- `equipment`

If a type is not selected here, items of that type will not receive the **Sockets** tab.

### Gem Loot Subtypes

Use **Configure Gem Loot Subtypes** to decide which loot subtypes count as gems.

Default selection:

- `gem`

This is useful when your table uses renamed or additional subtype categories.

### Custom Loot Subtypes

Use **Configure Custom Loot Subtypes** to register extra loot subtype keys and labels.

Example:

| Key | Label |
| --- | --- |
| `shard` | `Shard` |
| `rune-fragment` | `Rune Fragment` |

After saving:

- The subtype becomes available in the dnd5e loot subtype dropdown.
- It can be selected in **Gem Loot Subtypes**.
- Items using it can behave as gems if selected.

## API & Hooks

The module exposes a runtime API at:

`game.modules.get("sc-simple-sockets").api`

### Sockets API

```js
const api = game.modules.get("sc-simple-sockets")?.api?.sockets;

// Accepts an Item document or an item UUID.
const gems = await api.getItemGems(itemOrUuid);
const slots = await api.getItemSlots(itemOrUuid);
```

- `getItemGems(itemOrUuid, { includeSnapshots = false })` returns only slots containing gems.
- `getItemSlots(itemOrUuid, { includeSnapshots = false })` returns all slots with `hasGem`, `slotIndex`, and slot data.
- When `includeSnapshots` is `false` (default), `_gemData` is omitted from the payload.
- Hook constants are exposed on the API as:
  - `HOOK_SOCKET_ADDED`
  - `HOOK_SOCKET_REMOVED`

### Macro API

```js
const macroApi = game.modules.get("sc-simple-sockets")?.api?.macro;
```

Available methods:

- `addSocketInteractive(options = {})`
- `selectItemForSocket(options = {})`

Current options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `renderSheet` | `boolean` | `true` | Used by the item-selection workflow defaults |
| `notifications` | `boolean` | `true` | Shows or suppresses helper notifications during selection/workflow |

Example:

```js
await game.modules.get("sc-simple-sockets")?.api?.macro?.addSocketInteractive({
  notifications: true
});
```

### API return shapes

`getItemSlots(...)` returns:

```js
[
  {
    slotIndex: 0,
    hasGem: true,
    slot: {
      name: "Empty",
      img: "modules/sc-simple-sockets/assets/imgs/socket-slot.webp",
      gem: { ... }
    }
  }
]
```

`getItemGems(...)` returns:

```js
[
  {
    slotIndex: 0,
    name: "Ruby Shard",
    img: "path/to/image.webp",
    uuid: "Item.xxx",
    sourceUuid: "Compendium.xxx",
    slot: { ... }
  }
]
```

### Hooks

- `sc-simple-sockets.socketAdded`
- `sc-simple-sockets.socketRemoved`

Both hooks receive:

```js
{
  item, itemId, itemUuid,
  actor, actorId,
  slotIndex,
  slot,
  totalSlots,
  userId
}
```

Example:

```js
Hooks.on("sc-simple-sockets.socketAdded", (payload) => {
  console.log("Socket added:", payload.item?.name, payload.slotIndex);
});
```

## Compendium Content

- `SC - Gems` — ready-to-use gem items demonstrating socket effects and activities. Import, duplicate, and tweak for your game.
- `SC - Gems Macros` — macro support content shipped with the module pack list.

If you want more ready-to-use gems and extra Shattered Codex module content, check the Patreon. Supporters can get access to **SC - More Gems**, which expands the gem library with prebuilt content:

- Patreon: https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme
- Wiki: https://wiki.shattered-codex.com/modules/sc-simple-sockets

## Recommended Workflow

1. Configure **Socketable Item Types** for the host items used in your world.
2. Configure **Gem Loot Subtypes** and optionally **Custom Loot Subtypes**.
3. Create or import gem items.
4. On each gem, set:
   - **Allowed Item Types**
   - **Socket Description**
   - **Additional Details**, if needed
5. On each host item, add slots.
6. On special slots, configure:
   - **Slot condition**
   - **Slot description**
   - **Slot color**
7. Drag gems into slots during play.

## Examples

### Example: elemental-only slot

```js
return getProperty(gem, "flags.world.element") === "fire";
```

### Example: first slot only accepts rare gems

```js
return slotIndex === 0 && getProperty(gemItem, "flags.world.rarity") === "rare";
```

### Example: only character-owned items can use this slot

```js
return actor?.type === "character";
```

### Example: gem usable only on weapons

Configure the gem-side **Allowed Item Types** to a weapon group or weapon subtype, then optionally add a slot-side condition for a narrower rule.

## Tips & Troubleshooting

- You can hold `Shift` while removing a gem or deleting a socket to skip the confirmation dialog.
- If sockets stop appearing, check **Socketable Item Types** first.
- If a gem cannot be dropped into a slot, verify both the gem-side **Allowed Item Types** and the slot-side **Slot condition**.
- If a gem is not recognized as a gem, confirm that its loot subtype is selected in **Gem Loot Subtypes**.
- If a custom subtype does not appear, save it in **Custom Loot Subtypes** and reopen the item sheet.
- If a slot description does not appear, remember that a socketed gem's `Socket Description` overrides the empty-slot description.
- If slot tint is not visible, remember that tint is only applied while the slot is empty.

## Compatibility

- **Foundry Version:** v13+ (verified on v13)
- **System:** dnd5e
- **Sheet Modules:** Works with the core dnd5e item sheet and the community **Tidy5e Sheet** module.
- **Recommended Modules:** [`libWrapper`](https://github.com/ruipin/fvtt-lib-wrapper) for conflict-free sheet hooks.

---

SC - Simple Sockets is a Shattered Codex project. Pull requests and issue reports are welcome!


[forks-shield]:https://img.shields.io/github/forks/Shattered-Codex/sc-simple-sockets.svg?style=flat-round
