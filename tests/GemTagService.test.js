import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { GemDetailsBuilder } from "../scripts/domain/gems/GemDetailsBuilder.js";
import { GemTagService } from "../scripts/domain/gems/GemTagService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestItem } from "./support/testDocuments.js";

describe("GemTagService", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("normalizes tags into stable identifiers while preserving order", () => {
    assert.deepEqual(
      GemTagService.normalizeTags([" Poison ", "Ácido Arcano", "poison", "", "Holy.Light"]),
      ["poison", "acido-arcano", "holy.light"]
    );
  });

  test("reads numeric form objects and comma-separated values", () => {
    assert.deepEqual(
      GemTagService.normalizeTags({ 2: "Radiant", 0: "Piercing", 1: "Poison" }),
      ["piercing", "poison", "radiant"]
    );
    assert.deepEqual(
      GemTagService.normalizeTags("Piercing, Poison, Radiant"),
      ["piercing", "poison", "radiant"]
    );
    assert.deepEqual(
      GemTagService.normalizeTags(new Set(["Poison", "Radiant"])),
      ["poison", "radiant"]
    );
  });

  test("reads flags and compares condition input with the same normalization", () => {
    const gem = createTestItem({
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_TAGS]: ["poison", "acido-arcano"]
        }
      }
    });

    assert.deepEqual(GemTagService.getTags(gem), ["poison", "acido-arcano"]);
    assert.equal(GemTagService.hasTag(gem, " POISON "), true);
    assert.equal(GemTagService.hasTag(gem, "Ácido Arcano"), true);
    assert.equal(GemTagService.hasTag(gem, "radiant"), false);
  });

  test("adds the tag editor data to the +Details context", () => {
    const gem = createTestItem({
      type: "loot",
      system: { type: { value: "gem" } },
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_TAGS]: ["poison", "radiant"]
        }
      }
    });

    const context = GemDetailsBuilder.buildContext(gem);

    assert.equal(context.isGem, true);
    assert.deepEqual(context.tags.entries, ["poison", "radiant"]);
    assert.equal(context.tags.value, "poison,radiant");
    assert.equal(context.tags.name, `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_TAGS}`);
    assert.match(context.tags.tooltip, /hasGemTag/);
  });
});
