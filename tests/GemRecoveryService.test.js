import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { GemRecoveryService } from "../scripts/core/services/GemRecoveryService.js";
import { GemResourceService } from "../scripts/domain/gems/GemResourceService.js";
import { SocketStore } from "../scripts/core/SocketStore.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

function makeSlot(name, resource) {
  const source = {
    name,
    img: "icons/gem.webp",
    type: "loot",
    system: { quantity: 1, type: { value: "gem" } },
    flags: resource
      ? { [Constants.MODULE_ID]: { [Constants.FLAG_GEM_RESOURCE]: resource } }
      : {}
  };

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

function makeHostActor(slots) {
  return createTestActor({
    items: [{
      id: "host-1",
      name: "Sword",
      type: "weapon",
      includeActivitiesField: true,
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAGS.sockets]: slots
        }
      }
    }]
  });
}

function hostItem(actor) {
  return actor.items.get("host-1");
}

function hostSlotResource(actor, index = 0) {
  const slots = hostItem(actor).getFlag(Constants.MODULE_ID, Constants.FLAGS.sockets);
  return GemResourceService.getSlotResource(slots[index]);
}

// Deterministic stand-in for CONFIG.Dice.BasicRoll: numeric formulas evaluate
// to themselves; dice formulas (e.g. the recharge "1d6") use `nextTotal`.
// `lastData` records the roll data handed to the most recent roll, `gate` is
// an optional promise every evaluation awaits (so tests can interleave writes
// while a roll is pending), and `alter` mirrors the dnd5e gritty multiplier.
class StubRoll {
  static nextTotal = null;
  static lastData = null;
  static gate = null;

  constructor(formula, data) {
    this.formula = formula;
    this.data = data;
    this.multiplier = 1;
    StubRoll.lastData = data;
  }

  alter(multiply, _add, _options) {
    this.multiplier = multiply;
    return this;
  }

  async evaluate() {
    if (StubRoll.gate) {
      await StubRoll.gate;
    }
    const parsed = Number(this.formula);
    if (Number.isFinite(parsed)) {
      this.total = parsed * this.multiplier;
    } else if (StubRoll.nextTotal !== null) {
      this.total = StubRoll.nextTotal;
    } else {
      throw new Error(`invalid formula ${this.formula}`);
    }
    return this;
  }
}

