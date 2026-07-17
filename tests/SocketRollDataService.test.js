import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketRollDataService } from "../scripts/core/services/SocketRollDataService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

function makeSlot(name, key, value, max) {
  const source = {
    name,
    type: "loot",
    flags: {
      [Constants.MODULE_ID]: {
        [Constants.FLAG_GEM_RESOURCE]: { key, value, max }
      }
    }
  };
  return {
    gem: { name },
    _gemData: {
      name,
      img: "icons/gem.webp",
      description: "",
      socketDescription: "",
      data: JSON.stringify(source)
    }
  };
}

function makeItem(name, slots = []) {
  return {
    name,
    actor: null,
    getFlag(moduleId, key) {
      if (moduleId === Constants.MODULE_ID && key === Constants.FLAGS.sockets) return slots;
      return undefined;
    }
  };
}

describe("SocketRollDataService", () => {
  beforeEach(() => {
    installFoundryStubs();
    game.system = { id: "dnd5e" };
  });

  afterEach(() => {
    clearFoundryStubs();
    delete globalThis.dnd5e;
    delete globalThis.libWrapper;
  });

  test("exposes actor totals and current-item totals without persisting a pool", () => {
    const sword = makeItem("Sword", [makeSlot("Soul A", "Soul Harvest", 2, 3)]);
    const armor = makeItem("Armor", [
      makeSlot("Soul B", "soul-harvest", 4, 5),
      makeSlot("Mana", "mana", 1, 2)
    ]);
    const actor = { items: [sword, armor] };
    sword.actor = actor;
    armor.actor = actor;

    const data = SocketRollDataService.build(sword);

    assert.deepEqual(data["soul-harvest"], {
      current: 6,
      total: 8,
      max: 8,
      spent: 2,
      gems: 2,
      actor: { current: 6, total: 8, max: 8, spent: 2, gems: 2 },
      item: { current: 2, total: 3, max: 3, spent: 1, gems: 1 }
    });
    assert.equal(String(data), "0");
    assert.equal(String(data["soul-harvest"]), "8");
    assert.equal(String(data["soul-harvest"].item), "3");
    assert.deepEqual(data.mana.item, { current: 0, total: 0, max: 0, spent: 0, gems: 0 });
    assert.equal(Object.hasOwn(sword, "sockets"), false);
  });

  test("uses the item pool as the root pool for an unowned item", () => {
    const item = makeItem("World Item", [makeSlot("Battery", "Báteria Arcana", 3, 7)]);

    assert.deepEqual(SocketRollDataService.build(item)["bateria-arcana"], {
      current: 3,
      total: 7,
      max: 7,
      spent: 4,
      gems: 1,
      actor: { current: 3, total: 7, max: 7, spent: 4, gems: 1 },
      item: { current: 3, total: 7, max: 7, spent: 4, gems: 1 }
    });
  });

  test("merges resource names that normalize to the same formula key", () => {
    const item = makeItem("Focus", [
      makeSlot("One", "Soul.Harvest", 1, 2),
      makeSlot("Two", "soul harvest", 2, 4)
    ]);

    const pool = SocketRollDataService.build(item)["soul-harvest"];
    assert.equal(pool.current, 3);
    assert.equal(pool.total, 6);
    assert.equal(pool.gems, 2);
  });

  test("derives numeric spent from the remaining charges for total and item bindings", () => {
    const sword = makeItem("Sword", [makeSlot("Soul A", "Soul Harvest", 2, 3)]);
    const armor = makeItem("Armor", [makeSlot("Soul B", "soul-harvest", 4, 5)]);
    const actor = { items: [sword, armor] };
    sword.actor = actor;
    armor.actor = actor;
    sword._source = { system: { uses: { max: "@sockets.soul-harvest.total" } } };
    sword.system = { uses: { spent: 99 } };

    assert.deepEqual(SocketRollDataService.getUsesBindingState(sword), {
      resourceKey: "soul-harvest",
      scope: "actorAll",
      current: 6,
      total: 8,
      spent: 2
    });
    SocketRollDataService.applyDerivedSpent(sword);
    assert.equal(sword.system.uses.spent, 2);

    sword._source.system.uses.max = "@sockets.soul-harvest.item";
    assert.equal(SocketRollDataService.applyDerivedSpent(sword).spent, 1);
    assert.equal(sword.system.uses.spent, 1);
  });

  test("accepts only the two exact Limited Uses formula paths", () => {
    assert.deepEqual(SocketRollDataService.parseUsesFormula(" @sockets.energy.total "), {
      resourceKey: "energy",
      scope: "actorAll"
    });
    assert.deepEqual(SocketRollDataService.parseUsesFormula("@sockets.energy.item"), {
      resourceKey: "energy",
      scope: "item"
    });
    assert.equal(SocketRollDataService.parseUsesFormula("@sockets.energy.current"), null);
    assert.equal(SocketRollDataService.parseUsesFormula("@sockets.energy.total + 1"), null);
  });

  test("wraps Item5e.getRollData and preserves the original roll data", () => {
    class Item5e {
      constructor() {
        this.actor = null;
      }

      getFlag() {
        return [makeSlot("Cell", "energy", 2, 3)];
      }

      getRollData(options) {
        return { original: options?.marker, sockets: { external: { current: 9 } } };
      }
    }

    globalThis.dnd5e = { documents: { Item5e } };
    SocketRollDataService.activate();

    const data = new Item5e().getRollData({ marker: "kept" });
    assert.equal(data.original, "kept");
    assert.equal(data.sockets.external.current, 9);
    assert.equal(data.sockets.energy.current, 2);
    assert.equal(data.sockets.energy.item.total, 3);
    assert.equal(String(data.sockets), "0");
    assert.equal(String(data.sockets.energy), "3");
  });
});
