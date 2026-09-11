import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { Constants } from "../scripts/core/Constants.js";
import { GemEffectStore } from "../scripts/domain/gems/GemEffectStore.js";
import { GemLifecycleService } from "../scripts/domain/gems/GemLifecycleService.js";
import { installFoundryStubs, clearFoundryStubs } from "./support/foundryStubs.js";
import { createTestItem, createEffect } from "./support/testDocuments.js";

function makeGem(reference) {
  const item = createTestItem({
    id: "gem", type: "loot", system: {
      type: { value: "gem" },
      activities: { buff: { _id: "buff", type: "utility", effects: [reference] } },
      uses: { spent: 2, max: "4", recovery: [] }
    },
    effects: [{ _id: "original-effect", name: "Buff", disabled: true }]
  });
  Object.defineProperty(item.effects, "size", { get: () => item.effects.contents.length });
  item.effects.map = fn => item.effects.contents.map(fn);
  item.createEmbeddedDocuments = async (_type, payloads, options = {}) => {
    const created = payloads.map((payload, index) => createEffect({
      ...payload,
      _id: options.keepId && payload._id ? payload._id : `generated-effect-${index}`
    }));
    item.effects.contents.push(...created);
    return created;
  };
  return item;
}

describe("Gem effect restoration", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => clearFoundryStubs());

  for (const reference of [
    { _id: "original-effect" },
    { _id: "remote-profile", uuid: "Item.gem.ActiveEffect.original-effect" }
  ]) {
    test(`subtype round trips preserve activity references: ${JSON.stringify(reference)}`, async () => {
      const item = makeGem(reference);
      const lifecycle = new GemLifecycleService();
      for (let roundTrip = 0; roundTrip < 2; roundTrip++) {
        item.system.type.value = "treasure";
        await lifecycle.handleItemUpdated(item, { "system.type.value": "treasure" });
        assert.equal(item.effects.size, 0);
        assert.deepEqual(item.system.activities, {});

        item.system.type.value = "gem";
        await lifecycle.handleItemUpdated(item, { "system.type.value": "gem" });
        assert.equal(item.effects.contents[0].id, "original-effect");
        assert.equal(item.effects.contents[0].disabled, true);
        assert.deepEqual(item.system.activities.buff.effects, [reference]);
        assert.equal(item.system.uses.spent, 2);
        assert.equal(item.getFlag(Constants.MODULE_ID, Constants.FLAG_STASH), undefined);
      }
    });
  }

  test("legacy stashes without IDs can still restore their effect data", async () => {
    const item = makeGem({ _id: "original-effect" });
    item.effects.contents = [];
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_STASH, [{ name: "Legacy Buff", disabled: true }]);
    await GemEffectStore.restore(item);
    assert.equal(item.effects.contents[0].name, "Legacy Buff");
    assert.ok(item.effects.contents[0].id);
  });
});