describe("GemRecoveryService", () => {
  let stubs;

  beforeEach(() => {
    stubs = installFoundryStubs();
    globalThis.CONFIG.DND5E = {
      restTypes: {
        short: { recoverPeriods: ["sr"] },
        long: { recoverPeriods: ["lr", "sr"] }
      }
    };
    globalThis.CONFIG.Dice = { BasicRoll: StubRoll };
    StubRoll.nextTotal = null;
    StubRoll.lastData = null;
    StubRoll.gate = null;
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  describe("restPeriods", () => {
    test("mirrors the rest type's recover periods plus the daily periods on a new day", () => {
      assert.deepEqual(
        Array.from(GemRecoveryService.restPeriods({ type: "short" })),
        ["sr"]
      );
      assert.deepEqual(
        Array.from(GemRecoveryService.restPeriods({ type: "long" })),
        ["lr", "sr"]
      );
      assert.deepEqual(
        Array.from(GemRecoveryService.restPeriods({ type: "long", newDay: true })),
        ["lr", "sr", "day", "dawn", "dusk"]
      );
    });
  });

  test("a long rest fully restores a socketed gem without a formula", async () => {
    const actor = makeHostActor([
      makeSlot("Battery Gem", {
        key: "battery", max: 10, value: 3, recovery: { period: "lr", formula: "" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "long" });

    assert.equal(hostSlotResource(actor).value, 10);
  });

  test("a long rest also recovers short-rest gems, but not the reverse", async () => {
    const slots = [
      makeSlot("Short Gem", {
        key: "battery", max: 4, value: 0, recovery: { period: "sr", formula: "" }
      }),
      makeSlot("Long Gem", {
        key: "magic", max: 4, value: 0, recovery: { period: "lr", formula: "" }
      })
    ];

    const shortRested = makeHostActor(slots);
    await GemRecoveryService.recoverRestCharges(shortRested, { type: "short" });
    assert.equal(hostSlotResource(shortRested, 0).value, 4);
    assert.equal(hostSlotResource(shortRested, 1).value, 0);

    const longRested = makeHostActor(slots);
    await GemRecoveryService.recoverRestCharges(longRested, { type: "long" });
    assert.equal(hostSlotResource(longRested, 0).value, 4);
    assert.equal(hostSlotResource(longRested, 1).value, 4);
  });

  test("dawn gems recover when the rest starts a new day", async () => {
    const slots = [
      makeSlot("Dawn Gem", {
        key: "magic", max: 6, value: 1, recovery: { period: "dawn", formula: "" }
      })
    ];

    const sameDay = makeHostActor(slots);
    await GemRecoveryService.recoverRestCharges(sameDay, { type: "long" });
    assert.equal(hostSlotResource(sameDay).value, 1);

    const newDay = makeHostActor(slots);
    await GemRecoveryService.recoverRestCharges(newDay, { type: "long", newDay: true });
    assert.equal(hostSlotResource(newDay).value, 6);
  });

  test("a recovery formula restores a rolled amount clamped at the maximum", async () => {
    const actor = makeHostActor([
      makeSlot("Trickle Gem", {
        key: "battery", max: 10, value: 3, recovery: { period: "sr", type: "formula", formula: "2" }
      }),
      makeSlot("Nearly Full Gem", {
        key: "battery", max: 10, value: 9, recovery: { period: "sr", type: "formula", formula: "2" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "short" });

    assert.equal(hostSlotResource(actor, 0).value, 5);
    assert.equal(hostSlotResource(actor, 1).value, 10);
  });

  test("the loseAll type drains charges when the period triggers", async () => {
    const actor = makeHostActor([
      makeSlot("Waning Gem", {
        key: "magic", max: 6, value: 4, recovery: { period: "day", type: "loseAll", formula: "" }
      }),
      makeSlot("Already Empty Gem", {
        key: "magic", max: 6, value: 0, recovery: { period: "day", type: "loseAll", formula: "" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "long", newDay: true });

    assert.equal(hostSlotResource(actor, 0).value, 0);
    assert.equal(hostSlotResource(actor, 1).value, 0);
  });

  test("a socketed gem's formula rolls with the gem snapshot as @item and the host as @host", async () => {
    const actor = makeHostActor([
      makeSlot("Trickle Gem", {
        key: "battery", max: 10, value: 3, recovery: { period: "sr", type: "formula", formula: "2" }
      })
    ]);
    hostItem(actor).getRollData = () => ({
      abilities: { int: { mod: 3 } },
      item: { hostOnly: true }
    });

    await GemRecoveryService.recoverRestCharges(actor, { type: "short" });

    assert.equal(hostSlotResource(actor).value, 5);
    assert.deepEqual(StubRoll.lastData, {
      abilities: { int: { mod: 3 } },
      host: { hostOnly: true },
      item: { quantity: 1, type: { value: "gem" } }
    });
  });

  test("a loose gem's formula rolls with the gem's own roll data", async () => {
    const actor = createTestActor({
      items: [{
        id: "gem-1",
        name: "Loose Battery",
        type: "loot",
        system: { type: { value: "gem" } },
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAG_GEM_RESOURCE]: {
              key: "battery", max: 8, value: 2, recovery: { period: "lr", type: "formula", formula: "2" }
            }
          }
        }
      }]
    });
    const gem = actor.items.get("gem-1");
    gem.getRollData = () => ({ item: { gemOnly: true } });

    await GemRecoveryService.recoverRestCharges(actor, { type: "long" });

    assert.equal(GemResourceService.getGemResource(gem).value, 4);
    assert.deepEqual(StubRoll.lastData, { item: { gemOnly: true } });
  });

  test("a negative formula total drains charges, mirroring dnd5e", async () => {
    const actor = makeHostActor([
      makeSlot("Leaking Gem", {
        key: "battery", max: 10, value: 3, recovery: { period: "sr", type: "formula", formula: "-2" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "short" });

    assert.equal(hostSlotResource(actor).value, 1);
  });

  test("daily formulas recover sevenfold under the gritty realism rest variant", async () => {
    stubs.settingsStore.set("dnd5e.restVariant", "gritty");
    const actor = makeHostActor([
      makeSlot("Dawn Trickle Gem", {
        key: "magic", max: 20, value: 1, recovery: { period: "dawn", type: "formula", formula: "2" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "long", newDay: true });

    assert.equal(hostSlotResource(actor).value, 15);
  });

  test("the recoverDailyUses rest flag recovers daily gems without a new day", async () => {
    const actor = makeHostActor([
      makeSlot("Dawn Gem", {
        key: "magic", max: 6, value: 1, recovery: { period: "dawn", formula: "" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "short", recoverDailyUses: true });

    assert.equal(hostSlotResource(actor).value, 6);
  });

  test("recovery does not clobber slot changes made while its rolls were pending", async () => {
    const actor = makeHostActor([
      makeSlot("Trickle Gem", {
        key: "battery", max: 10, value: 3, recovery: { period: "sr", type: "formula", formula: "2" }
      }),
      makeSlot("Consumed Gem", { key: "magic", max: 6, value: 5 })
    ]);
    const item = hostItem(actor);

    let release;
    StubRoll.gate = new Promise((resolve) => { release = resolve; });
    const recovery = GemRecoveryService.recoverRestCharges(actor, { type: "short" });

    // A use consumes charges from the second gem while the formula roll waits.
    const slots = SocketStore.getSlots(item);
    slots[1] = GemResourceService.withSlotResourceValue(slots[1], 1);
    await SocketStore.setSlots(item, slots);

    release();
    await recovery;

    assert.equal(hostSlotResource(actor, 0).value, 5);
    assert.equal(hostSlotResource(actor, 1).value, 1);
  });

  test("a planned recovery is dropped when the slot's gem changed before the write", async () => {
    const actor = makeHostActor([
      makeSlot("Trickle Gem", {
        key: "battery", max: 10, value: 3, recovery: { period: "sr", type: "formula", formula: "2" }
      })
    ]);
    const item = hostItem(actor);

    let release;
    StubRoll.gate = new Promise((resolve) => { release = resolve; });
    const recovery = GemRecoveryService.recoverRestCharges(actor, { type: "short" });

    // The gem is swapped while the formula roll waits.
    const slots = SocketStore.getSlots(item);
    slots[0] = makeSlot("Other Gem", { key: "other", max: 4, value: 0 });
    await SocketStore.setSlots(item, slots);

    release();
    await recovery;

    assert.equal(hostSlotResource(actor).key, "other");
    assert.equal(hostSlotResource(actor).value, 0);
  });

  test("a formula type without a formula does nothing", async () => {
    const actor = makeHostActor([
      makeSlot("Unset Gem", {
        key: "magic", max: 6, value: 1, recovery: { period: "lr", type: "formula", formula: "" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "long" });

    assert.equal(hostSlotResource(actor).value, 1);
  });

  test("combat periods recover through recoverCombatCharges", async () => {
    const actor = makeHostActor([
      makeSlot("Turn Gem", {
        key: "battery", max: 5, value: 0, recovery: { period: "turnStart", formula: "" }
      }),
      makeSlot("Initiative Gem", {
        key: "magic", max: 5, value: 0, recovery: { period: "initiative", formula: "" }
      })
    ]);

    await GemRecoveryService.recoverCombatCharges(actor, ["turn", "turnStart"]);

    assert.equal(hostSlotResource(actor, 0).value, 5);
    assert.equal(hostSlotResource(actor, 1).value, 0);
  });

  test("recovers loose gems carried in the inventory", async () => {
    const actor = createTestActor({
      items: [{
        id: "gem-1",
        name: "Loose Battery",
        type: "loot",
        system: { type: { value: "gem" } },
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAG_GEM_RESOURCE]: {
              key: "battery", max: 8, value: 2, recovery: { period: "lr", formula: "" }
            }
          }
        }
      }]
    });

    await GemRecoveryService.recoverRestCharges(actor, { type: "long" });

    const resource = GemResourceService.getGemResource(actor.items.get("gem-1"));
    assert.equal(resource.value, 8);
  });

  test("ignores gems without recovery and gems already at their maximum", async () => {
    const actor = makeHostActor([
      makeSlot("Manual Gem", { key: "battery", max: 5, value: 1 }),
      makeSlot("Full Gem", {
        key: "magic", max: 5, value: 5, recovery: { period: "lr", formula: "" }
      })
    ]);
    const item = hostItem(actor);

    let calls = 0;
    const originalUpdate = actor.updateEmbeddedDocuments.bind(actor);
    actor.updateEmbeddedDocuments = async (...args) => {
      calls += 1;
      return originalUpdate(...args);
    };

    await GemRecoveryService.recoverRestCharges(actor, { type: "long" });

    assert.equal(calls, 0);
    const slots = item.getFlag(Constants.MODULE_ID, Constants.FLAGS.sockets);
    assert.equal(GemResourceService.getSlotResource(slots[0]).value, 1);
    assert.equal(GemResourceService.getSlotResource(slots[1]).value, 5);
  });

  test("an invalid formula is skipped without aborting other gems", async () => {
    const actor = makeHostActor([
      makeSlot("Broken Gem", {
        key: "battery", max: 5, value: 1, recovery: { period: "lr", type: "formula", formula: "not-a-roll" }
      }),
      makeSlot("Good Gem", {
        key: "magic", max: 5, value: 1, recovery: { period: "lr", formula: "" }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "long" });

    assert.equal(hostSlotResource(actor, 0).value, 1);
    assert.equal(hostSlotResource(actor, 1).value, 5);
  });

  test("gems with the recharge period never recover automatically", async () => {
    const actor = makeHostActor([
      makeSlot("Recharge Gem", {
        key: "magic", max: 6, value: 1, recovery: { period: "recharge", threshold: 5 }
      })
    ]);

    await GemRecoveryService.recoverRestCharges(actor, { type: "long", newDay: true });
    await GemRecoveryService.recoverCombatCharges(actor, ["turn", "turnStart", "turnEnd", "initiative"]);

    assert.equal(hostSlotResource(actor).value, 1);
  });

  describe("recharge checks", () => {
    test("rechargeThreshold reads the threshold and defaults to 6", () => {
      const resource = (threshold) => ({ recovery: { threshold } });
      assert.equal(GemRecoveryService.rechargeThreshold(resource(5)), 5);
      assert.equal(GemRecoveryService.rechargeThreshold(resource(undefined)), 6);
      assert.equal(GemRecoveryService.rechargeThreshold(resource(9)), 6);
      assert.equal(GemRecoveryService.rechargeThreshold(resource(0)), 1);
    });

    test("a successful slot recharge refills the socketed gem", async () => {
      const actor = makeHostActor([
        makeSlot("Recharge Gem", {
          key: "magic", max: 6, value: 1, recovery: { period: "recharge", threshold: 5 }
        })
      ]);
      StubRoll.nextTotal = 5;

      const check = await GemRecoveryService.rollSlotRecharge(hostItem(actor), 0);

      assert.equal(check.success, true);
      assert.equal(check.threshold, 5);
      assert.equal(hostSlotResource(actor).value, 6);
    });

    test("a successful recharge with the formula type restores the rolled amount", async () => {
      const actor = makeHostActor([
        makeSlot("Trickle Recharge Gem", {
          key: "magic", max: 6, value: 1,
          recovery: { period: "recharge", type: "formula", formula: "2", threshold: 5 }
        })
      ]);
      StubRoll.nextTotal = 6;

      const check = await GemRecoveryService.rollSlotRecharge(hostItem(actor), 0);

      assert.equal(check.success, true);
      assert.equal(hostSlotResource(actor).value, 3);
    });

    test("a failed slot recharge leaves the charges untouched", async () => {
      const actor = makeHostActor([
        makeSlot("Recharge Gem", {
          key: "magic", max: 6, value: 1, recovery: { period: "recharge", threshold: 5 }
        })
      ]);
      StubRoll.nextTotal = 4;

      const check = await GemRecoveryService.rollSlotRecharge(hostItem(actor), 0);

      assert.equal(check.success, false);
      assert.equal(hostSlotResource(actor).value, 1);
    });

    test("rollItemRecharge refills a loose gem on success", async () => {
      const actor = createTestActor({
        items: [{
          id: "gem-1",
          name: "Loose Recharge Gem",
          type: "loot",
          system: { type: { value: "gem" } },
          flags: {
            [Constants.MODULE_ID]: {
              [Constants.FLAG_GEM_RESOURCE]: {
                key: "magic", max: 4, value: 0, recovery: { period: "recharge", formula: "" }
              }
            }
          }
        }]
      });
      StubRoll.nextTotal = 6;

      const check = await GemRecoveryService.rollItemRecharge(actor.items.get("gem-1"));

      assert.equal(check.success, true);
      const resource = GemResourceService.getGemResource(actor.items.get("gem-1"));
      assert.equal(resource.value, 4);
    });

    test("returns null for gems without the recharge period or already full", async () => {
      const actor = makeHostActor([
        makeSlot("Rest Gem", {
          key: "magic", max: 6, value: 1, recovery: { period: "lr", formula: "" }
        }),
        makeSlot("Full Recharge Gem", {
          key: "magic", max: 6, value: 6, recovery: { period: "recharge", threshold: 5 }
        })
      ]);

      assert.equal(await GemRecoveryService.rollSlotRecharge(hostItem(actor), 0), null);
      assert.equal(await GemRecoveryService.rollSlotRecharge(hostItem(actor), 1), null);
      assert.equal(await GemRecoveryService.rollSlotRecharge(hostItem(actor), 9), null);
    });
  });
});
