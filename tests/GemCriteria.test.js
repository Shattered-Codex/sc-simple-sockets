import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { GemCriteria } from "../scripts/domain/gems/GemCriteria.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("GemCriteria", () => {
  beforeEach(() => {
    installFoundryStubs({
      settings: {
        [`${Constants.MODULE_ID}.${Constants.SETTING_GEM_LOOT_SUBTYPES}`]: ["gem", "rune"]
      }
    });
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("matches loot items by configured subtype", () => {
    assert.equal(
      GemCriteria.matches({
        documentName: "Item",
        type: "loot",
        system: {
          type: {
            value: "Rune"
          }
        }
      }),
      true
    );

    assert.equal(
      GemCriteria.matches({
        documentName: "Item",
        type: "weapon",
        system: {
          type: {
            value: "gem"
          }
        }
      }),
      false
    );
  });

  test("falls back to stored gem subtype flags", () => {
    assert.equal(
      GemCriteria.resolveGemSubtype({
        type: "loot",
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAG_GEM_SUBTYPE]: "gem"
          }
        }
      }),
      "gem"
    );
  });

  test("detects type updates on item type and subtype paths", () => {
    assert.equal(GemCriteria.hasTypeUpdate({ type: "loot" }), true);
    assert.equal(GemCriteria.hasTypeUpdate({ system: { type: { value: "gem" } } }), true);
    assert.equal(GemCriteria.hasTypeUpdate({ "system.type.subtype": "gem" }), true);
    assert.equal(GemCriteria.hasTypeUpdate({ name: "Ruby" }), false);
  });
});
