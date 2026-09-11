import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { EffectService } from "../scripts/core/services/EffectService.js";
import { Dnd5eActivityCompatibility } from "../scripts/core/support/Dnd5eActivityCompatibility.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("EffectService activity references", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => clearFoundryStubs());

  for (const reference of [
    { _id: "source-effect" },
    { _id: "1234567890REMOTE", uuid: "Item.gem.ActiveEffect.source-effect" },
    { uuid: "Item.gem.ActiveEffect.source-effect" }
  ]) {
    test(`keeps an activity effect non-transferable: ${JSON.stringify(reference)}`, async () => {
      let created;
      const gem = {
        uuid: "Item.gem",
        effects: { contents: [{
          id: "source-effect",
          toObject: () => ({ _id: "source-effect", name: "On use", transfer: false })
        }] },
        system: { activities: { contents: [{ toObject: () => ({ effects: [reference] }) }] } }
      };
      const host = {
        uuid: "Item.host",
        async createEmbeddedDocuments(_type, data) {
          created = data;
          return [{ id: "copied-effect" }];
        }
      };
      const ids = await EffectService.applyGemEffects(host, 0, gem);
      assert.equal(created[0].transfer, false);
      assert.deepEqual(Dnd5eActivityCompatibility.remapEffectReference(reference, ids, gem), {
        _id: "copied-effect"
      });
    });
  }

  test("an external reference does not suppress a local passive effect with the same ID", async () => {
    let copied;
    const gem = {
      uuid: "Item.gem",
      effects: { contents: [{
        id: "shared-id", toObject: () => ({ name: "Passive", transfer: true })
      }] },
      system: { activities: { contents: [{ toObject: () => ({ effects: [
        { _id: "shared-id", uuid: "Item.other.ActiveEffect.shared-id" }
      ] }) }] } }
    };
    await EffectService.applyGemEffects({
      uuid: "Item.host",
      async createEmbeddedDocuments(_type, data) {
        copied = data[0];
        return [{ id: "copy" }];
      }
    }, 0, gem);
    assert.equal(copied.transfer, true);
  });
});
