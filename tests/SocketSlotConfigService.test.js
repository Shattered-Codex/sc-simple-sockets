import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketSlotConfigService } from "../scripts/core/services/SocketSlotConfigService.js";
import { GemResourceService } from "../scripts/domain/gems/GemResourceService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

function makeSlot(name, resource, { img = "icons/gem.webp", slotConfig = {}, slotIndex = 0 } = {}) {
  const source = {
    name,
    img,
    type: "loot",
    system: { quantity: 1, type: { value: "gem" } },
    flags: resource
      ? { [Constants.MODULE_ID]: { [Constants.FLAG_GEM_RESOURCE]: resource } }
      : {}
  };

  return {
    gem: { name, img },
    name,
    img,
    slotConfig,
    _slot: slotIndex,
    _gemData: {
      name,
      img,
      description: "",
      socketDescription: "",
      data: JSON.stringify(source)
    }
  };
}

describe("SocketSlotConfigService", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("updates slot config and gem charges in a single item update", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        includeActivitiesField: true,
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAGS.sockets]: [
              makeSlot("Battery Gem", { key: "battery", max: 10, value: 7 })
            ]
          }
        }
      }]
    });
    const item = actor.items.get("host-1");

    let calls = 0;
    const originalUpdate = actor.updateEmbeddedDocuments.bind(actor);
    actor.updateEmbeddedDocuments = async (...args) => {
      calls += 1;
      return originalUpdate(...args);
    };

    const updated = await SocketSlotConfigService.updateConfigAndResource(item, 0, {
      name: "Charged Slot",
      hidden: false,
      deleteGemOnRemoval: false,
      condition: "",
      description: "Keeps the battery gem ready.",
      color: "abc"
    }, 3);

    assert.equal(updated, true);
    assert.equal(calls, 1);

    const slot = item.getFlag(Constants.MODULE_ID, Constants.FLAGS.sockets)[0];
    assert.equal(slot.name, "Charged Slot");
    assert.equal(slot.slotConfig.description, "Keeps the battery gem ready.");
    assert.equal(slot.slotConfig.color, "#AABBCC");
    assert.deepEqual(
      GemResourceService.getSlotResource(slot),
      { key: "battery", max: 10, value: 3, destroyOnEmpty: false }
    );
  });

  test("skips the item update when the slot data is unchanged", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        includeActivitiesField: true,
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAGS.sockets]: [
              makeSlot("Battery Gem", { key: "battery", max: 10, value: 7 }, {
                slotConfig: {
                  name: "Battery Gem",
                  condition: "",
                  description: "",
                  color: "",
                  hidden: false,
                  deleteGemOnRemoval: false
                }
              })
            ]
          }
        }
      }]
    });
    const item = actor.items.get("host-1");

    let calls = 0;
    actor.updateEmbeddedDocuments = async () => {
      calls += 1;
      return [];
    };

    const updated = await SocketSlotConfigService.updateConfigAndResource(item, 0, {
      name: "Battery Gem",
      hidden: false,
      deleteGemOnRemoval: false,
      condition: "",
      description: "",
      color: ""
    }, 7);

    assert.equal(updated, true);
    assert.equal(calls, 0);
  });

  test("exposes normalized gem tags to slot conditions", async () => {
    const hostItem = createTestItem({
      name: "Sword",
      type: "weapon"
    });
    const gemItem = createTestItem({
      name: "Venom Shard",
      type: "loot",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_TAGS]: ["poison", "Ácido Arcano"]
        }
      }
    });
    const slot = {
      slotConfig: {
        condition: "return gemTags.includes('poison') && hasGemTag('acido arcano');"
      }
    };

    const result = await SocketSlotConfigService.evaluateCondition({
      hostItem,
      slot,
      slotIndex: 0,
      gemItem
    });

    assert.deepEqual(result, { allowed: true, error: null });
  });

  test("hasGemTag rejects a gem without the requested identifier", async () => {
    const result = await SocketSlotConfigService.evaluateCondition({
      hostItem: createTestItem({ type: "weapon" }),
      slot: { slotConfig: { condition: "hasGemTag('radiant')" } },
      slotIndex: 0,
      gemItem: createTestItem({
        type: "loot",
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAG_GEM_TAGS]: ["poison"]
          }
        }
      })
    });

    assert.equal(result.allowed, false);
    assert.equal(result.error, null);
  });
});
