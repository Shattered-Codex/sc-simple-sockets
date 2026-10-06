import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { GemBreakService } from "../scripts/domain/gems/GemBreakService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

const SERVICE_PATH = "../scripts/core/integrations/sc-more-activities/activities/gem-repair/"
  + "ScMoreActivitiesGemRepairActivityService.js";

function createActorWithGems(gems) {
  const actor = createTestActor({
    id: "actor-1",
    name: "Hero",
    items: gems.map((gem) => ({
      type: "loot",
      img: "icons/ruby.webp",
      ...gem,
      system: { quantity: 1, type: { value: "gem" }, ...(gem.system ?? {}) },
      flags: gem.broken === false
        ? {}
        : { [Constants.MODULE_ID]: { [Constants.FLAG_GEM_BROKEN]: true } }
    }))
  });

  // Real documents serialize their id as `_id` only.
  for (const item of actor.items) {
    const toObject = item.toObject.bind(item);
    item.toObject = () => {
      const data = toObject();
      delete data.id;
      return data;
    };
  }

  const rolls = [];
  actor.rollToolCheck = async (config) => {
    rolls.push(config);
    return [{ total: actor.nextRollTotal ?? 20 }];
  };
  return { actor, rolls };
}

function createActivity(actor, check = { type: "none" }) {
  return { actor, item: { actor }, repair: { check }, getRollData: () => ({}) };
}

describe("gem repair activity", () => {
  let Service;

  beforeEach(async () => {
    installFoundryStubs({
      settings: {
        [`${Constants.MODULE_ID}.${Constants.SETTING_GEM_LOOT_SUBTYPES}`]: ["gem"]
      }
    });
    foundry.applications.api = {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    };
    ({ ScMoreActivitiesGemRepairActivityService: Service } = await import(SERVICE_PATH));
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("refuses to run when the actor has no broken gems", () => {
    const { actor } = createActorWithGems([{ id: "gem-1", name: "Ruby", broken: false }]);

    assert.equal(Service.ensureRepairable(createActivity(actor)), false);
    assert.equal(Service.ensureRepairable(createActivity(null)), false);
  });

  test("repairs the only broken gem when no check is configured", async () => {
    const { actor, rolls } = createActorWithGems([{ id: "gem-1", name: "Ruby" }]);
    const activity = createActivity(actor);

    assert.equal(Service.ensureRepairable(activity), true);
    const result = await Service.execute(activity);

    assert.equal(result.ok, true);
    assert.equal(rolls.length, 0);
    assert.equal(GemBreakService.isBroken(actor.items.get("gem-1")), false);
  });

  test("rolls against the DC of the gem rarity and keeps the gem broken on a failure", async () => {
    const { actor, rolls } = createActorWithGems([
      { id: "gem-1", name: "Ruby", system: { rarity: "legendary" } }
    ]);
    const activity = createActivity(actor, {
      type: "tool",
      tool: "jeweler",
      dcMode: "rarity",
      rarity: { rare: 14, legendary: 21 }
    });

    actor.nextRollTotal = 20;
    const failed = await Service.execute(activity);
    assert.deepEqual(rolls, [{ tool: "jeweler", target: 21 }]);
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "repair-check-failed");
    assert.equal(GemBreakService.isBroken(actor.items.get("gem-1")), true);

    actor.nextRollTotal = 21;
    const repaired = await Service.execute(activity);
    assert.equal(repaired.ok, true);
    assert.equal(GemBreakService.isBroken(actor.items.get("gem-1")), false);
  });

  test("repairs one unit of a broken stack and leaves the rest broken", async () => {
    const { actor } = createActorWithGems([{ id: "gem-1", name: "Ruby", system: { quantity: 3 } }]);

    await Service.execute(createActivity(actor));

    const gems = Array.from(actor.items.values());
    const broken = gems.filter((gem) => GemBreakService.isBroken(gem));
    const intact = gems.filter((gem) => !GemBreakService.isBroken(gem));
    assert.equal(broken.length, 1);
    assert.equal(broken[0].system.quantity, 2);
    assert.equal(intact.length, 1);
    assert.equal(intact[0].system.quantity, 1);
  });

  test("serializes concurrent repairs without duplicating or losing stack units", async () => {
    const { actor } = createActorWithGems([{ id: "gem-1", name: "Ruby", system: { quantity: 3 } }]);
    const gem = actor.items.get("gem-1");
    await Promise.all([Service.repairOne(gem), Service.repairOne(gem)]);
    const gems = Array.from(actor.items.values());
    assert.equal(gems.find((item) => GemBreakService.isBroken(item)).system.quantity, 1);
    assert.equal(gems.filter((item) => !GemBreakService.isBroken(item))
      .reduce((total, item) => total + item.system.quantity, 0), 2);
  });

  test("restores the broken stack when creating the repaired gem fails", async () => {
    const { actor } = createActorWithGems([{ id: "gem-1", name: "Ruby", system: { quantity: 3 } }]);
    actor.createEmbeddedDocuments = async () => { throw new Error("Creation failed"); };
    const gem = actor.items.get("gem-1");
    await assert.rejects(Service.repairOne(gem), /Creation failed/);
    assert.equal(gem.system.quantity, 3);
    assert.equal(GemBreakService.isBroken(gem), true);
    assert.equal(actor.items.size, 1);
  });

  test("does not repair a gem removed from the inventory while a roll is pending", async () => {
    const { actor } = createActorWithGems([{ id: "gem-1", name: "Ruby" }]);
    actor.rollToolCheck = async () => {
      actor.items.delete("gem-1");
      return [{ total: 20 }];
    };
    const result = await Service.execute(createActivity(actor, { type: "tool", tool: "jeweler", dc: 15 }));
    assert.equal(result.ok, false);
    assert.equal(actor.items.size, 0);
  });
});
