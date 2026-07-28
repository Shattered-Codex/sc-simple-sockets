import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { GemDetailsBuilder } from "../scripts/domain/gems/GemDetailsBuilder.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestItem } from "./support/testDocuments.js";

describe("GemDetailsBuilder +Details panes", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  const createGem = (moduleFlags = {}) => createTestItem({
    type: "loot",
    system: { type: { value: "gem" } },
    flags: {
      [Constants.MODULE_ID]: moduleFlags
    }
  });

  test("marks every pane as empty on a fresh gem", () => {
    const context = GemDetailsBuilder.buildContext(createGem());

    assert.equal(context.panes.combat.filled, false);
    assert.equal(context.panes.resource.filled, false);
    assert.equal(context.panes.tags.count, 0);
    assert.ok(context.panes.combat.label);
    assert.ok(context.panes.resource.label);
    assert.ok(context.panes.tags.label);
  });

  test("marks combat as filled when an attack/crit override is set", () => {
    const context = GemDetailsBuilder.buildContext(createGem({
      [Constants.FLAG_GEM_CRIT_THRESHOLD]: 19
    }));

    assert.equal(context.panes.combat.filled, true);
    assert.equal(context.panes.resource.filled, false);
  });

  test("marks combat as filled when extra damage entries exist", () => {
    const context = GemDetailsBuilder.buildContext(createGem({
      [Constants.FLAG_GEM_DAMAGE]: [{ number: 1, die: "d4", bonus: 0 }]
    }));

    assert.equal(context.panes.combat.filled, true);
  });

  test("marks resource as filled when a resource key is configured", () => {
    const context = GemDetailsBuilder.buildContext(createGem({
      [Constants.FLAG_GEM_RESOURCE]: { key: "battery", value: 2, max: 4 }
    }));

    assert.equal(context.panes.resource.filled, true);
    assert.equal(context.panes.combat.filled, false);
  });

  test("counts configured gem tags", () => {
    const context = GemDetailsBuilder.buildContext(createGem({
      [Constants.FLAG_GEM_TAGS]: ["poison", "radiant"]
    }));

    assert.equal(context.panes.tags.count, 2);
  });
});
