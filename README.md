<p align="center">
  <a href="https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme">
    <img src="https://i.imgur.com/9kf3oWy.png" alt="Shattered Codex" width="200" height="200" />
  </a>
</p>

# SC - Simple Sockets

[![Wiki](https://img.shields.io/badge/Wiki-SC%20Simple%20Sockets-1f6feb?logo=bookstack&logoColor=white&style=for-the-badge)](https://wiki.shattered-codex.com/modules/sc-simple-sockets)
[![Support on Patreon](https://img.shields.io/badge/Patreon-Shattered%20Codex-FF424D?logo=patreon&logoColor=white&style=for-the-badge)](https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme)
[![Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&logoColor=white&style=for-the-badge)](https://discord.gg/6mWCQEJEwG)
![Foundry VTT 13-14](https://img.shields.io/badge/Foundry%20VTT-v13%20%7C%20v14-orange?logo=foundry-vtt&logoColor=white&style=for-the-badge)
![System dnd5e 5.3.0 and 6.0.0](https://img.shields.io/badge/System-dnd5e%205.3.0%20%7C%206.0.0-blue.svg?style=for-the-badge)
![Downloads](https://img.shields.io/github/downloads/Shattered-Codex/sc-simple-sockets/total?style=for-the-badge)
![Forks](https://img.shields.io/github/forks/Shattered-Codex/sc-simple-sockets.svg?style=for-the-badge)

Add sockets to **D&D 5e** items in **Foundry VTT**, then fill them with gems, runes, or crystals that provide Active Effects, activities, and optional charges.

Use the included gem compendium or create your own upgrades. The module supports the default dnd5e sheets and Tidy5e Sheet, with socket badges, descriptions, and list or grid layouts.

## Installation

Requires **Foundry VTT v13 or v14** and **dnd5e 5.3.0 or later** (verified with dnd5e 6.0.0).

1. Open **Add-on Modules > Install Module** in Foundry VTT.
2. Paste the manifest URL below and install the module.
3. Enable **SC - Simple Sockets** in your world.

```text
https://github.com/Shattered-Codex/sc-simple-sockets/releases/latest/download/module.json
```

## Quick Start

A **host item** receives sockets, a **gem** supplies the upgrade, and a **socket** holds one gem.

1. Create or open a weapon or equipment item.
2. Import a gem from the included compendium, or create a **Loot** item with subtype **gem**.
3. On the gem, set **Allowed Item Types** and add the Active Effects or activities it should provide.
4. Open the host item's **Sockets** tab and add an empty socket.
5. Drag the gem into the socket. Its effects and activities become available on the host item.

Removing a gem removes its transferred effects and activities. Gems return to inventory by default; removal settings or extraction activities can delete them instead.

For detailed setup guidance, visit the [Simple Sockets wiki](https://wiki.shattered-codex.com/modules/sc-simple-sockets).

## Configuration

Open **Configure Settings > Module Settings > SC - Simple Sockets > Module configuration** and select **Save Changes** after editing.

| Tab | Options |
| --- | --- |
| **Socket rules** | Who can edit sockets, the maximum sockets per item, and gem removal behavior |
| **Display** | Socket tab visibility, list or grid layout, and gem damage presentation |
| **Item types** | Which items accept sockets; weapons and equipment are enabled by default |
| **Gem subtypes** | Which loot subtypes count as gems, including custom subtypes such as runes |
| **Advanced** | Per-user update popup and debug logging preferences |

Each socket can have its own description, color, empty socket image, and condition. Gem tags such as `fire`, `poison`, or `healing` help define compatibility rules. Once a socket is filled, it displays the gem's artwork and description.

## Charges and Automation

Gems can carry a named resource with current and maximum charges, configured under **+Details > Socketed Resource**. Activities can spend charges from a gem, an item, or a pool of socketed items across the character. A gem returned to inventory keeps its remaining charges.

Socket counts can also drive native item Limited Uses and Active Effect bonuses. For example, `@sc.sockets.gems` counts filled sockets on the item, while `@sc.sockets.actor.gems` counts them across the character.

See the [Simple Sockets wiki](https://wiki.shattered-codex.com/modules/sc-simple-sockets) for resource configuration, formulas, and recovery rules.

## Related Modules

These optional Shattered Codex modules complement Simple Sockets:

| Module | How it complements your items |
| --- | --- |
| [SC - More Activities](https://foundryvtt.com/packages/sc-more-activities) | Enables activities for adding sockets, inserting or extracting gems, and recharging individual gems or shared pools. |
| [SC - Conditional AE](https://foundryvtt.com/packages/sc-conditional-ae) | Adds conditions and formulas to Active Effects for bonuses that depend on your rules. |
| [SC - Conditional Activities](https://foundryvtt.com/packages/sc-conditional-activities) | Controls when activities are usable, including conditions that check socketed gems. |
| [SC - Item Rarity Colors](https://foundryvtt.com/packages/sc-item-rarity-colors) | Makes item rarities easier to recognize through configurable colors on sheets, inventories, and the item directory. |

With **SC - More Activities** enabled, the following socket activities are available:

| Activity type | Purpose |
| --- | --- |
| `sc-socket-slot` | Add a configured socket or remove an empty one |
| `sc-socket-extraction` | Extract a gem, keeping or destroying it as configured |
| `sc-socket-gem-reload` | Insert a compatible gem from the actor's inventory |
| `sc-socket-recharge` | Restore charges to one socketed gem |
| `sc-socket-pool-recharge` | Restore a shared charge pool on an item |

Socket activities respect compatibility and permission checks. Chained activities copied from gems retain their internal references to the copied activities.

Shattered Codex also offers more modules on [Patreon](https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme), including **SC - More Gems** and other ways to bring variety and fun to your games. Explore the [wiki](https://wiki.shattered-codex.com) to see what each module adds.

## Screenshots

### Sockets and Slot Settings

Empty sockets with individual colors, followed by the slot configuration window.

![Gauntlet of Perfect Convergence with six colored empty sockets](https://i.imgur.com/c1TCoSy.png)

![Socket Slot Settings with custom artwork, color, description, and removal rules](https://i.imgur.com/BF1dVP9.png)

### Gem Descriptions, Tags, and Combat Bonuses

The gem's socket description explains its contribution to the host item. Tags support compatibility rules, while combat settings define optional bonuses.

![Boilerglass Dynamo Cell with its item and socket descriptions](https://i.imgur.com/Pm3K292.png)

![Boilerglass Dynamo Cell gem tags](https://i.imgur.com/JxeHfCY.png)

![Gem combat settings with attack, critical hit, and extra damage fields](https://i.imgur.com/FvDgWn3.png)

![Bloodstone configured with an attack bonus and extra necrotic damage](https://i.imgur.com/juSEE3Q.png)

### Gem Resources and Activity Consumption

Configure a gem's charges and recovery, then choose how an activity consumes socketed resources or gems.

![Boilerglass Dynamo Cell resource key, charges, recovery, and destruction option](https://i.imgur.com/ShggKOU.png)

![Activity consumption menu with Socketed Charges and Socketed Gem options](https://i.imgur.com/KnU3r3C.png)

![Socketed Gem consumption with equipped character pool scope and host item filter](https://i.imgur.com/lUf22GX.png)

## Troubleshooting

| Problem | What to check |
| --- | --- |
| A gem cannot be inserted | Confirm its loot subtype, **Allowed Item Types**, and the socket's condition. |
| The Sockets tab is missing | Check the supported item types and global tab setting. If automatic display is disabled, enable **Enable Socket Tab** in the item's **Details** tab. |
| A removed gem disappeared | Check **Delete Gem on Removal**, the slot override, and any extraction activity's configuration. |
| Resource formulas do not update after an upgrade | Reload the world and check the supported formulas in the [Simple Sockets wiki](https://wiki.shattered-codex.com/modules/sc-simple-sockets). |

## Support and Feedback

Questions and ideas are welcome on [Discord](https://discord.gg/6mWCQEJEwG). For bugs or feature requests, open a [GitHub issue](https://github.com/Shattered-Codex/sc-simple-sockets/issues). Documentation is available in the [official wiki](https://wiki.shattered-codex.com/modules/sc-simple-sockets).

## Icon Credits

The `sc-more-activities` socket activity icons bundled in this repository are
based on [Game-icons.net](https://game-icons.net/) artwork and are used under
the [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) license.

- `Power Ring` by Delapouite, used for `sc-socket-slot`
- `Pincers` by Lorc, used for `sc-socket-extraction`
- `Cut Diamond` by Lorc, adapted for `sc-socket-gem-reload`
- `Charging` by Delapouite, used for `sc-socket-recharge`
- `Energy Tank` by Delapouite, used for `sc-socket-pool-recharge`
