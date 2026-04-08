<p align="center">
  <a href="https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme">
    <img src="https://i.imgur.com/9kf3oWy.png" alt="Shattered Codex" width="200" height="200" />
  </a>
</p>

# SC - Simple Sockets

[![Wiki](https://img.shields.io/badge/Wiki-SC%20Simple%20Sockets-1f6feb?logo=bookstack&logoColor=white&style=for-the-badge)](https://wiki.shattered-codex.com/modules/sc-simple-sockets)
[![Support on Patreon](https://img.shields.io/badge/Patreon-Shattered%20Codex-FF424D?logo=patreon&logoColor=white&style=for-the-badge)](https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme)
![Foundry VTT 13-14](https://img.shields.io/badge/Foundry%20VTT-v13%20%7C%20v14-orange?logo=foundry-vtt&logoColor=white&style=for-the-badge)
![System: dnd5e](https://img.shields.io/badge/System-dnd5e-blue?style=for-the-badge)
[![libWrapper Recommended](https://img.shields.io/badge/libWrapper-Recommended-8A2BE2?style=for-the-badge)](https://github.com/ruipin/fvtt-lib-wrapper)
![Downloads](https://img.shields.io/github/downloads/Shattered-Codex/sc-simple-sockets/total?style=for-the-badge)
![Forks](https://img.shields.io/github/forks/Shattered-Codex/sc-simple-sockets.svg?style=for-the-badge)

A lightweight module for adding sockets to **D&D 5e** items in **Foundry VTT**.

With it, you can:

- add gem slots to weapons and equipment
- drag gems into those slots
- make the gem transfer effects and actions to the main item
- show descriptions, icons, badges, and visual details without manual setup every time

It is built to keep the workflow simple during play.

[Report an issue or request a feature](https://github.com/Shattered-Codex/sc-simple-sockets/issues)  
[Official Wiki](https://wiki.shattered-codex.com/modules/sc-simple-sockets)

---

## Preview Image

![Module overview image](https://i.imgur.com/xdOJCip.png)
![Module overview image](https://i.imgur.com/ok1w56l.png)


## What This Module Does

The module works best when you understand these 3 parts:

| Part | What it means | Example |
| --- | --- | --- |
| Host item | The item that will receive sockets | sword, armor, shield |
| Gem | The item that goes into the socket | ruby, rune, shard, crystal |
| Socket | The empty or filled slot inside the item | Slot 1, Slot 2, Slot 3 |


Once a gem is inserted, the module can:

- move the gem's **Active Effects** to the host item
- move the gem's **Activities** to the host item
- show which gems are equipped
- show gem descriptions inside the host item sheet
- return or delete the gem when it is removed, depending on your settings

## Main Features

- Adds a **Sockets** tab to supported item sheets.
- Supports **list** and **grid** layouts.
- Works with the default **dnd5e** sheet and **Tidy5e Sheet**.
- Supports **drag and drop** gem socketing.
- Automatically transfers **Active Effects** from the gem to the host item.
- Automatically mirrors **Activities** from the gem to the host item.
- Lets each gem restrict which items it can be used on.
- Lets each socket have its own rule, description, and color.
- Adds **Socket Descriptions** to the item sheet, with a button to send them to chat.
- Shows visual badges in actor inventory and activity icons.
- Includes a socket config window with gem inspection.
- Lets you control which user roles can add or remove sockets.
- Lets you set a maximum number of sockets per item.
- Lets you choose whether removed gems are returned or deleted.
- Supports custom loot subtypes so other item categories can behave like gems.
- Exposes an API for macros and automations.
- Includes ready-to-use gem compendium content.

> **Want even more content?**  
> If you want **120+ ready-to-use gems**, you can get the **SC - More Gems** module as a **Patreon supporter**.

## Requirements

- **Foundry VTT:** v13 and v14
- **System:** dnd5e
- **Recommended:** `libWrapper`

## Installation

1. In Foundry, open **Add-on Modules > Install Module**.
2. Paste this manifest URL:

```text
https://github.com/Shattered-Codex/sc-simple-sockets/releases/latest/download/module.json
```

3. Install the module.
4. Enable **SC - Simple Sockets** in your world.
5. For better compatibility with other modules, also install and enable `libWrapper`.


## Recommended First Setup

If this is your first time using the module, do this in order:

1. Choose which item types can receive sockets.
2. Choose which loot subtypes count as gems.
3. Create or import a few gems.
4. Define which items each gem can be used on.
5. Add sockets to your items.
6. Test by dragging a gem into a socket.

## First Setup Image

Replace only the link below with your own image:



## How To Use It

### 1. Choose which items can receive sockets

![First setup example](https://i.imgur.com/rluTKbj.png)

By default, the module allows sockets on:

- `weapon`
- `equipment`

That means weapons and equipment already work out of the box.

You can change this in:

**Configure Settings > Module Settings > SC - Simple Sockets**

Look for:

- **Socketable Item Types**

Example:

- If you want sockets only on weapons, leave only `weapon` selected.
- If you want armor and shields too, keep `equipment` enabled.

### 2. Decide what counts as a gem

![First setup example](https://i.imgur.com/rluTKbj.png)
![First setup example](https://i.imgur.com/lj24frK.png)

By default, the module treats this as a gem:

- an item of type **Loot**
- with subtype **gem**

You can change that in:

- **Gem Loot Subtypes**
- **Custom Loot Subtypes**

Example:

| If you want to use... | Do this |
| --- | --- |
| Normal gems | Keep the subtype `gem` |
| Runes | Create a custom subtype such as `rune` |
| Fragments | Create a custom subtype such as `fragment` |

### 3. Create or import gems

You can:

- use the compendium that already comes with the module
- duplicate one of the ready-made gems
- create a new gem by hand

To create one manually:

1. Create a **Loot** item.
2. Choose a subtype that is accepted as a gem.
3. Give it a name, image, and description.
4. Add effects and activities if you want.
5. Choose which items it can be used on.

## Gem Sheet Image

![Gem sheet example](https://i.imgur.com/NDWWcZW.png)
![Gem sheet example](https://i.imgur.com/AyFNvzT.png)

### 4. Choose where the gem can be used

On the gem sheet, there is a section called:

- **Allowed Item Types**

![Gem sheet example](https://i.imgur.com/YMUEBk9.png)

This tells the module which host items can accept that gem.

Examples:

| Situation | How to set it |
| --- | --- |
| The gem can be used on any supported item | Choose `All Types` |
| The gem should work only on weapons | Choose the weapon group |
| The gem should work only on specific subtypes | Choose the item type and subtype |

This prevents players from placing the wrong gem in the wrong item.

### 5. Add sockets to the host item

Open the weapon or equipment sheet.

If the item is compatible, you will see the:

- **Sockets** tab

From there you can:

- add a new socket
- remove a socket
- remove a gem from a socket
- open the socket config window
- open the gem inside the socket

If your world is set so the socket tab does not appear on every supported item, there is also a field in the item's **Details** tab:


- **Enable Socket Tab**

![Gem sheet example](https://i.imgur.com/eQROqfE.png)
![Gem sheet example](https://i.imgur.com/0jvQXC7.png)

That field turns the socket tab on for that specific item.

## Sockets Tab Image


![Sockets tab example](https://i.imgur.com/g41AjAI.png)

### 6. Drag the gem into the socket

After setup:

1. Open the host item.
2. Go to the **Sockets** tab.
3. Drag a gem into an empty socket.

The module automatically checks:

- whether the item is really a valid gem
- whether the gem can be used on that type of host item
- whether the socket has any extra restriction

If everything is valid:

- the gem is inserted
- effects are applied to the host item
- activities are copied to the host item
- visual details are updated

### 7. Remove the gem when needed

When you remove a gem, the module:

- removes transferred effects
- removes mirrored activities
- returns the gem to inventory or deletes it, depending on your settings

Tip:

- hold `Shift` when removing a gem or socket to skip the confirmation prompt

## Full Usage Example

1. Create a sword.
2. Add 2 sockets.
3. Create a loot item with subtype `gem`.
4. On the gem, allow it for weapons.
5. Drag the gem into the sword.
6. Watch the item gain the gem's effects and actions.

## Detailed Features

### Sockets tab on the item

Inside the **Sockets** tab, each socket can show:

- the empty socket image
- the equipped gem image
- the gem name
- a remove gem button
- a remove socket button
- an edit socket button
- a button to open the gem

### List or grid layout

You can choose between:

| Layout | What it looks like |
| --- | --- |
| `Default list` | More detailed list view |
| `Grid` | More compact visual view |

![Module overview image](https://i.imgur.com/M6OZ5L3.png)
![Module overview image](https://i.imgur.com/KWNJjWy.png)

This changes only the look, not the rules.

### Socket descriptions inside the item sheet

![Module overview image](https://i.imgur.com/1A6L0yU.png)

The module adds a block called:

- **Socket Descriptions**

It can show:

- the empty socket description
- the equipped gem description
- the socket or gem icon
- a button to send that description to chat

Important rule:

- if the socket is empty, the socket description is shown
- if the socket has a gem, the gem description is shown instead

### Badges on the actor inventory

![Module overview image](https://i.imgur.com/sbgOY58.png)

Items with sockets show visual badges in the actor inventory.

These badges help you quickly see:

- how many sockets the item has
- which ones are filled
- which ones are empty
- whether an empty socket has a custom color

### Badge on activities

When an activity comes from a gem, the module adds a small badge with the gem image.

That makes it easier to see:

- which action belongs to the original item
- which action came from a socketed gem

![Module overview image](https://i.imgur.com/pQOiRzu.png)



### Tidy5e integration

The module works with:

- the standard dnd5e item sheet
- **Tidy5e Sheet**


### Additional Details

![Module overview image](https://i.imgur.com/8pNDRym.png)

This section stores extra gem details.

Right now it can include things such as:

- extra damage
- attack bonus
- crit threshold
- crit multiplier
- relation to activity type

In simple terms: this is where you place the more advanced combat details for the gem.

## Example Gem Setup

| Field | Simple example |
| --- | --- |
| Type | Loot |
| Subtype | `gem` |
| Allowed Item Types | weapons |
| Socket Description | "Adds fire to the strike" |
| Active Effects | extra damage bonus |
| Activities | blast, ray, elemental strike |


## Socket Settings

Each socket can have its own configuration.

This is important because it lets you create special sockets instead of making every slot behave the same way.

### What each socket can store

![Module overview image](https://i.imgur.com/LC2BIB0.png)
![Module overview image](https://i.imgur.com/M8R4tJC.png)
![Module overview image](https://i.imgur.com/Pu6TaKS.png)
![Module overview image](https://i.imgur.com/Fy2bjZl.png)

| Field | What it does |
| --- | --- |
| `Slot condition` | Extra rule that accepts or blocks a gem |
| `Slot description` | Text shown while the socket is empty |
| `Slot color` | Color used for the empty socket |
| `Inspect Gem` | Opens the gem currently inside that socket |

### Slot description

Good examples:

- "Accepts only frost gems"
- "Ancient socket"
- "Weakened slot"

### Slot color

The empty socket color can appear in:

- the Sockets tab
- Tidy views
- actor inventory badges
- socket description entries

Important:

- the color is for the **empty socket**

### Slot condition

This is an advanced field.

If you do not like technical setup, you can ignore it.

It is useful for extra rules such as:

- only accept rare gems
- only accept gems with a certain name
- only accept gems in the first socket

Ready-to-copy examples:

Accept only gems with "Ruby" in the name:

```js
return gem?.name?.includes("Ruby");
```

Accept only rare gems:

```js
getProperty(gem, "system.rarity") === "rare"
```

Accept only in the first socket:

```js
slotIndex === 0
```

Accept only fire gems:

```js
return getProperty(gemItem, "flags.world.element") === "fire";
```

If the rule is invalid or cannot be read, the module blocks the gem and shows a warning.

## Socket Configuration Image

Replace only the link below with your own image:

![Socket configuration example](https://i.imgur.com/PXGNxG8.png)

![Socket configuration example](https://i.imgur.com/NYEMiEx.png)

## Module Settings

All options are available in:

**Configure Settings > Module Settings > SC - Simple Sockets**

### Main options summary

| Setting | Default | What it does |
| --- | --- | --- |
| **Socket settings** | — | Opens the main module settings window |
| **Enable Socket Tab on all items** | `true` | Shows the Sockets tab on all supported items |
| **Edit Socket Permission** | GM | Defines who can add or remove sockets |
| **Maximum Number of Sockets per Item** | `6` | Limits how many sockets each item can have |
| **Delete Gem on Removal** | `false` | Decides whether the gem is returned or deleted |
| **Gem damage layout in roll dialog** | `true` | Groups damage in the roll dialog by gem |
| **Socket tab layout** | `Default list` | Chooses between list and grid |
| **Socketable Item Types** | `weapon`, `equipment` | Defines which items can receive sockets |
| **Gem Loot Subtypes** | `gem` | Defines which loot subtypes count as gems |
| **Custom Loot Subtypes** | empty | Lets you create extra gem-like subtypes |

## Troubleshooting

### "I cannot drop the gem into the socket"

Check:

1. whether the item is really **Loot**
2. whether its subtype is marked as a gem subtype
3. whether the gem allows that host item type
4. whether the socket has an extra condition

### "The Sockets tab did not appear"

Check:

1. whether the item type is compatible
2. whether the global tab setting is enabled
3. if the global setting is off, whether **Enable Socket Tab** is turned on for that item

### "The gem disappeared when I removed it"

That depends on:

- **Delete Gem on Removal**

If that option is on, the gem is deleted when removed.

### "I want a more specific socket rule"

Use:

- **Slot condition**

But this is optional and more advanced.

## For Macros and Automation

This section is optional.

If you use macros, the module exposes an API at:

```js
game.modules.get("sc-simple-sockets").api
```

### Socket functions

```js
const api = game.modules.get("sc-simple-sockets")?.api?.sockets;
```

You can call:

- `getItemSlots(itemOrUuid)`
- `getItemGems(itemOrUuid)`

In simple terms:

- one function lists all sockets on an item
- the other lists only the gems currently socketed in that item

### Macro functions

```js
const macroApi = game.modules.get("sc-simple-sockets")?.api?.macro;
```

Available helpers:

- `addSocketInteractive()`
- `selectItemForSocket()`

Example:

```js
await game.modules.get("sc-simple-sockets")?.api?.macro?.addSocketInteractive({
  notifications: true
});
```

### Available hooks

For automations, the module also triggers:

- `sc-simple-sockets.socketAdded`
- `sc-simple-sockets.socketRemoved`

## Compatibility

- **Foundry Version:** v13 and v14
- **System:** dnd5e
- **Sheets:** default dnd5e sheet and **Tidy5e Sheet**
- **Recommended module:** [`libWrapper`](https://github.com/ruipin/fvtt-lib-wrapper)

## Useful Links

- GitHub: https://github.com/Shattered-Codex/sc-simple-sockets
- Issues: https://github.com/Shattered-Codex/sc-simple-sockets/issues
- Wiki: https://wiki.shattered-codex.com/modules/sc-simple-sockets
- Patreon: https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=github&utm_campaign=support_readme

---

SC - Simple Sockets is a Shattered Codex project. Pull requests, suggestions, and bug reports are welcome.
