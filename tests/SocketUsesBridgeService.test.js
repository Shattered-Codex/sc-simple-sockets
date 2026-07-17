import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { SocketUsesBridgeService } from "../scripts/core/services/SocketUsesBridgeService.js";
import {
  CONSUMPTION_TYPE_CHARGE,
  formatSocketTarget
} from "../scripts/core/helpers/socketConsumptionConfig.js";
import { clearFoundryStubs, getProperty, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

function chargedSlot(value, max = value) {
  return {
    gem: { name: "Dynamo Cell" },
    name: "Dynamo Cell",
    slotConfig: {},
    _gemData: ItemResolver.compactSnapshot({
      name: "Dynamo Cell",
      type: "loot",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_RESOURCE]: { key: "dynamocharge", value, max }
        }
      }
    })
  };
}

function socketFlags(slots) {
  return { [Constants.MODULE_ID]: { [Constants.FLAGS.sockets]: slots } };
}

function updatedCharge(updates, itemId) {
  const path = `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;
  const update = updates.item.find((entry) => entry._id === itemId);
  return getProperty(
    ItemResolver.expandSnapshot(update[path][0]._gemData),
    `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_RESOURCE}.value`
  );
}

describe("SocketUsesBridgeService", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => clearFoundryStubs());

  test("converts native item uses into an item-scoped socket charge deduction", async () => {
    const actor = createTestActor({ items: [{
      id: "local-sickle",
      system: { _source: { uses: { max: "@sockets.dynamocharge.item" } } },
      flags: socketFlags([chargedSlot(5, 5)])
    }] });
    const item = actor.items.get("local-sickle");
    const activity = { item, consumption: { targets: [] } };
    const target = {
      actor,
      item,
      activity,
      target: "",
      async resolveCost() { return { total: 2 }; }
    };
    const updates = { item: [], rolls: [] };
    let originalCalled = false;

    await SocketUsesBridgeService.consumeItemUses(
      async () => { originalCalled = true; },
      target,
      {},
      updates
    );

    assert.equal(originalCalled, false);
    assert.equal(updatedCharge(updates, "local-sickle"), 3);
    assert.equal(updates.item[0]["system.uses.spent"], undefined);
  });

  test("draws a total binding from the actor-wide pool", async () => {
    const actor = createTestActor({ items: [
      {
        id: "actor-sickle",
        system: { _source: { uses: { max: "@sockets.dynamocharge.total" } } },
        flags: socketFlags([chargedSlot(1, 2)])
      },
      { id: "armor", flags: socketFlags([chargedSlot(3, 4)]) }
    ] });
    const item = actor.items.get("actor-sickle");
    const target = {
      actor,
      item,
      activity: { item, consumption: { targets: [] } },
      target: "",
      async resolveCost() { return { total: 2 }; }
    };
    const updates = { item: [], rolls: [] };

    await SocketUsesBridgeService.consumeItemUses(async () => {}, target, {}, updates);

    assert.deepEqual(updates.item.map((entry) => entry._id), ["actor-sickle", "armor"]);
    assert.equal(updatedCharge(updates, "actor-sickle"), 0);
    assert.equal(updatedCharge(updates, "armor"), 2);
  });

  test("defers to explicit socket consumption and to unrelated formulas", async () => {
    const actor = createTestActor({ items: [{
      id: "sickle",
      system: { _source: { uses: { max: "@sockets.dynamocharge.total" } } },
      flags: socketFlags([chargedSlot(5)])
    }] });
    const item = actor.items.get("sickle");
    const explicitTarget = {
      type: CONSUMPTION_TYPE_CHARGE,
      target: formatSocketTarget({ mode: "any", resourceKey: "dynamocharge" })
    };
    const target = {
      actor,
      item,
      activity: { item, consumption: { targets: [explicitTarget] } },
      target: "",
      async resolveCost() { return { total: 1 }; }
    };
    const updates = { item: [], rolls: [] };
    let originalCalls = 0;
    const original = async () => { originalCalls += 1; };

    await SocketUsesBridgeService.consumeItemUses(original, target, {}, updates);
    assert.equal(originalCalls, 0);
    assert.deepEqual(updates.item, []);

    item.system._source.uses.max = "@abilities.str.mod";
    await SocketUsesBridgeService.consumeItemUses(original, target, {}, updates);
    assert.equal(originalCalls, 1);
  });
});
