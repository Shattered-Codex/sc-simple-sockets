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
