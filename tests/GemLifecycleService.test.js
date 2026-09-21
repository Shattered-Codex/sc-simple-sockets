import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GemLifecycleService } from "../scripts/domain/gems/GemLifecycleService.js";
import { clearFoundryStubs, installFoundryStubs, mergeObject, setProperty } from "./support/foundryStubs.js";
import { createTestItem } from "./support/testDocuments.js";

function createStoreSpies() {
  const calls = [];
  const makeStore = (name) => ({
    async stash() {
      calls.push(`${name}.stash`);
    },
    async removeAll() {
      calls.push(`${name}.removeAll`);
    },
    async restore() {
      calls.push(`${name}.restore`);
    }
  });

  return {
    activityStore: makeStore("activity"),
    effectStore: makeStore("effect"),
    calls
  };
}

function createLifecycle() {
  const spies = createStoreSpies();
  return {
    lifecycle: new GemLifecycleService(spies),
    calls: spies.calls
  };
}

function createLoot(subtype) {
  return createTestItem({
    type: "loot",
    system: { type: { value: subtype } }
  });
}

function transitionOptions(wasGem, willBeGem) {
  return {
    "sc-simple-sockets": {
      gemTransition: { wasGem, willBeGem }
    }
  };
}

function expandObject(source) {
  const expanded = {};
  for (const [path, value] of Object.entries(source ?? {})) {
    setProperty(expanded, path, value && typeof value === "object" && !Array.isArray(value)
      ? expandObject(value)
      : structuredClone(value));
  }
  return expanded;
}

function mergeUpdate(original, changes, { inplace = true, recursive = true } = {}) {
  const target = inplace ? original : structuredClone(original);
  const expanded = expandObject(changes);
  return recursive ? mergeObject(target, expanded) : Object.assign(target, expanded);
}

function snapshotOptions(extra = {}) {
  return { ...extra, "sc-simple-sockets": { skipGemLifecycle: true } };
}

async function applyLifecycleUpdate(lifecycle, item, changes, options = {}) {
  lifecycle.handlePreUpdate(item, changes, options);
  Object.assign(item, mergeUpdate(item.toObject(), changes, { ...options, inplace: false }));
  await lifecycle.handleItemUpdated(item, changes, options);
}

