import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Dnd5eActivityCompatibility } from "../scripts/core/support/Dnd5eActivityCompatibility.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("Dnd5eActivityCompatibility", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("remaps dnd5e 6 activity effect UUIDs to the copied host effect", () => {
    const effectIdMap = new Map([["gem-effect", "host-effect"]]);
    const sourceItem = { uuid: "Actor.actor-1.Item.gem-1" };

    const result = Dnd5eActivityCompatibility.remapEffectReference({
      _id: "1234567890REMOTE",
      uuid: "Actor.actor-1.Item.gem-1.ActiveEffect.gem-effect",
      level: { min: 1, max: null }
    }, effectIdMap, sourceItem);

    assert.deepEqual(result, {
      _id: "host-effect",
      level: { min: 1, max: null }
    });
  });

  test("remaps a UUID-only dnd5e 6 activity effect reference", () => {
    const effectIdMap = new Map([["gem-effect", "host-effect"]]);
    const sourceItem = { uuid: "Actor.actor-1.Item.gem-1" };

    const result = Dnd5eActivityCompatibility.remapEffectReference({
      uuid: "Actor.actor-1.Item.gem-1.ActiveEffect.gem-effect"
    }, effectIdMap, sourceItem);

    assert.deepEqual(result, {
      _id: "host-effect"
    });
  });

  test("preserves external UUIDs even when their effect ID matches a local effect", () => {
    const reference = { _id: "gem-effect", uuid: "Item.other.ActiveEffect.gem-effect" };
    const result = Dnd5eActivityCompatibility.remapEffectReference(
      reference, new Map([["gem-effect", "copied"]]), { uuid: "Item.gem" }
    );
    assert.deepEqual(result, reference);
  });

  test("remaps legacy local references without mutating the source", () => {
    const reference = { _id: "gem-effect", level: { min: 1 } };
    const result = Dnd5eActivityCompatibility.remapEffectReference(
      reference, new Map([["gem-effect", "copied"]]), { uuid: "Item.gem" }
    );
    assert.deepEqual(result, { _id: "copied", level: { min: 1 } });
    assert.equal(reference._id, "gem-effect");
  });
});
