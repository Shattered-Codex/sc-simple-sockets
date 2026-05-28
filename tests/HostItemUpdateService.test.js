import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { HostItemUpdateService } from "../scripts/core/support/HostItemUpdateService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

describe("HostItemUpdateService", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("resolves actor-owned items from the actor collection", () => {
    const actor = createTestActor({
      items: [{ id: "host-1", name: "Sword", type: "weapon", includeActivitiesField: true }]
    });
    const detached = {
      id: "host-1",
      actor,
      parent: actor
    };

    assert.equal(HostItemUpdateService.resolve(detached), actor.items.get("host-1"));
  });

  test("updates actor-owned items through updateEmbeddedDocuments", async () => {
    const actor = createTestActor({
      items: [{ id: "host-1", name: "Sword", type: "weapon", includeActivitiesField: true }]
    });
    const item = actor.items.get("host-1");

    await HostItemUpdateService.update(item, {
      "system.quantity": 2,
      "flags.sc-simple-sockets.test": true
    });

    assert.equal(item.system.quantity, 2);
    assert.equal(item.flags["sc-simple-sockets"].test, true);
  });

  test("updates world items through constructor.updateDocuments", async () => {
    const item = createTestItem({
      id: "world-1",
      name: "World Sword",
      type: "weapon",
      includeActivitiesField: true
    });
    const calls = [];
    item.constructor = {
      async updateDocuments(updates, options) {
        calls.push({ updates, options });
        updates.forEach((update) => {
          if (update["system.quantity"] !== undefined) {
            item.system.quantity = update["system.quantity"];
          }
        });
        return [item];
      }
    };
    globalThis.game.items.set(item.id, item);

    await HostItemUpdateService.update(item, {
      "system.quantity": 4
    }, {
      parent: { id: "should-be-cleared" },
      parentUuid: "Actor.bad"
    });

    assert.equal(item.system.quantity, 4);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.parent, null);
    assert.equal(calls[0].options.parentUuid, null);
  });
});