describe("GemLifecycleService item updates", () => {
  beforeEach(() => {
    installFoundryStubs();
    // Foundry expands dotted update keys and supports replacing top-level objects.
    foundry.utils.expandObject = expandObject;
    foundry.utils.mergeObject = mergeUpdate;
  });
  afterEach(() => clearFoundryStubs());

  test("skips stores for a managed tradegood-to-gem snapshot", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("gem");
    const changes = {
      system: { type: { value: "gem" } }
    };

    await lifecycle.handleItemUpdated(item, changes, snapshotOptions());

    assert.deepEqual(calls, []);
  });

  test("skips stores for a managed gem-to-tradegood snapshot", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("tradegood");
    const changes = {
      "system.type.value": "tradegood"
    };

    await lifecycle.handleItemUpdated(item, changes, snapshotOptions());

    assert.deepEqual(calls, []);
  });

  test("skips stores for a managed snapshot when the item remains a gem", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("gem");
    const changes = {
      "system.type.subtype": "gem"
    };

    await lifecycle.handleItemUpdated(item, changes, snapshotOptions());

    assert.deepEqual(calls, []);
  });

  test("stashes and removes activities and effects for a manual gem-to-non-gem transition", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("tradegood");

    await lifecycle.handleItemUpdated(
      item,
      { "system.type.value": "tradegood" },
      transitionOptions(true, false)
    );

    assert.deepEqual(calls, [
      "activity.stash",
      "activity.removeAll",
      "effect.stash",
      "effect.removeAll"
    ]);
  });

  test("restores effects and activities for a manual non-gem-to-gem transition", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("gem");

    await lifecycle.handleItemUpdated(
      item,
      { "system.type.value": "gem" },
      transitionOptions(false, true)
    );

    assert.deepEqual(calls, ["effect.restore", "activity.restore"]);
  });

  test("does no work for manual updates that remain in the same gem state", async () => {
    for (const { subtype, wasGem } of [
      { subtype: "tradegood", wasGem: false },
      { subtype: "gem", wasGem: true }
    ]) {
      const { lifecycle, calls } = createLifecycle();
      const item = createLoot(subtype);

      await lifecycle.handleItemUpdated(
        item,
        { "system.type.value": subtype },
        transitionOptions(wasGem, wasGem)
      );

      assert.deepEqual(calls, []);
    }
  });

  test("does no work for unrelated updates", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("gem");

    await lifecycle.handleItemUpdated(item, { name: "Renamed Gem" }, transitionOptions(true, true));

    assert.deepEqual(calls, []);
  });

  for (const flattened of [false, true]) {
    const format = flattened ? "dotted" : "nested";
    const formatChanges = (changes) => flattened ? foundry.utils.flattenObject(changes) : changes;

    test(`preserves snapshot gem identity through repeated round trips with ${format} changes`, async () => {
      const { lifecycle, calls } = createLifecycle();
      const item = createLoot("tradegood");
      for (const gemSubtype of ["gem", null, "gem", "gem"]) {
        await applyLifecycleUpdate(lifecycle, item, formatChanges({
          system: { type: { value: "tradegood" } },
          flags: { "sc-simple-sockets": { gemSubtype } }
        }), snapshotOptions());
        assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), gemSubtype);
      }
      assert.deepEqual(calls, []);
    });

    test(`derives a snapshot subtype without inheriting the previous level with ${format} changes`, async () => {
      const { lifecycle, calls } = createLifecycle();
      const item = createLoot("tradegood");
      await item.setFlag("sc-simple-sockets", "gemSubtype", "gem");
      for (const value of ["tradegood", "gem", "tradegood"]) {
        await applyLifecycleUpdate(lifecycle, item, formatChanges({
          system: { type: { value } }
        }), snapshotOptions());
        assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), value === "gem" ? "gem" : null);
      }
      assert.deepEqual(calls, []);
    });

    test(`executes each manual transition once with ${format} changes`, async () => {
      const { lifecycle, calls } = createLifecycle();
      const item = createLoot("gem");
      await item.setFlag("sc-simple-sockets", "gemSubtype", "gem");
      await applyLifecycleUpdate(lifecycle, item, formatChanges({ system: { type: { value: "tradegood" } } }));
      assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), null);
      await applyLifecycleUpdate(lifecycle, item, formatChanges({ system: { type: { value: "gem" } } }));
      assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), "gem");
      assert.deepEqual(calls, [
        "activity.stash", "activity.removeAll", "effect.stash", "effect.removeAll",
        "effect.restore", "activity.restore"
      ]);
    });

    test(`preserves fallback gem identity for unchanged type values with ${format} changes`, async () => {
      const { lifecycle, calls } = createLifecycle();
      const item = createLoot("tradegood");
      await item.setFlag("sc-simple-sockets", "gemSubtype", "gem");
      await applyLifecycleUpdate(lifecycle, item, formatChanges({ system: { type: { value: "tradegood" } } }));
      assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), "gem");
      assert.deepEqual(calls, []);
    });
  }

  test("preserves existing flags when adding a derived subtype to a non-recursive update", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("gem");
    item.flags = {
      "sc-simple-sockets": { gemSubtype: "gem", sockets: [{ id: "socket" }] },
      other: { retained: true }
    };
    await applyLifecycleUpdate(lifecycle, item, {
      system: { type: { value: "tradegood" } }
    }, snapshotOptions({ recursive: false }));
    assert.deepEqual(item.flags, {
      "sc-simple-sockets": { gemSubtype: null, sockets: [{ id: "socket" }] },
      other: { retained: true }
    });
    assert.deepEqual(calls, []);
  });

  test("respects replacement of the system when deriving a snapshot subtype", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("tradegood");
    item.system.type.subtype = "gem";
    await item.setFlag("sc-simple-sockets", "gemSubtype", "gem");
    await applyLifecycleUpdate(lifecycle, item, {
      system: { type: { value: "tradegood" } },
      flags: { other: { snapshot: true } }
    }, snapshotOptions({ recursive: false }));
    assert.equal(item.system.type.subtype, undefined);
    assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), null);
    assert.deepEqual(item.flags.other, { snapshot: true });
    assert.deepEqual(calls, []);
  });

  test("leaves unrelated pre-update data untouched", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("tradegood");
    await item.setFlag("sc-simple-sockets", "gemSubtype", "gem");
    const changes = { name: "Renamed gem" };
    const options = {};
    await applyLifecycleUpdate(lifecycle, item, changes, options);
    assert.deepEqual(changes, { name: "Renamed gem" });
    assert.deepEqual(options, {});
    assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), "gem");
    assert.deepEqual(calls, []);
  });

  test("derives a gem subtype from the snapshot type even when its legacy flag is null", async () => {
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("tradegood");
    await applyLifecycleUpdate(lifecycle, item, {
      system: { type: { value: "gem" } },
      flags: { "sc-simple-sockets": { gemSubtype: null } }
    }, snapshotOptions());
    assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), "gem");
    assert.deepEqual(calls, []);
  });

  test("preserves each snapshot's configured gem subtype across gem-to-gem level changes", async () => {
    await game.settings.set("sc-simple-sockets", "gemLootSubtypes", ["gem", "rune"]);
    const { lifecycle, calls } = createLifecycle();
    const item = createLoot("tradegood");
    for (const gemSubtype of ["gem", "rune", "gem"]) {
      await applyLifecycleUpdate(lifecycle, item, {
        system: { type: { value: "tradegood" } },
        flags: { "sc-simple-sockets": { gemSubtype } }
      }, snapshotOptions({ recursive: false }));
      assert.equal(item.getFlag("sc-simple-sockets", "gemSubtype"), gemSubtype);
    }
    assert.deepEqual(calls, []);
  });
});
