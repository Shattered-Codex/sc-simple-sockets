# SC - Simple Sockets

![Foundry VTT 13+](https://img.shields.io/badge/Foundry%20VTT-13%2B-orange?logo=foundry-vtt&logoColor=white)
![System: dnd5e](https://img.shields.io/badge/System-dnd5e-blue)
[![libWrapper Recommended](https://img.shields.io/badge/libWrapper-Recommended-8A2BE2)](https://github.com/ruipin/fvtt-lib-wrapper)

Lightweight socketing for D&D 5e weapons and equipment. Add gem slots to items, drag and drop gem loot, and let the module move active effects and activities to the host item automatically. SC - Simple Sockets keeps your tables focused on play, not bookkeeping.

[Request features or report issues](https://github.com/Shattered-Codex/sc_simple_sockets/issues)

---

## Installation

1. In Foundry's **Add-on Modules > Install Module** dialog, paste the manifest URL  
   `https://github.com/Shattered-Codex/sc_simple_sockets/releases/latest/download/module.json`
2. Install, then enable **SC - Simple Sockets** in your World's module list.
3. (Optional) Install and activate [`libWrapper`](https://github.com/ruipin/fvtt-lib-wrapper) for safer compatibility with other modules.

The module targets Foundry VTT v13+ with the official **dnd5e** system.

## Quick Start

1. **Prepare a host item** – open a weapon or equipment item sheet and switch to the new **Sockets** tab.
2. **Add slots** – use the `Add` control to create one or more empty sockets (respecting the world limit).
3. **Create or import gems** – gems are loot-type items whose subtype is set to `gem`. Start with the sample items in the `SC - Gems` compendium or build your own.
4. **Socket a gem** – drag a gem from an actor sheet, compendium, or sidebar into an empty slot. The gem is consumed from inventory, its active effects are enabled on the host, and any activities are cloned onto the item.
5. **Unsocket when needed** – remove a gem via the slot controls. By default the gem returns to the actor's inventory; enable the *Delete Gem on Removal* setting to destroy it instead. Hold `Shift` to bypass the confirmation prompt.

![sockets](https://i.imgur.com/azxl7Gz.png)
![sockets](https://i.imgur.com/bv1mJui.png)
![sockets](https://i.imgur.com/WyNyxKL.png)
![sockets](https://i.imgur.com/IiOMgMd.png)
![sockets](https://i.imgur.com/BDLfybi.png)

## Features

- **Native sheet integration** – adds a first-class Sockets tab to the dnd5e item sheet and supports both Foundry VTT core and Application V2 layouts.
- **Drag-and-drop socketing** – drop gem items directly into slots; invalid drops raise concise notifications.
- **Automatic effect transfer** – gem active effects are moved onto the host item and marked for easy cleanup when the gem is removed.
- **Activity mirroring** – gem activities (including uses) are cloned to the host item, so players can trigger gem powers without opening the gem document.
- **Visual indicators** – actor inventory lists show socket badges for equipped items, and item activity cards gain gem markers to show their source.
- **Inventory-aware workflow** – gems are consumed or returned from the owning actor automatically, keeping quantities accurate.

## Module Settings

All settings live under **Configure Settings > Module Settings > SC - Simple Sockets**.

- **Edit Socket Permission** – minimum Foundry role required to add or remove sockets. GMs bypass this check.
- **Maximum Number of Sockets per Item** – world-wide cap; set to `-1` for unlimited slots.
- **Delete Gem on Removal** – toggle whether removing a gem destroys it or sends it back to the actor's inventory.

## Creating Custom Gems

1. Create a new **Loot** item and set the subtype to `gem`.
2. Add **Active Effects** you want to activate when the gem is socketed. The module keeps them disabled on the gem itself and toggles them on for the host item.
3. (Optional) Add **Activities** (e.g., strikes, save DCs, resource uses). Simple Sockets extends loot items so these are preserved and copied to the host when socketed.
4. Distribute gems via the `SC - Gems` compendium or your own collections.

If a gem temporarily loses its `gem` subtype, the module stashes its effects and activities so you do not lose any work.

## Compendium Content

- `SC - Gems` — ready-to-use gem items demonstrating socket effects and activities. Import, duplicate, and tweak for your game.

## Tips & Troubleshooting

- You can hold `Shift` while removing a gem or deleting a socket to skip the confirmation dialog.
- If sockets stop appearing, ensure the item type is still `weapon` or `equipment`; other item types ignore the Sockets tab.

## Compatibility

- **Foundry Version:** v13+ (verified on v13)
- **System:** dnd5e
- **Recommended Modules:** [`libWrapper`](https://github.com/ruipin/fvtt-lib-wrapper) for conflict-free sheet hooks.

---

SC - Simple Sockets is a Shattered Codex project. Pull requests and issue reports are welcome!
