import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import {
  formatSocketTarget,
  getActivitySourceSlotIndex,
  parseSocketTarget
} from "../scripts/core/helpers/socketConsumptionConfig.js";

describe("socketConsumptionConfig", () => {
  describe("parseSocketTarget", () => {
    test("parses the sourceSlot shortcut", () => {
      assert.deepEqual(parseSocketTarget("sourceSlot"), { mode: "sourceSlot" });
      assert.deepEqual(parseSocketTarget("  sourceSlot  "), { mode: "sourceSlot" });
    });

    test("parses any with an explicit resource key", () => {
      assert.deepEqual(parseSocketTarget("any:battery"), { mode: "any", resourceKey: "battery" });
      assert.equal(parseSocketTarget("any:"), null);
    });

    test("parses slot indexes and rejects invalid ones", () => {
      assert.deepEqual(parseSocketTarget("slot:2"), { mode: "slot", slotIndex: 2 });
      assert.equal(parseSocketTarget("slot:-1"), null);
      assert.equal(parseSocketTarget("slot:abc"), null);
    });

    test("parses gem names, keeping colons inside the name", () => {
      assert.deepEqual(
        parseSocketTarget("gemName:Gema: a lendária"),
        { mode: "gemName", gemName: "Gema: a lendária" }
      );
      assert.equal(parseSocketTarget("gemName:"), null);
    });

    test("rejects unknown grammar", () => {
      assert.equal(parseSocketTarget(""), null);
      assert.equal(parseSocketTarget(null), null);
      assert.equal(parseSocketTarget("bogus:thing"), null);
    });
  });

  describe("formatSocketTarget", () => {
    test("round-trips through parseSocketTarget", () => {
      const specs = [
        { mode: "sourceSlot" },
        { mode: "any", resourceKey: "battery" },
        { mode: "slot", slotIndex: 3 },
        { mode: "gemName", gemName: "Battery Gem" }
      ];
      for (const spec of specs) {
        assert.deepEqual(parseSocketTarget(formatSocketTarget(spec)), spec);
      }
      assert.equal(formatSocketTarget({ mode: "bogus" }), "");
    });
  });

  describe("getActivitySourceSlotIndex", () => {
    test("resolves the slot recorded when the activity was transferred", () => {
      const activity = {
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAG_SOURCE_GEM]: { uuid: "Item.abc", slot: 2, sourceId: "xyz" }
          }
        }
      };

      assert.equal(getActivitySourceSlotIndex(activity), 2);
      assert.equal(getActivitySourceSlotIndex({ flags: {} }), null);
      assert.equal(getActivitySourceSlotIndex({
        flags: { [Constants.MODULE_ID]: { [Constants.FLAG_SOURCE_GEM]: { slot: -1 } } }
      }), null);
    });
  });
});
