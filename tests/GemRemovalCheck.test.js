import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketService } from "../scripts/core/services/SocketService.js";
import { SocketSlot } from "../scripts/core/model/SocketSlot.js";
import { GemBreakService } from "../scripts/domain/gems/GemBreakService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

const setting = (key) => `${Constants.MODULE_ID}.${key}`;

const GEM_DATA = {
  name: "Ruby",
  type: "loot",
  img: "icons/ruby.webp",
  system: { quantity: 1, rarity: "rare", type: { value: "gem" } }
};

function install({ isGM = false, removalCheck = {}, extraSettings = {} } = {}) {
  installFoundryStubs({
    user: { id: "player-1", isGM, hasRole: () => true },
    settings: {
      [setting("editSocketPermission")]: 1,
      [setting("maxSockets")]: 6,
      [setting("deleteGemOnRemoval")]: false,
      [setting("socketableItemTypes")]: ["weapon", "equipment"],
      [setting(Constants.SETTING_GEM_LOOT_SUBTYPES)]: ["gem"],
      [setting("gemRemovalCheckEnabled")]: true,
      [setting("gemRemovalCheckType")]: "tool:jeweler",
      [setting("gemRemovalCheckDcMode")]: "fixed",
      [setting("gemRemovalCheckDc")]: 15,
      [setting("gemRemovalCheckFailure")]: "break",
      ...Object.fromEntries(Object.entries(removalCheck).map(([key, value]) => [setting(key), value])),
      ...extraSettings
    }
  });
  globalThis.CONST.USER_ROLES = { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 };
}

function createHost({ slotConfig = {}, rollTotal = 20 } = {}) {
  const actor = createTestActor({
    items: [{
      id: "host-1",
      name: "Sword",
      type: "weapon",
      system: { activities: {} },
      flags: {
        [Constants.MODULE_ID]: {
          sockets: [{
            ...SocketSlot.makeDefault(slotConfig),
            gem: { name: "Ruby", img: "icons/ruby.webp" },
            img: "icons/ruby.webp",
            _gemInstanceId: "instance-1",
            _gemData: { name: "Ruby", img: "icons/ruby.webp", data: JSON.stringify(GEM_DATA) }
          }]
        }
      }
    }]
  });

  const rolls = [];
  actor.rollToolCheck = async (config) => {
    rolls.push(config);
    return rollTotal === null ? null : [{ total: rollTotal }];
  };

  const hostItem = actor.items.get("host-1");
  const slot = () => hostItem.flags[Constants.MODULE_ID].sockets[0];
  const inventoryGems = () => Array.from(actor.items.values()).filter((item) => item.type === "loot");
  return { actor, hostItem, inventoryGems, rolls, slot };
}

