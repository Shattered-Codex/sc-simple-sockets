import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { SocketConsumptionService } from "../scripts/core/services/SocketConsumptionService.js";
import { formatSocketTarget } from "../scripts/core/helpers/socketConsumptionConfig.js";
import { clearFoundryStubs, getProperty, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

function chargedSlot(name, value, max = value) {
  const source = {
    name,
    type: "loot",
    system: { quantity: 1, type: { value: "gem" } },
    flags: {
      [Constants.MODULE_ID]: {
        [Constants.FLAG_GEM_RESOURCE]: { key: "energy", value, max }
      }
    }
  };
  return {
    gem: { name },
    name,
    slotConfig: {},
    _gemData: ItemResolver.compactSnapshot(source)
  };
}

function socketFlags(slots) {
  return { [Constants.MODULE_ID]: { [Constants.FLAGS.sockets]: slots } };
}

function updatedCharge(updates, itemId, slotIndex = 0) {
  const path = `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;
  const itemUpdate = updates.item.find((entry) => entry._id === itemId);
  return getProperty(
    ItemResolver.expandSnapshot(itemUpdate[path][slotIndex]._gemData),
    `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_RESOURCE}.value`
  );
}

describe("SocketConsumptionService actor pools", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => clearFoundryStubs());

  test("spends an equipped actor pool across multiple host items in stable order", async () => {
    const actor = createTestActor({ items: [
      { id: "ability", type: "feat" },
      { id: "sword", system: { equipped: true }, flags: socketFlags([chargedSlot("Cell A", 2, 3)]) },
      { id: "armor", system: { equipped: true }, flags: socketFlags([chargedSlot("Cell B", 4, 5)]) }
    ] });
    const ability = actor.items.get("ability");
    const target = {
      item: ability,
      activity: { id: "blast", item: ability, flags: {} },
      target: formatSocketTarget({ mode: "any", resourceKey: "energy", scope: "actorEquipped" }),
      async resolveCost() { return { total: 3 }; }
    };
    const updates = { item: [], rolls: [] };

    await SocketConsumptionService.consumeCharge.call(target, {}, updates);

    assert.deepEqual(updates.item.map((entry) => entry._id), ["sword", "armor"]);
    assert.equal(updatedCharge(updates, "sword"), 0);
    assert.equal(updatedCharge(updates, "armor"), 3);
  });

  test("applies the host filter before spending a character pool", async () => {
    const actor = createTestActor({ items: [
      { id: "ability", type: "feat", flags: { "sc-setforge": { setId: "dragon" } } },
      { id: "dragon", system: { equipped: true }, flags: {
        ...socketFlags([chargedSlot("Dragon Cell", 3)]),
        "sc-setforge": { setId: "dragon" }
      } },
      { id: "wolf", system: { equipped: true }, flags: {
        ...socketFlags([chargedSlot("Wolf Cell", 5)]),
        "sc-setforge": { setId: "wolf" }
      } }
    ] });
    const ability = actor.items.get("ability");
    const target = {
      item: ability,
      activity: { id: "blast", item: ability, flags: {} },
      target: formatSocketTarget({
        mode: "any",
        resourceKey: "energy",
        scope: "actorEquipped",
        filter: "getProperty(item, 'flags.sc-setforge.setId') === getProperty(sourceItem, 'flags.sc-setforge.setId')"
      }),
      async resolveCost() { return { total: 2 }; }
    };
    const updates = { item: [], rolls: [] };

    await SocketConsumptionService.consumeCharge.call(target, {}, updates);

    assert.deepEqual(updates.item.map((entry) => entry._id), ["dragon"]);
    assert.equal(updatedCharge(updates, "dragon"), 1);
  });
});
