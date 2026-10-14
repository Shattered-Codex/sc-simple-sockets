import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { GemDetailsBuilder } from "../scripts/domain/gems/GemDetailsBuilder.js";
import { GemDamageService } from "../scripts/domain/gems/GemDamageService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestItem } from "./support/testDocuments.js";

describe("Gem damage formulas", () => {
  beforeEach(() => {
    installFoundryStubs({
      translations: {
        "Fire": "Fire",
        "Cold": "Cold"
      }
    });

    CONFIG.Dice = {
      DamageRoll: {
        denominations: ["d4", "d6", "d8", "d10"]
      }
    };
    CONFIG.DND5E = {
      damageTypes: {
        cold: "Cold",
        fire: "Fire"
      }
    };

    globalThis.Roll = {
      validate(formula) {
        return Boolean(formula) && formula !== "bad formula";
      }
    };
  });

  afterEach(() => {
    delete globalThis.Roll;
    clearFoundryStubs();
  });

  test("normalizes stored custom formula entries", () => {
    const gem = createTestItem({
      type: "loot",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_DAMAGE]: [
            {
              number: 2,
              die: "d4",
              bonus: 3,
              custom: {
                enabled: true,
                formula: "1d@scale.monk.martial-arts.faces"
              },
              types: ["fire"],
              activity: "attack"
            }
          ]
        }
      }
    });

    const [entry] = GemDetailsBuilder.getNormalizedDamageEntries(gem);

    assert.deepEqual(entry.custom, {
      enabled: true,
      formula: "1d@scale.monk.martial-arts.faces"
    });
    assert.equal(entry.number, 2);
    assert.equal(entry.die, "d4");
    assert.equal(entry.bonus, 3);
    assert.equal(entry.typeMode, "fixed");
    assert.deepEqual(entry.types, ["fire"]);
    assert.equal(entry.activity, "attack");
  });

  test("uses the custom formula when enabled", () => {
    const gem = createTestItem({
      id: "gem-1",
      name: "Monk Gem",
      img: "icons/monk-gem.webp",
      type: "loot",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_DAMAGE]: [
            {
              number: 1,
              die: "d4",
              bonus: 0,
              custom: {
                enabled: true,
                formula: "1d@scale.monk.martial-arts.faces"
              },
              types: ["fire"],
              activity: "any"
            }
          ]
        }
      }
    });
    const host = createTestItem({
      type: "weapon",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAGS.sockets]: [
            {
              _slot: 0,
              _gemData: gem.toObject()
            }
          ]
        }
      }
    });

    const [entry] = GemDamageService.collectGemDamage(host);

    assert.equal(entry.formula, "1d@scale.monk.martial-arts.faces");
    assert.deepEqual(entry.custom, {
      enabled: true,
      formula: "1d@scale.monk.martial-arts.faces"
    });
    assert.equal(entry.source.name, "Monk Gem");
  });

  test("crit multiplier does not create options on dnd5e damage configs", () => {
    const handlers = {};
    globalThis.Hooks.on = (name, handler) => { handlers[name] = handler; };
    const gem = createTestItem({
      type: "loot",
      flags: { [Constants.MODULE_ID]: { [Constants.FLAG_GEM_CRIT_MULTIPLIER]: 3 } }
    });
    const host = createTestItem({
      type: "weapon",
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAGS.sockets]: [{ _slot: 0, _gemData: gem.toObject() }]
        }
      }
    });
    const config = {
      subject: { item: host, type: "attack" },
      rolls: [{ parts: ["1d8"], options: { type: "slashing" } }]
    };

    GemDamageService.activate();
    try {
      handlers["dnd5e.preRollDamage"](config);
    } finally {
      GemDamageService.deactivate();
    }

    assert.equal(config.options, undefined);
    assert.equal(config.critical.multiplier, 3);
  });

  test("rejects invalid custom formulas", () => {
    assert.equal(GemDamageService.buildFormula({
      custom: {
        enabled: true,
        formula: "bad formula"
      }
    }), null);
  });
});