describe("gem removal check", () => {
  afterEach(() => {
    clearFoundryStubs();
  });

  test("is skipped entirely while the setting is disabled", async () => {
    install({ removalCheck: { gemRemovalCheckEnabled: false } });
    const { hostItem, inventoryGems, rolls, slot } = createHost({ rollTotal: 1 });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.equal(result.reason, "gem-removed");
    assert.equal(rolls.length, 0);
    assert.equal(slot().gem, null);
    assert.equal(GemBreakService.isBroken(inventoryGems()[0]), false);
  });

  test("a passed check removes the gem intact", async () => {
    install();
    const { hostItem, inventoryGems, rolls, slot } = createHost({ rollTotal: 15 });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.deepEqual(rolls, [{ tool: "jeweler", target: 15 }]);
    assert.equal(result.success, true);
    assert.equal(result.reason, "gem-removed");
    assert.deepEqual(result.data.removalCheck, { success: true, total: 15, dc: 15 });
    assert.equal(slot().gem, null);
    assert.equal(inventoryGems().length, 1);
    assert.equal(GemBreakService.isBroken(inventoryGems()[0]), false);
  });

  test("a failed check returns the gem broken", async () => {
    install();
    const { hostItem, inventoryGems, slot } = createHost({ rollTotal: 9 });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.equal(result.success, true);
    assert.equal(result.reason, "gem-removed-broken");
    assert.equal(slot().gem, null);
    assert.equal(inventoryGems().length, 1);
    assert.equal(GemBreakService.isBroken(inventoryGems()[0]), true);
  });

  test("a failed check can destroy the gem", async () => {
    install({ removalCheck: { gemRemovalCheckFailure: "lose" } });
    const { hostItem, inventoryGems, slot } = createHost({ rollTotal: 9 });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.equal(result.reason, "gem-lost");
    assert.equal(slot().gem, null);
    assert.equal(inventoryGems().length, 0);
  });

  test("a failed check can leave the gem in the socket", async () => {
    install({ removalCheck: { gemRemovalCheckFailure: "stay" } });
    const { hostItem, inventoryGems, slot } = createHost({ rollTotal: 9 });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.equal(result.success, false);
    assert.equal(result.reason, "removal-check-failed");
    assert.equal(slot().gem.name, "Ruby");
    assert.equal(inventoryGems().length, 0);
  });

  test("removing a filled socket cannot bypass a failed removal check", async () => {
    install({ removalCheck: { gemRemovalCheckFailure: "stay" } });
    const { hostItem, inventoryGems, rolls, slot } = createHost({ rollTotal: 1 });
    const result = await SocketService.removeSlotWithContents(hostItem, 0);
    assert.equal(result.reason, "removal-check-failed");
    assert.equal(rolls.length, 1);
    assert.equal(slot().gem.name, "Ruby");
    assert.equal(inventoryGems().length, 0);
  });

  test("removing a filled socket returns its gem broken after a failed check", async () => {
    install();
    const { hostItem, inventoryGems, rolls } = createHost({ rollTotal: 1 });
    await SocketService.removeSlotWithContents(hostItem, 0);
    assert.equal(rolls.length, 1);
    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets.length, 0);
    assert.equal(inventoryGems().length, 1);
    assert.equal(GemBreakService.isBroken(inventoryGems()[0]), true);
  });

  test("a cancelled roll leaves everything untouched", async () => {
    install();
    const { hostItem, inventoryGems, slot } = createHost({ rollTotal: null });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.equal(result.success, false);
    assert.equal(result.reason, "removal-check-cancelled");
    assert.equal(slot().gem.name, "Ruby");
    assert.equal(inventoryGems().length, 0);
  });

  for (const legacy of [false, true]) {
    test(`a pending roll cannot remove a different gem (${legacy ? "legacy" : "current"} slot)`, async () => {
      install();
      const { actor, hostItem, inventoryGems, slot } = createHost();
      if (legacy) delete slot()._gemInstanceId;
      actor.rollToolCheck = async () => {
        // Simulate an in-place document update while the roll dialog is open.
        slot().gem = { name: "Emerald", img: "icons/emerald.webp" };
        slot()._gemData = { data: JSON.stringify({ ...GEM_DATA, name: "Emerald" }) };
        if (!legacy) slot()._gemInstanceId = "instance-2";
        return [{ total: 20 }];
      };

      const result = await SocketService.removeGem(hostItem, 0);
      assert.equal(result.reason, "slot-changed");
      assert.equal(slot().gem.name, "Emerald");
      assert.equal(inventoryGems().length, 0);
    });
  }

  test("the slot can override the DC and the failure outcome", async () => {
    install();
    const { hostItem, inventoryGems, rolls } = createHost({
      slotConfig: { removalCheckDc: "22", removalCheckFailure: "lose" },
      rollTotal: 20
    });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.deepEqual(rolls, [{ tool: "jeweler", target: 22 }]);
    assert.equal(result.reason, "gem-lost");
    assert.equal(inventoryGems().length, 0);
  });

  test("a slot DC of 0 removes the check from that slot", async () => {
    install();
    const { hostItem, rolls } = createHost({ slotConfig: { removalCheckDc: "0" }, rollTotal: 1 });

    const result = await SocketService.removeGem(hostItem, 0);

    assert.equal(rolls.length, 0);
    assert.equal(result.reason, "gem-removed");
  });

  test("the global DC can come from the gem rarity", async () => {
    install({
      removalCheck: {
        gemRemovalCheckDcMode: "rarity",
        gemRemovalCheckRarityDcs: { rare: 19 }
      }
    });
    const { hostItem, rolls } = createHost({ rollTotal: 20 });

    await SocketService.removeGem(hostItem, 0);

    assert.deepEqual(rolls, [{ tool: "jeweler", target: 19 }]);
  });

  test("a GM removes gems without rolling unless the setting says otherwise", async () => {
    install({ isGM: true });
    const first = createHost({ rollTotal: 1 });
    const skipped = await SocketService.removeGem(first.hostItem, 0);
    assert.equal(first.rolls.length, 0);
    assert.equal(skipped.reason, "gem-removed");
    clearFoundryStubs();

    install({ isGM: true, removalCheck: { gemRemovalCheckAppliesToGm: true } });
    const second = createHost({ rollTotal: 1 });
    const rolled = await SocketService.removeGem(second.hostItem, 0);
    assert.equal(second.rolls.length, 1);
    assert.equal(rolled.reason, "gem-removed-broken");
  });

  test("explicit keep/delete removals never roll", async () => {
    install();
    const kept = createHost({ rollTotal: 1 });
    const result = await SocketService.removeGem(kept.hostItem, 0, { mode: SocketService.REMOVE_GEM_MODE_KEEP });

    assert.equal(kept.rolls.length, 0);
    assert.equal(result.reason, "gem-removed");
    assert.equal(GemBreakService.isBroken(kept.inventoryGems()[0]), false);

    const deleted = createHost({ rollTotal: 1 });
    await SocketService.removeGem(deleted.hostItem, 0, { mode: SocketService.REMOVE_GEM_MODE_DELETE });
    assert.equal(deleted.rolls.length, 0);
    assert.equal(deleted.inventoryGems().length, 0);
  });

  test("a keep removal still rolls when the caller enforces the check", async () => {
    install();
    const { hostItem, inventoryGems, rolls } = createHost({ rollTotal: 1 });

    const result = await SocketService.removeGem(hostItem, 0, {
      mode: SocketService.REMOVE_GEM_MODE_KEEP,
      enforceRemovalCheck: true,
      notify: false
    });

    assert.equal(rolls.length, 1);
    assert.equal(result.reason, "gem-removed-broken");
    assert.equal(GemBreakService.isBroken(inventoryGems()[0]), true);
  });

  test("a second removal of the same slot does not roll while the first is pending", async () => {
    install();
    const { actor, hostItem, inventoryGems, rolls } = createHost();
    let finishRoll;
    actor.rollToolCheck = (config) => {
      rolls.push(config);
      return new Promise((resolve) => { finishRoll = () => resolve([{ total: 20 }]); });
    };

    const first = SocketService.removeGem(hostItem, 0);
    await new Promise((resolve) => setImmediate(resolve));
    const second = await SocketService.removeGem(hostItem, 0);
    finishRoll();

    assert.equal(second.success, false);
    assert.equal(second.reason, "removal-check-pending");
    assert.equal((await first).reason, "gem-removed");
    assert.equal(rolls.length, 1);
    assert.equal(inventoryGems().length, 1);
  });

  test("a roll that cannot be made tells the player and keeps the gem", async () => {
    install();
    const { actor, hostItem, slot } = createHost();
    actor.rollToolCheck = async () => { throw new Error("no such tool"); };
    const warnings = [];
    globalThis.ui.notifications.warn = (message) => warnings.push(message);
    const originalError = console.error;
    console.error = () => {};

    let result;
    try {
      result = await SocketService.removeGem(hostItem, 0);
    } finally {
      console.error = originalError;
    }

    assert.equal(result.reason, "removal-check-error");
    assert.equal(warnings.length, 1);
    assert.equal(slot().gem.name, "Ruby");

    // The failed attempt released the slot, so it can be tried again.
    actor.rollToolCheck = async () => [{ total: 20 }];
    assert.equal((await SocketService.removeGem(hostItem, 0)).reason, "gem-removed");
  });

  test("a gem cannot be swapped out by dropping another one on a checked socket", async () => {
    install();
    const { actor, hostItem, rolls, slot } = createHost();
    const incoming = createTestItem({ id: "gem-2", ...GEM_DATA, name: "Emerald", actor, parent: actor });
    actor.items.set(incoming.id, incoming);

    const result = await SocketService.addGem(hostItem, 0, incoming);

    assert.equal(result.success, false);
    assert.equal(result.reason, "removal-check-required");
    assert.equal(rolls.length, 0);
    assert.equal(slot().gem.name, "Ruby");
  });

  test("a broken gem cannot be socketed until it is repaired", async () => {
    install({ removalCheck: { gemRemovalCheckEnabled: false } });
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: { [Constants.MODULE_ID]: { sockets: [SocketSlot.makeDefault()] } }
      }]
    });
    const hostItem = actor.items.get("host-1");
    const gem = createTestItem({
      id: "gem-1",
      ...GEM_DATA,
      actor,
      parent: actor,
      flags: { [Constants.MODULE_ID]: { [Constants.FLAG_GEM_BROKEN]: true } }
    });
    actor.items.set(gem.id, gem);

    const rejected = await SocketService.addGem(hostItem, 0, gem);
    assert.equal(rejected.success, false);
    assert.equal(rejected.reason, "gem-broken");

    assert.equal(await GemBreakService.repair(gem), true);
    assert.equal(GemBreakService.isBroken(gem), false);

    const accepted = await SocketService.addGem(hostItem, 0, gem);
    assert.equal(accepted.success, true);
  });

  test("an inspected socketed gem cannot be marked as broken", async () => {
    install();
    const gem = createTestItem(GEM_DATA);
    gem[Constants.PROP_SOCKET_SOURCE] = { hostItem: createHost().hostItem, slotIndex: 0 };
    assert.equal(await GemBreakService.break(gem), false);
    assert.equal(GemBreakService.isBroken(gem), false);
  });

  test("a broken gem does not stack with an intact gem from the same source", async () => {
    install();
    const { actor, hostItem, inventoryGems } = createHost({ rollTotal: 2 });
    const intact = createTestItem({ id: "gem-intact", ...GEM_DATA, actor, parent: actor });
    actor.items.set(intact.id, intact);

    await SocketService.removeGem(hostItem, 0);

    const gems = inventoryGems();
    assert.equal(gems.length, 2);
    assert.equal(intact.system.quantity, 1);
    assert.equal(gems.filter((gem) => GemBreakService.isBroken(gem)).length, 1);
  });
});
