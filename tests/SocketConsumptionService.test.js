import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { SocketConsumptionService } from "../scripts/core/services/SocketConsumptionService.js";
import { SocketService } from "../scripts/core/services/SocketService.js";
import { formatSocketTarget } from "../scripts/core/helpers/socketConsumptionConfig.js";
import { clearFoundryStubs, getProperty, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

function chargedSlot(name, value, max = value, destroyOnEmpty = false) {
  const source = {
    name,
    type: "loot",
    system: { quantity: 1, type: { value: "gem" } },
    flags: {
      [Constants.MODULE_ID]: {
        [Constants.FLAG_GEM_RESOURCE]: { key: "energy", value, max, destroyOnEmpty }
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

  test("isolates gem and charge reservations across overlapping uses of one activity", async () => {
    const hookHandlers = new Map();
    game.system = { id: "dnd5e" };
    CONFIG.DND5E = { activityConsumptionTypes: {} };
    Hooks.once = (_hook, callback) => callback();
    Hooks.on = (hook, callback) => hookHandlers.set(hook, callback);
    SocketConsumptionService.register();

    const actor = createTestActor({ items: [
      {
        id: "ability",
        type: "feat",
        flags: socketFlags([chargedSlot("Cell A", 1, 1, true), chargedSlot("Cell B", 1, 1, true)])
      }
    ] });
    const ability = actor.items.get("ability");
    const activity = { id: "blast", uuid: "Actor.test.Item.ability.Activity.blast", item: ability, flags: {} };
    const target = {
      item: ability,
      activity,
      target: formatSocketTarget({ mode: "anyGem" }),
      async resolveCost() { return { total: 1 }; }
    };
    const useA = { consume: { resources: true } };
    const useB = { consume: { resources: true } };
    const removals = [];
    const originalRemoveGem = SocketService.removeGem;
    let releaseRemoval = () => {};
    SocketService.removeGem = async (item, slotIndex) => {
      removals.push({ item, slotIndex });
    };

    try {
      hookHandlers.get("dnd5e.preActivityConsumption")(activity, useA, {});
      await SocketConsumptionService.consumeGem.call(target, useA, { item: [], rolls: [] });
      hookHandlers.get("dnd5e.preActivityConsumption")(activity, useB, {});
      await SocketConsumptionService.consumeGem.call(target, useB, { item: [], rolls: [] });
      hookHandlers.get("dnd5e.postUseActivity")(activity, useA, {});
      hookHandlers.get("dnd5e.postUseActivity")(activity, useB, {});

      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(removals.map(({ slotIndex }) => slotIndex), [0, 1]);

      removals.length = 0;
      target.target = formatSocketTarget({ mode: "any", resourceKey: "energy" });
      const useC = { consume: { resources: true } };
      const useD = { consume: { resources: true } };
      hookHandlers.get("dnd5e.preActivityConsumption")(activity, useC, {});
      await SocketConsumptionService.consumeCharge.call(target, useC, { item: [], rolls: [] });
      hookHandlers.get("dnd5e.preActivityConsumption")(activity, useD, {});
      await SocketConsumptionService.consumeCharge.call(target, useD, { item: [], rolls: [] });
      hookHandlers.get("dnd5e.postUseActivity")(activity, useC, {});
      hookHandlers.get("dnd5e.postUseActivity")(activity, useD, {});

      const normalActor = createTestActor({ items: [
        { id: "normal-ability", type: "feat", flags: socketFlags([chargedSlot("Normal Cell", 1)]) }
      ] });
      const normalAbility = normalActor.items.get("normal-ability");
      const normalActivity = {
        id: "normal-blast",
        uuid: "Actor.test.Item.normal-ability.Activity.normal-blast",
        item: normalAbility,
        flags: {}
      };
      const normalTarget = {
        item: normalAbility,
        activity: normalActivity,
        target: formatSocketTarget({ mode: "any", resourceKey: "energy" }),
        async resolveCost() { return { total: 1 }; }
      };
      const useE = { consume: { resources: true } };
      const useF = { consume: { resources: true } };
      hookHandlers.get("dnd5e.preActivityConsumption")(normalActivity, useE, {});
      await SocketConsumptionService.consumeCharge.call(normalTarget, useE, { item: [], rolls: [] });
      hookHandlers.get("dnd5e.preActivityConsumption")(normalActivity, useF, {});
      await assert.rejects(
        SocketConsumptionService.consumeCharge.call(normalTarget, useF, { item: [], rolls: [] }),
        /Not enough socketed "energy" charges \(0\/1\)/
      );
      hookHandlers.get("dnd5e.postUseActivity")(normalActivity, useE, {});

      assert.deepEqual(removals.map(({ slotIndex }) => slotIndex), [0, 1]);
      removals.length = 0;

      const delayedActor = createTestActor({ items: [
        {
          id: "delayed-ability",
          type: "feat",
          flags: socketFlags([
            chargedSlot("Disposable Cell", 2, 2, true),
            chargedSlot("Reserve Cell", 10, 10, false)
          ])
        }
      ] });
      const delayedAbility = delayedActor.items.get("delayed-ability");
      const delayedActivity = {
        id: "delayed-blast",
        uuid: "Actor.test.Item.delayed-ability.Activity.delayed-blast",
        item: delayedAbility,
        flags: {}
      };
      const delayedTarget = {
        item: delayedAbility,
        activity: delayedActivity,
        target: formatSocketTarget({ mode: "any", resourceKey: "energy" }),
        async resolveCost() { return { total: 3 }; }
      };
      const removalGate = new Promise((resolve) => {
        releaseRemoval = resolve;
      });
      SocketService.removeGem = async (item, slotIndex) => {
        removals.push({ item, slotIndex });
        await removalGate;
      };

      const useG = { consume: { resources: true } };
      const firstUpdates = { item: [], rolls: [] };
      hookHandlers.get("dnd5e.preActivityConsumption")(delayedActivity, useG, {});
      await SocketConsumptionService.consumeCharge.call(delayedTarget, useG, firstUpdates);
      await delayedActor.updateEmbeddedDocuments("Item", firstUpdates.item);
      hookHandlers.get("dnd5e.postUseActivity")(delayedActivity, useG, {});

      assert.deepEqual(removals.map(({ slotIndex }) => slotIndex), [0]);

      const useH = { consume: { resources: true } };
      const secondUpdates = { item: [], rolls: [] };
      delayedTarget.resolveCost = async () => ({ total: 1 });
      hookHandlers.get("dnd5e.preActivityConsumption")(delayedActivity, useH, {});
      await SocketConsumptionService.consumeCharge.call(delayedTarget, useH, secondUpdates);

      assert.equal(updatedCharge(secondUpdates, "delayed-ability", 1), 8);
      hookHandlers.get("dnd5e.postUseActivity")(delayedActivity, useH, {});
      releaseRemoval();
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      releaseRemoval();
      SocketService.removeGem = originalRemoveGem;
    }

    assert.deepEqual(removals.map(({ slotIndex }) => slotIndex), [0]);
  });
});
