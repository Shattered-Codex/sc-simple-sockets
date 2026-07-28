import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { GemResourceService } from "../scripts/domain/gems/GemResourceService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

function makeGemSource(name, resource, { img = "icons/gem.webp" } = {}) {
  return {
    name,
    img,
    type: "loot",
    system: { quantity: 1, type: { value: "gem" } },
    flags: resource
      ? { [Constants.MODULE_ID]: { [Constants.FLAG_GEM_RESOURCE]: resource } }
      : {}
  };
}

function makeSlot(name, resource, options = {}) {
  const source = makeGemSource(name, resource, options);
  return {
    gem: { name, img: source.img },
    name,
    img: source.img,
    slotConfig: {},
    _gemData: {
      name,
      img: source.img,
      description: "",
      socketDescription: "",
      data: JSON.stringify(source)
    }
  };
}

function emptySlot() {
  return { gem: null, name: "Empty", img: Constants.SOCKET_SLOT_IMG, slotConfig: {}, _gemData: null };
}

const NO_RECOVERY = { period: "", type: "recoverAll", formula: "", threshold: 6 };

describe("GemResourceService", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  describe("normalizeResource", () => {
    test("returns null without a resource key", () => {
      assert.equal(GemResourceService.normalizeResource(null), null);
      assert.equal(GemResourceService.normalizeResource({ key: "  " }), null);
    });

    test("clamps the current value between zero and max", () => {
      assert.deepEqual(
        GemResourceService.normalizeResource({ key: "battery", max: 5, value: 42 }),
        { key: "battery", max: 5, value: 5, destroyOnEmpty: false, recovery: NO_RECOVERY }
      );
      assert.deepEqual(
        GemResourceService.normalizeResource({ key: "battery", max: 5, value: -3 }),
        { key: "battery", max: 5, value: 0, destroyOnEmpty: false, recovery: NO_RECOVERY }
      );
    });

    test("treats an empty value as a full resource", () => {
      assert.deepEqual(
        GemResourceService.normalizeResource({ key: "magic", max: "4", value: "" }),
        { key: "magic", max: 4, value: 4, destroyOnEmpty: false, recovery: NO_RECOVERY }
      );
    });

    test("normalizes the destroyOnEmpty flag", () => {
      assert.equal(
        GemResourceService.normalizeResource({ key: "battery", max: 5, destroyOnEmpty: true }).destroyOnEmpty,
        true
      );
      assert.equal(
        GemResourceService.normalizeResource({ key: "battery", max: 5, destroyOnEmpty: "true" }).destroyOnEmpty,
        true
      );
      assert.equal(
        GemResourceService.normalizeResource({ key: "battery", max: 5, destroyOnEmpty: "no" }).destroyOnEmpty,
        false
      );
    });

    test("keeps a valid recovery period and trims the formula", () => {
      assert.deepEqual(
        GemResourceService.normalizeResource({
          key: "battery",
          max: 5,
          recovery: { period: "lr", type: "formula", formula: " 1d4 " }
        }).recovery,
        { period: "lr", type: "formula", formula: "1d4", threshold: 6 }
      );
    });

    test("falls back to recoverAll for unknown recovery types", () => {
      assert.deepEqual(
        GemResourceService.normalizeResource({
          key: "battery",
          max: 5,
          recovery: { period: "sr", type: "explode", formula: "1d4" }
        }).recovery,
        { period: "sr", type: "recoverAll", formula: "1d4", threshold: 6 }
      );
    });

    test("coerces loseAll to recoverAll for the recharge period", () => {
      assert.equal(
        GemResourceService.normalizeResource({
          key: "battery",
          max: 5,
          recovery: { period: "recharge", type: "loseAll" }
        }).recovery.type,
        "recoverAll"
      );
      assert.equal(
        GemResourceService.normalizeResource({
          key: "battery",
          max: 5,
          recovery: { period: "day", type: "loseAll" }
        }).recovery.type,
        "loseAll"
      );
    });

    test("clamps the recharge threshold between 1 and 6, defaulting to 6", () => {
      const recoveryWith = (threshold) => GemResourceService.normalizeResource({
        key: "battery",
        max: 5,
        recovery: { period: "recharge", threshold }
      }).recovery.threshold;
      assert.equal(recoveryWith("5"), 5);
      assert.equal(recoveryWith(""), 6);
      assert.equal(recoveryWith("9"), 6);
      assert.equal(recoveryWith("0"), 1);
    });

    test("rejects unknown recovery periods, discarding the formula", () => {
      assert.deepEqual(
        GemResourceService.normalizeResource({
          key: "battery",
          max: 5,
          recovery: { period: "week", formula: "1d4" }
        }).recovery,
        NO_RECOVERY
      );
      assert.deepEqual(
        GemResourceService.normalizeResource({ key: "battery", max: 5 }).recovery,
        NO_RECOVERY
      );
    });
  });

  describe("withSlotResourceValue", () => {
    test("writes the clamped value back into the slot snapshot", () => {
      const slot = makeSlot("Battery Gem", { key: "battery", max: 10, value: 7 });
      const updated = GemResourceService.withSlotResourceValue(slot, 42);

      assert.notEqual(updated, slot);
      assert.deepEqual(
        GemResourceService.getSlotResource(updated),
        { key: "battery", max: 10, value: 10, destroyOnEmpty: false, recovery: NO_RECOVERY }
      );
      // The original slot snapshot is untouched.
      assert.equal(GemResourceService.getSlotResource(slot).value, 7);
    });

    test("returns the slot unchanged when there is nothing to update", () => {
      const noResource = makeSlot("Plain Gem", null);
      assert.equal(GemResourceService.withSlotResourceValue(noResource, 3), noResource);

      const sameValue = makeSlot("Battery Gem", { key: "battery", max: 10, value: 7 });
      assert.equal(GemResourceService.withSlotResourceValue(sameValue, 7), sameValue);
    });

    test("preserves the recovery config when changing the value", () => {
      const slot = makeSlot("Battery Gem", {
        key: "battery",
        max: 10,
        value: 7,
        recovery: { period: "sr", type: "formula", formula: "1d4" }
      });
      const updated = GemResourceService.withSlotResourceValue(slot, 3);
      assert.deepEqual(
        GemResourceService.getSlotResource(updated).recovery,
        { period: "sr", type: "formula", formula: "1d4", threshold: 6 }
      );
    });
  });

  describe("withSlotResourceRecovery", () => {
    test("writes the recovery config back into the slot snapshot", () => {
      const slot = makeSlot("Battery Gem", { key: "battery", max: 10, value: 7 });
      const updated = GemResourceService.withSlotResourceRecovery(
        slot,
        { period: "lr", type: "formula", formula: "1d6", threshold: 4 }
      );

      assert.notEqual(updated, slot);
      assert.deepEqual(
        GemResourceService.getSlotResource(updated),
        {
          key: "battery",
          max: 10,
          value: 7,
          destroyOnEmpty: false,
          recovery: { period: "lr", type: "formula", formula: "1d6", threshold: 4 }
        }
      );
      // The original slot snapshot is untouched.
      assert.deepEqual(GemResourceService.getSlotResource(slot).recovery, NO_RECOVERY);
    });

    test("returns the slot unchanged when there is nothing to update", () => {
      const noResource = makeSlot("Plain Gem", null);
      assert.equal(
        GemResourceService.withSlotResourceRecovery(noResource, { period: "lr", type: "recoverAll", formula: "" }),
        noResource
      );

      const same = makeSlot("Battery Gem", {
        key: "battery",
        max: 10,
        value: 7,
        recovery: { period: "lr", type: "formula", formula: "1d6" }
      });
      assert.equal(
        GemResourceService.withSlotResourceRecovery(same, { period: "lr", type: "formula", formula: "1d6", threshold: 6 }),
        same
      );
    });
  });

  describe("getSlotResource", () => {
    test("reads the resource from the compact slot snapshot", () => {
      const slot = makeSlot("Battery Gem", { key: "battery", max: 10, value: 7 });
      assert.deepEqual(
        GemResourceService.getSlotResource(slot),
        { key: "battery", max: 10, value: 7, destroyOnEmpty: false, recovery: NO_RECOVERY }
      );
    });

    test("returns null for empty slots and gems without a resource", () => {
      assert.equal(GemResourceService.getSlotResource(emptySlot()), null);
      assert.equal(GemResourceService.getSlotResource(makeSlot("Plain Gem", null)), null);
    });
  });

  describe("aggregatePools", () => {
    test("derives pools from the socketed gems, merging keys case-insensitively", () => {
      const pools = GemResourceService.aggregatePools([
        makeSlot("Battery Gem", { key: "battery", max: 10, value: 7 }),
        makeSlot("Spare Cell", { key: "Battery", max: 4, value: 2 }),
        makeSlot("Mana Stone", { key: "magic", max: 3, value: 3 }),
        emptySlot()
      ]);

      assert.deepEqual(pools, [
        { key: "battery", value: 9, max: 14, gems: 2 },
        { key: "magic", value: 3, max: 3, gems: 1 }
      ]);
    });
  });

  describe("planChargeConsumption", () => {
    test("spreads an 'any' consumption across slots and writes back snapshots", () => {
      const slots = [
        makeSlot("Battery Gem", { key: "battery", max: 10, value: 2 }),
        makeSlot("Spare Cell", { key: "battery", max: 4, value: 4 })
      ];

      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "any", resourceKey: "battery" },
        5
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.deductions, [
        { slotIndex: 0, resourceKey: "battery", amount: 2 },
        { slotIndex: 1, resourceKey: "battery", amount: 3 }
      ]);

      const first = ItemResolver.expandSnapshot(plan.updatedSlots[0]._gemData);
      const second = ItemResolver.expandSnapshot(plan.updatedSlots[1]._gemData);
      assert.equal(first.flags[Constants.MODULE_ID][Constants.FLAG_GEM_RESOURCE].value, 0);
      assert.equal(second.flags[Constants.MODULE_ID][Constants.FLAG_GEM_RESOURCE].value, 1);

      // Planning never mutates the original slots.
      const original = ItemResolver.expandSnapshot(slots[0]._gemData);
      assert.equal(original.flags[Constants.MODULE_ID][Constants.FLAG_GEM_RESOURCE].value, 2);
    });

    test("'any' only draws from gems providing the named resource", () => {
      const slots = [
        makeSlot("Mana Stone", { key: "magic", max: 5, value: 5 }),
        makeSlot("Battery Gem", { key: "battery", max: 10, value: 3 })
      ];

      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "any", resourceKey: "battery" },
        2
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.deductions, [{ slotIndex: 1, resourceKey: "battery", amount: 2 }]);
    });

    test("matches formula-safe resource slugs against names with spaces and punctuation", () => {
      const slots = [
        makeSlot("Soul Cell", { key: "Soul Harvest", max: 3, value: 3 }),
        makeSlot("Other Cell", { key: "other", max: 3, value: 3 })
      ];

      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "any", resourceKey: "soul-harvest" },
        2
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.deductions, [{ slotIndex: 0, resourceKey: "Soul Harvest", amount: 2 }]);
    });

    test("fails when the aggregated pool cannot cover the amount", () => {
      const slots = [makeSlot("Battery Gem", { key: "battery", max: 10, value: 3 })];
      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "any", resourceKey: "battery" },
        4
      );

      assert.equal(plan.ok, false);
      assert.equal(plan.reason, "insufficient-socket-charges");
    });

    test("skips gems already reserved for deferred removal", () => {
      const slots = [
        makeSlot("Cell A", { key: "battery", max: 1, value: 1, destroyOnEmpty: true }),
        makeSlot("Cell B", { key: "battery", max: 1, value: 1, destroyOnEmpty: true })
      ];
      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "any", resourceKey: "battery" },
        1,
        { excluded: new Set([0]) }
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.deductions, [{ slotIndex: 1, resourceKey: "battery", amount: 1 }]);
    });

    test("subtracts charges reserved by an overlapping use", () => {
      const slots = [makeSlot("Cell", { key: "battery", max: 1, value: 1 })];
      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "any", resourceKey: "battery" },
        1,
        { reserved: new Map([[0, 1]]) }
      );

      assert.equal(plan.ok, false);
      assert.equal(plan.reason, "insufficient-socket-charges");
    });

    test("sourceSlot consumes the originating gem's own resource (implied key)", () => {
      const slots = [
        makeSlot("Battery Gem", { key: "battery", max: 10, value: 5 }),
        makeSlot("Mana Stone", { key: "magic", max: 4, value: 4 })
      ];

      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "sourceSlot" },
        2,
        { sourceSlotIndex: 1 }
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.deductions, [{ slotIndex: 1, resourceKey: "magic", amount: 2 }]);
    });

    test("sourceSlot blocks usage when the originating gem is gone", () => {
      const missing = GemResourceService.planChargeConsumption(
        [emptySlot()],
        { mode: "sourceSlot" },
        1,
        { sourceSlotIndex: 0 }
      );
      assert.equal(missing.ok, false);
      assert.equal(missing.reason, "source-gem-missing");

      const noIndex = GemResourceService.planChargeConsumption(
        [emptySlot()],
        { mode: "sourceSlot" },
        1,
        { sourceSlotIndex: null }
      );
      assert.equal(noIndex.ok, false);
      assert.equal(noIndex.reason, "source-gem-missing");
    });

    test("gemName matches slots by gem name, slot targets one index", () => {
      const slots = [
        makeSlot("Battery Gem", { key: "battery", max: 10, value: 1 }),
        makeSlot("Battery Gem", { key: "battery", max: 10, value: 1 }),
        makeSlot("Mana Stone", { key: "magic", max: 10, value: 5 })
      ];

      const byName = GemResourceService.planChargeConsumption(
        slots,
        { mode: "gemName", gemName: "battery gem" },
        2
      );
      assert.equal(byName.ok, true);
      assert.deepEqual(byName.deductions.map((d) => d.slotIndex), [0, 1]);

      const bySlot = GemResourceService.planChargeConsumption(
        slots,
        { mode: "slot", slotIndex: 2 },
        2
      );
      assert.equal(bySlot.ok, true);
      assert.deepEqual(bySlot.deductions, [{ slotIndex: 2, resourceKey: "magic", amount: 2 }]);

      const badSlot = GemResourceService.planChargeConsumption(
        slots,
        { mode: "slot", slotIndex: 9 },
        1
      );
      assert.equal(badSlot.ok, false);
      assert.equal(badSlot.reason, "invalid-consumption-slot");
    });

    test("a negative cost restores charges clamped at each gem's maximum", () => {
      const slots = [
        makeSlot("Battery Gem", { key: "battery", max: 10, value: 9 }),
        makeSlot("Spare Cell", { key: "battery", max: 4, value: 0 })
      ];

      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: "any", resourceKey: "battery" },
        -3
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.deductions, [
        { slotIndex: 0, resourceKey: "battery", amount: -1 },
        { slotIndex: 1, resourceKey: "battery", amount: -2 }
      ]);

      const first = ItemResolver.expandSnapshot(plan.updatedSlots[0]._gemData);
      const second = ItemResolver.expandSnapshot(plan.updatedSlots[1]._gemData);
      assert.equal(first.flags[Constants.MODULE_ID][Constants.FLAG_GEM_RESOURCE].value, 10);
      assert.equal(second.flags[Constants.MODULE_ID][Constants.FLAG_GEM_RESOURCE].value, 2);
    });

    test("rejects an unconfigured target", () => {
      const plan = GemResourceService.planChargeConsumption(
        [makeSlot("Battery Gem", { key: "battery", max: 10, value: 3 })],
        null,
        1
      );
      assert.equal(plan.ok, false);
      assert.equal(plan.reason, "invalid-consumption-target");
    });
  });

  describe("planGemConsumption", () => {
    test("consumes the requested number of matching gems", () => {
      const slots = [
        makeSlot("Battery Gem", null),
        makeSlot("Battery Gem", null),
        makeSlot("Mana Stone", null)
      ];

      const plan = GemResourceService.planGemConsumption(
        slots,
        { mode: "gemName", gemName: "Battery Gem" },
        2
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.removals, [0, 1]);
    });

    test("sourceSlot consumes the originating gem and fails when it is gone", () => {
      const plan = GemResourceService.planGemConsumption(
        [makeSlot("Battery Gem", null)],
        { mode: "sourceSlot" },
        1,
        { sourceSlotIndex: 0 }
      );

      assert.equal(plan.ok, true);
      assert.deepEqual(plan.removals, [0]);

      const missing = GemResourceService.planGemConsumption(
        [emptySlot()],
        { mode: "sourceSlot" },
        1,
        { sourceSlotIndex: 0 }
      );
      assert.equal(missing.ok, false);
      assert.equal(missing.reason, "source-gem-missing");
    });

    test("fails when there are not enough matching gems", () => {
      const plan = GemResourceService.planGemConsumption(
        [makeSlot("Battery Gem", null)],
        { mode: "gemName", gemName: "Battery Gem" },
        2
      );

      assert.equal(plan.ok, false);
      assert.equal(plan.reason, "insufficient-socket-gems");
    });

    test("skips slots already claimed by other consumption targets", () => {
      const plan = GemResourceService.planGemConsumption(
        [makeSlot("Battery Gem", null)],
        { mode: "gemName", gemName: "Battery Gem" },
        1,
        { excluded: new Set([0]) }
      );

      assert.equal(plan.ok, false);
      assert.equal(plan.reason, "insufficient-socket-gems");
    });
  });
});
