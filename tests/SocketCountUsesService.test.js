import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketCountUsesService } from "../scripts/core/services/SocketCountUsesService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestItem } from "./support/testDocuments.js";

const SOCKETS_PATH = `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;

function gemSlot(name = "Gem") {
  return { gem: { name }, name, slotConfig: {} };
}

function emptySlot() {
  return { slotConfig: {} };
}

function makeBoundItem({ slots, spent = 0, max = "@sc.sockets.gems" }) {
  const item = createTestItem({
    type: "weapon",
    system: { uses: { spent }, _source: { uses: { max, spent } } },
    flags: { [Constants.MODULE_ID]: { [Constants.FLAGS.sockets]: slots } }
  });
  item._source = { system: { uses: { max, spent } } };
  return item;
}

describe("SocketCountUsesService", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => clearFoundryStubs());

  test("recognizes only exact native Item Uses count bindings", () => {
    assert.deepEqual(SocketCountUsesService.parseUsesMaxBinding(" @sc.sockets.gems "), { poolKey: "gems" });
    assert.deepEqual(SocketCountUsesService.parseUsesMaxBinding("@SC.sockets.Total"), { poolKey: "slots" });
    // Not published in the roll data, so it must not look bound to this service.
    assert.equal(SocketCountUsesService.parseUsesMaxBinding("@sc.sockets.slots"), null);
    assert.equal(SocketCountUsesService.parseUsesMaxBinding("@sc.sockets.empty"), null);
    assert.equal(SocketCountUsesService.parseUsesMaxBinding("@sc.sockets.actor.gems"), null);
    assert.equal(SocketCountUsesService.parseUsesMaxBinding("@sc.sockets.gems + 1"), null);
  });

  test("preserves current charges when a socketed gem is removed", () => {
    // 4 max - 1 spent = 3 current. Removing one gem keeps 3 current, so spent becomes 0.
    const item = makeBoundItem({
      slots: [gemSlot("A"), gemSlot("B"), gemSlot("C"), gemSlot("D")],
      spent: 1
    });
    const changes = { [SOCKETS_PATH]: [gemSlot("A"), gemSlot("B"), gemSlot("C"), emptySlot()] };

    SocketCountUsesService.rebaseSpentForSocketChange(item, changes);

    assert.equal(foundry.utils.getProperty(changes, "system.uses.spent"), 0);
  });

  test("preserves current charges when a gem is inserted", () => {
    // 3 max - 0 spent = 3 current. The new capacity starts spent until recovery.
    const item = makeBoundItem({ slots: [gemSlot("A"), gemSlot("B"), gemSlot("C"), emptySlot()] });
    const changes = { [SOCKETS_PATH]: [gemSlot("A"), gemSlot("B"), gemSlot("C"), gemSlot("D")] };

    SocketCountUsesService.rebaseSpentForSocketChange(item, changes);

    assert.equal(foundry.utils.getProperty(changes, "system.uses.spent"), 1);
  });

  test("clamps current charges when the new maximum is smaller", () => {
    const item = makeBoundItem({ slots: [gemSlot("A"), gemSlot("B"), gemSlot("C"), gemSlot("D")] });
    const changes = { [SOCKETS_PATH]: [gemSlot("A"), gemSlot("B")] };

    SocketCountUsesService.rebaseSpentForSocketChange(item, changes);

    assert.equal(foundry.utils.getProperty(changes, "system.uses.spent"), 0);
  });

  test("keeps an exhausted native pool exhausted when its maximum changes", () => {
    const item = makeBoundItem({ slots: [gemSlot("A"), gemSlot("B"), gemSlot("C"), gemSlot("D")], spent: 4 });
    const changes = { [SOCKETS_PATH]: [gemSlot("A"), gemSlot("B"), gemSlot("C")] };

    SocketCountUsesService.rebaseSpentForSocketChange(item, changes);

    assert.equal(foundry.utils.getProperty(changes, "system.uses.spent"), 3);
  });

  test("supports slot-count maxima and expanded socket updates", () => {
    const item = makeBoundItem({ slots: [gemSlot("A"), emptySlot()], spent: 1, max: "@sc.sockets.total" });
    const changes = { flags: { [Constants.MODULE_ID]: { [Constants.FLAGS.sockets]: [gemSlot("A"), emptySlot(), emptySlot()] } } };

    SocketCountUsesService.rebaseSpentForSocketChange(item, changes);

    assert.equal(foundry.utils.getProperty(changes, "system.uses.spent"), 2);
  });

  test("does not override native consumption or recovery writes", () => {
    const item = makeBoundItem({ slots: [gemSlot("A"), gemSlot("B")], spent: 2 });
    const changes = {
      [SOCKETS_PATH]: [gemSlot("A")],
      "system.uses.spent": 0
    };

    SocketCountUsesService.rebaseSpentForSocketChange(item, changes);

    assert.equal(changes["system.uses.spent"], 0);
    assert.equal(foundry.utils.getProperty(changes, "system"), undefined);
  });

  test("does nothing for unrelated formulas or updates without socket changes", () => {
    const item = makeBoundItem({ slots: [gemSlot("A")], spent: 1, max: "@sc.sockets.gems * 2" });
    const socketChanges = { [SOCKETS_PATH]: [gemSlot("A"), gemSlot("B")] };
    SocketCountUsesService.rebaseSpentForSocketChange(item, socketChanges);
    assert.equal(foundry.utils.getProperty(socketChanges, "system"), undefined);

    item._source.system.uses.max = "@sc.sockets.gems";
    const nameChanges = { name: "Renamed" };
    SocketCountUsesService.rebaseSpentForSocketChange(item, nameChanges);
    assert.equal(foundry.utils.getProperty(nameChanges, "system"), undefined);
  });

  test("refreshes the prepared native uses immediately after the socket update", () => {
    const item = makeBoundItem({ slots: [gemSlot("A"), gemSlot("B"), gemSlot("C")], spent: 1 });
    // Simulate the stale prepared values observed on the actor sheet.
    item.system.uses = { max: 2, spent: 1, value: 1 };
    item._source.system.uses.spent = 1;
    const changes = { [SOCKETS_PATH]: [gemSlot("A"), gemSlot("B"), gemSlot("C")] };

    const state = SocketCountUsesService.syncPreparedUses(item, changes);

    assert.deepEqual(state, { poolKey: "gems", max: 3, spent: 1, value: 2 });
    assert.deepEqual(item.system.uses, { max: 3, spent: 1, value: 2 });
  });
});
