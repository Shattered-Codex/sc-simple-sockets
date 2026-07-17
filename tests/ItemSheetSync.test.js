import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { ItemSheetSync } from "../scripts/core/support/ItemSheetSync.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

describe("ItemSheetSync", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("detects socket updates on nested and flattened paths", () => {
    assert.equal(ItemSheetSync.hasSocketUpdate({
      flags: {
        "sc-simple-sockets": {
          sockets: []
        }
      }
    }), true);

    assert.equal(ItemSheetSync.hasSocketUpdate({
      "flags.sc-simple-sockets.sockets.0.name": "Ruby"
    }), true);

    assert.equal(ItemSheetSync.hasSocketUpdate({ name: "Sword" }), false);
  });

  test("resolves embedded items from actor collections", () => {
    const actor = createTestActor({
      items: [{ id: "host-1", name: "Sword", type: "weapon", includeActivitiesField: true }]
    });

    const detached = {
      id: "host-1",
      uuid: "Item.host-1",
      actor,
      parent: actor,
      documentName: "Item"
    };

    assert.equal(ItemSheetSync.resolve(detached), actor.items.get("host-1"));
  });

  test("refreshes matching open sheets with force render", () => {
    const actor = createTestActor({
      items: [{ id: "host-1", name: "Sword", type: "weapon", includeActivitiesField: true }]
    });
    const item = actor.items.get("host-1");

    const renders = [];
    const app = {
      rendered: true,
      document: item,
      render(force) {
        renders.push(force);
      }
    };

    ui.windows.sheet = app;
    ItemSheetSync.refreshOpenSheets(item, { force: true });

    assert.deepEqual(renders, [true]);
  });

  test("skips automatic sheet refresh when the update opts out", () => {
    const actor = createTestActor({
      items: [{ id: "host-1", name: "Sword", type: "weapon", includeActivitiesField: true }]
    });
    const item = actor.items.get("host-1");

    const calls = [];
    const originalRefresh = ItemSheetSync.refreshOpenSheets;
    const originalHooksOn = Hooks.on;
    let updateHandler = null;
    ItemSheetSync.refreshOpenSheets = (updatedItem) => {
      calls.push(updatedItem?.id ?? null);
    };
    Hooks.on = (hook, handler) => {
      if (hook === "updateItem") {
        updateHandler = handler;
      }
    };

    try {
      ItemSheetSync.activate();
      updateHandler(
        item,
        { "flags.sc-simple-sockets.sockets": [] },
        { "sc-simple-sockets": { skipItemSheetSync: true } }
      );
      assert.deepEqual(calls, []);
    } finally {
      ItemSheetSync.refreshOpenSheets = originalRefresh;
      Hooks.on = originalHooksOn;
    }
  });
});
