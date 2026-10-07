import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { GemCheckService } from "../scripts/core/services/GemCheckService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("GemCheckService", () => {
  let originalDnd5e;
  let originalRoll;

  beforeEach(() => {
    installFoundryStubs();
    originalDnd5e = globalThis.dnd5e;
    originalRoll = globalThis.Roll;
    const evaluateFormula = (formula, data) => {
      const replaced = String(formula).replace(/@([\w.]+)/g, (_match, path) => {
        const value = path.split(".").reduce((scope, key) => scope?.[key], data);
        return Number.isFinite(Number(value)) ? String(Number(value)) : "0";
      });
      if (!/^[\d\s+\-*/().]+$/.test(replaced)) {
        throw new Error(`Unresolved formula: ${formula}`);
      }
      return Function(`"use strict"; return (${replaced});`)();
    };
    globalThis.Roll = class {
      constructor(formula, data) {
        this.formula = formula;
        this.data = data;
        this.isDeterministic = !/\d+d\d+/i.test(formula);
      }
      evaluateSync() {
        this.total = evaluateFormula(this.formula, this.data);
        return this;
      }
    };
    // dnd5e's helper silently returns zero for invalid or random formulas.
    globalThis.dnd5e = {
      utils: {
        simplifyBonus(formula, data) {
          try {
            return evaluateFormula(formula, data);
          } catch {
            return 0;
          }
        }
      }
    };
  });

  afterEach(() => {
    globalThis.dnd5e = originalDnd5e;
    globalThis.Roll = originalRoll;
    clearFoundryStubs();
  });

  test("parseCheckId reads compact ids and falls back to a flat d20", () => {
    assert.deepEqual(GemCheckService.parseCheckId("tool:jeweler"), { type: "tool", key: "jeweler" });
    assert.deepEqual(GemCheckService.parseCheckId("skill:slt"), { type: "skill", key: "slt" });
    assert.deepEqual(GemCheckService.parseCheckId("flat"), { type: "flat", key: "" });
    assert.deepEqual(GemCheckService.parseCheckId("skill:"), { type: "flat", key: "" });
    assert.deepEqual(GemCheckService.parseCheckId("nonsense"), { type: "flat", key: "" });
    assert.equal(GemCheckService.formatCheckId({ type: "ability", key: "dex" }), "ability:dex");
    assert.equal(GemCheckService.formatCheckId({ type: "flat", key: "" }), "flat");
  });

  test("resolveDc supports a fixed DC", () => {
    assert.equal(GemCheckService.resolveDc({ mode: "fixed", value: 17 }), 17);
    assert.equal(GemCheckService.resolveDc({ mode: "fixed", value: -3 }), 0);
    assert.equal(GemCheckService.resolveDc({ mode: "fixed", value: "abc" }), GemCheckService.DEFAULT_DC);
  });

  test("resolveDc looks the DC up by gem rarity", () => {
    const config = { mode: "rarity", rarity: { none: 8, rare: 16, legendary: 22 } };

    assert.equal(GemCheckService.resolveDc(config, { gem: { system: { rarity: "rare" } } }), 16);
    assert.equal(GemCheckService.resolveDc(config, { gem: { system: { rarity: "legendary" } } }), 22);
    assert.equal(GemCheckService.resolveDc(config, { gem: { system: { rarity: "" } } }), 8);
    // Rarities missing from the table use the module defaults.
    assert.equal(
      GemCheckService.resolveDc(config, { gem: { system: { rarity: "uncommon" } } }),
      GemCheckService.DEFAULT_RARITY_DCS.uncommon
    );
  });

  test("resolveDc evaluates a formula with @gem.rarity and roll data", () => {
    const gem = { system: { rarity: "veryRare" } };

    assert.equal(GemCheckService.resolveDc({ mode: "formula", formula: "10 + 2 * @gem.rarity" }, { gem }), 18);
    assert.equal(
      GemCheckService.resolveDc({ mode: "formula", formula: "8 + @prof" }, { gem, rollData: { prof: 3 } }),
      11
    );
    assert.equal(GemCheckService.resolveDc({ mode: "formula", formula: "14" }, { gem }), 14);
  });

  test("resolveDc returns null when a formula cannot be resolved", () => {
    assert.equal(GemCheckService.resolveDc({ mode: "formula", formula: "" }), null);
    assert.equal(GemCheckService.resolveDc({ mode: "formula", formula: "1d6 + oops" }), null);
    assert.equal(GemCheckService.resolveDc({ mode: "formula", formula: "1d6" }), null);
    assert.equal(GemCheckService.resolveDc({ mode: "formula", formula: "oops" }), null);
  });

  test("roll delegates to the matching dnd5e actor roll and compares against the DC", async () => {
    const calls = [];
    const actor = {
      async rollToolCheck(config) {
        calls.push(["tool", config]);
        return [{ total: 14 }];
      },
      async rollSkill(config) {
        calls.push(["skill", config]);
        return [{ total: 15 }];
      },
      async rollAbilityCheck() {
        return null;
      }
    };

    const failed = await GemCheckService.roll({ actor, check: { type: "tool", key: "jeweler" }, dc: 15 });
    assert.deepEqual(failed, { ok: true, success: false, total: 14, dc: 15 });

    const passed = await GemCheckService.roll({ actor, check: { type: "skill", key: "slt" }, dc: 15 });
    assert.deepEqual(passed, { ok: true, success: true, total: 15, dc: 15 });

    assert.deepEqual(calls, [
      ["tool", { tool: "jeweler", target: 15 }],
      ["skill", { skill: "slt", target: 15 }]
    ]);

    const cancelled = await GemCheckService.roll({ actor, check: { type: "ability", key: "dex" }, dc: 15 });
    assert.deepEqual(cancelled, { ok: false, reason: "roll-cancelled" });
  });

  test("roll needs an actor for ability, skill and tool checks", async () => {
    const result = await GemCheckService.roll({ actor: null, check: { type: "skill", key: "slt" }, dc: 10 });
    assert.deepEqual(result, { ok: false, reason: "no-actor" });
  });
});
