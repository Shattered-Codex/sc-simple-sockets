import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketAPI } from "../scripts/core/api/SocketAPI.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { SocketSlot } from "../scripts/core/model/SocketSlot.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

describe("SocketAPI", () => {
  beforeEach(() => {
    installFoundryStubs({
      isGM: true,
      settings: {
        [`${Constants.MODULE_ID}.editSocketPermission`]: 0,
        [`${Constants.MODULE_ID}.maxSockets`]: 6,
        [`${Constants.MODULE_ID}.deleteGemOnRemoval`]: false,
        [`${Constants.MODULE_ID}.socketableItemTypes`]: ["weapon", "equipment"],
        [`${Constants.MODULE_ID}.${Constants.SETTING_GEM_LOOT_SUBTYPES}`]: ["gem"]
      }
    });
    globalThis.CONST.USER_ROLES = {
      NONE: 0,
      PLAYER: 1,
      TRUSTED: 2,
      ASSISTANT: 3,
      GAMEMASTER: 4
    };
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("registers the public socket mutation functions", () => {
    const module = {};
    let readyCallback = null;
    game.modules.set(Constants.MODULE_ID, module);
    Hooks.once = (event, callback) => {
      if (event === "ready") readyCallback = callback;
    };

    SocketAPI.register();
    readyCallback();

    assert.equal(typeof module.api.sockets.addSlot, "function");
    assert.equal(typeof module.api.sockets.addGem, "function");
  });

  test("adds a configured socket through the public API", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-add-slot",
        name: "Ruby Mantle",
        type: "equipment",
        flags: {
          [Constants.MODULE_ID]: { sockets: [] }
        }
      }]
    });
    const hostItem = actor.items.get("host-add-slot");

    const result = await SocketAPI.addSlot(hostItem, {
      slotConfig: {
        name: "Ruby Socket",
        description: "Accepts one adornment ruby.",
        color: "#9f1239"
      }
    });

    assert.deepEqual(result, {
      success: true,
      changed: true,
      reason: "slot-added",
      data: {
        slotIndex: 0,
        totalSlots: 1
      }
    });
    const [slot] = hostItem.flags[Constants.MODULE_ID].sockets;
    assert.equal(slot.slotConfig.name, "Ruby Socket");
    assert.equal(slot.slotConfig.description, "Accepts one adornment ruby.");
    assert.equal(slot.slotConfig.color, "#9F1239");
  });

  test("reports stable slot indexes for concurrent public additions", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-concurrent-slots",
        name: "Ruby Mantle",
        type: "equipment",
        flags: {
          [Constants.MODULE_ID]: { sockets: [] }
        }
      }]
    });
    const hostItem = actor.items.get("host-concurrent-slots");

    const results = await Promise.all([
      SocketAPI.addSlot(hostItem),
      SocketAPI.addSlot(hostItem)
    ]);

    assert.deepEqual(results.map((result) => result.data.slotIndex), [0, 1]);
    assert.deepEqual(results.map((result) => result.data.totalSlots), [1, 2]);
    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets.length, 2);
  });

  test("returns structured failure for invalid slot removal", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: []
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    const result = await SocketAPI.removeGem(hostItem, 3);

    assert.deepEqual(result, {
      success: false,
      changed: false,
      reason: "invalid-slot-index",
      data: {}
    });
  });

  test("returns structured success when a gem is removed", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{
              ...SocketSlot.makeDefault(),
              gem: {
                name: "Ruby",
                img: "icons/ruby.webp"
              },
              img: "icons/ruby.webp",
              _gemData: {
                name: "Ruby",
                img: "icons/ruby.webp",
                data: "{\"name\":\"Ruby\",\"type\":\"loot\",\"system\":{\"quantity\":1,\"type\":{\"value\":\"gem\"}}}"
              }
            }]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    const result = await SocketAPI.removeGem(hostItem, 0, {
      mode: "keep"
    });

    assert.equal(result.success, true);
    assert.equal(result.changed, true);
    assert.equal(result.reason, "gem-removed");
  });

  test("adds a gem to the first empty slot when no slot is provided", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-add-first",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [
              {
                ...SocketSlot.makeDefault(),
                gem: { name: "Ruby", img: "icons/ruby.webp" },
                _gemData: ItemResolver.compactSnapshot({
                  name: "Ruby",
                  type: "loot",
                  system: { quantity: 1, type: { value: "gem" } }
                })
              },
              SocketSlot.makeDefault(),
              SocketSlot.makeDefault()
            ]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-add-first");
    const gemItem = createTestActor({
      id: "gem-owner",
      items: [{
        id: "gem-add-first",
        name: "Sapphire",
        type: "loot",
        system: {
          quantity: 1,
          type: { value: "gem" },
          activities: {}
        }
      }]
    }).items.get("gem-add-first");

    const result = await SocketAPI.addGem(hostItem, gemItem);

    assert.equal(result.success, true);
    assert.equal(result.reason, "gem-added");
    assert.equal(result.data.slotIndex, 1);
    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets[1].gem.name, "Sapphire");
    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets[2].gem, null);
  });

  test("adds a gem to an explicitly selected slot", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-add-explicit",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [SocketSlot.makeDefault(), SocketSlot.makeDefault()]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-add-explicit");
    const gemActor = createTestActor({
      id: "gem-owner-explicit",
      items: [{
        id: "gem-add-explicit",
        name: "Emerald",
        type: "loot",
        system: {
          quantity: 1,
          type: { value: "gem" },
          activities: {}
        }
      }]
    });
    const gemItem = gemActor.items.get("gem-add-explicit");

    const result = await SocketAPI.addGem(hostItem, gemItem, 1);

    assert.equal(result.success, true);
    assert.equal(result.data.slotIndex, 1);
    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets[0].gem, null);
    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets[1].gem.name, "Emerald");
  });

  test("returns a structured failure when no empty slot is available", async () => {
    const filledSlot = {
      ...SocketSlot.makeDefault(),
      gem: { name: "Ruby", img: "icons/ruby.webp" },
      _gemData: ItemResolver.compactSnapshot({
        name: "Ruby",
        type: "loot",
        system: { quantity: 1, type: { value: "gem" } }
      })
    };
    const actor = createTestActor({
      items: [{
        id: "host-full",
        name: "Sword",
        type: "weapon",
        flags: {
          [Constants.MODULE_ID]: { sockets: [filledSlot] }
        }
      }]
    });
    const gemActor = createTestActor({
      items: [{
        id: "gem-full",
        name: "Emerald",
        type: "loot",
        system: { quantity: 1, type: { value: "gem" } }
      }]
    });

    const result = await SocketAPI.addGem(
      actor.items.get("host-full"),
      gemActor.items.get("gem-full")
    );

    assert.deepEqual(result, {
      success: false,
      changed: false,
      reason: "no-available-slot",
      data: {}
    });
    assert.equal(gemActor.items.has("gem-full"), true);
  });

  test("exposes normalized gem tags and checks them without expanding public snapshots", async () => {
    const gemSource = {
      name: "Dynamo Core",
      type: "loot",
      system: { quantity: 1, type: { value: "gem" } },
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_TAGS]: ["Dynamo Battery", "Lightning"]
        }
      }
    };
    const actor = createTestActor({
      items: [{
        id: "host-tags",
        name: "Dynamo Blade",
        type: "weapon",
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{
              ...SocketSlot.makeDefault(),
              gem: { name: gemSource.name, img: "icons/dynamo.webp" },
              _gemData: ItemResolver.compactSnapshot(gemSource)
            }]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-tags");

    const gems = await SocketAPI.getItemGems(hostItem);

    assert.deepEqual(gems[0].tags, ["dynamo-battery", "lightning"]);
    assert.equal(await SocketAPI.hasItemGemTag(hostItem, "Dynamo Battery"), true);
    assert.equal(await SocketAPI.hasItemGemTag(hostItem, "frost"), false);
  });
});
