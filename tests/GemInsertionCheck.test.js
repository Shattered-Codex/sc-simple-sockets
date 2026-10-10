import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketService } from "../scripts/core/services/SocketService.js";
import { SocketSlot } from "../scripts/core/model/SocketSlot.js";
import { GemBreakService } from "../scripts/domain/gems/GemBreakService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

const setting = (key) => `${Constants.MODULE_ID}.${key}`;
const DROP = { insertionCheck: true };

function install({ isGM = false, insertionCheck = {} } = {}) {
  installFoundryStubs({
    user: { id: "player-1", isGM, hasRole: () => true },
    settings: {
      [setting("maxSockets")]: 6,
      [setting("deleteGemOnRemoval")]: false,
      [setting("socketableItemTypes")]: ["weapon", "equipment"],
      [setting(Constants.SETTING_GEM_LOOT_SUBTYPES)]: ["gem"],
      [setting("gemInsertionCheckEnabled")]: true,
      [setting("gemInsertionCheckType")]: "tool:jeweler",
      [setting("gemInsertionCheckDcMode")]: "fixed",
      [setting("gemInsertionCheckDc")]: 15,
      [setting("gemInsertionCheckFailure")]: "keep",
      ...Object.fromEntries(Object.entries(insertionCheck).map(([key, value]) => [setting(key), value]))
    }
  });
  globalThis.CONST.USER_ROLES = { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 };
}

function createHost({ slotConfig = {}, rollTotal = 20, quantity = 1, rarity = "rare" } = {}) {
  const actor = createTestActor({
    items: [{
      id: "host-1",
      name: "Sword",
      type: "weapon",
      system: { activities: {} },
      flags: { [Constants.MODULE_ID]: { sockets: [SocketSlot.makeDefault(slotConfig)] } }
    }]
  });
  const gem = createTestItem({
    id: "gem-1",
    name: "Ruby",
    type: "loot",
    img: "icons/ruby.webp",
    system: { quantity, rarity, type: { value: "gem" } },
    actor,
    parent: actor
  });
  actor.items.set(gem.id, gem);
  // Real documents serialize their id as `_id` only.
  const toObject = gem.toObject.bind(gem);
  gem.toObject = () => {
    const data = toObject();
    delete data.id;
    return data;
  };

  const rolls = [];
  actor.rollToolCheck = async (config) => {
    rolls.push(config);
    return rollTotal === null ? null : [{ total: rollTotal }];
  };

  const hostItem = actor.items.get("host-1");
  const slot = () => hostItem.flags[Constants.MODULE_ID].sockets[0];
  const gems = () => Array.from(actor.items.values()).filter((item) => item.type === "loot");
  return { actor, gem, gems, hostItem, rolls, slot };
}

describe("gem insertion check", () => {
  afterEach(() => {
    clearFoundryStubs();
  });

  test("a dropped gem is socketed after a successful check against the global DC", async () => {
    install();
    const { gem, gems, hostItem, rolls, slot } = createHost({ rollTotal: 15 });

    const result = await SocketService.addGem(hostItem, 0, gem, DROP);

    assert.equal(result.reason, "gem-added");
    assert.deepEqual(rolls, [{ tool: "jeweler", target: 15 }]);
    assert.equal(slot().gem.name, "Ruby");
    assert.equal(gems().length, 0);
  });

  test("a failed check leaves the gem in the inventory by default", async () => {
    install();
    const { gem, gems, hostItem, slot } = createHost({ rollTotal: 5 });

    const result = await SocketService.addGem(hostItem, 0, gem, DROP);

    assert.equal(result.success, false);
    assert.equal(result.reason, "insertion-check-failed");
    assert.equal(result.changed, false);
    assert.deepEqual(result.data.insertionCheck, { success: false, total: 5, dc: 15 });
    assert.equal(slot().gem ?? null, null);
    assert.equal(gems().length, 1);
    assert.equal(GemBreakService.isBroken(gem), false);
  });

  test("a failed check can break one unit of the gem or destroy it", async () => {
    install({ insertionCheck: { gemInsertionCheckFailure: "break" } });
    const stack = createHost({ rollTotal: 5, quantity: 3 });
    assert.equal((await SocketService.addGem(stack.hostItem, 0, stack.gem, DROP)).data.failure, "break");
    assert.equal(stack.gem.system.quantity, 2);
    assert.equal(GemBreakService.isBroken(stack.gem), false);
    const broken = stack.gems().filter((item) => GemBreakService.isBroken(item));
    assert.equal(broken.length, 1);
    assert.equal(broken[0].system.quantity, 1);
    assert.equal(stack.slot().gem ?? null, null);

    const single = createHost({ rollTotal: 5 });
    await SocketService.addGem(single.hostItem, 0, single.gem, DROP);
    assert.equal(GemBreakService.isBroken(single.gem), true);

    clearFoundryStubs();
    install({ insertionCheck: { gemInsertionCheckFailure: "lose" } });
    const lost = createHost({ rollTotal: 5 });
    const result = await SocketService.addGem(lost.hostItem, 0, lost.gem, DROP);
    assert.equal(result.changed, true);
    assert.equal(lost.gems().length, 0);
    assert.equal(lost.slot().gem ?? null, null);
  });

  test("a broken unit that cannot be created gives the stack its unit back", async () => {
    install({ insertionCheck: { gemInsertionCheckFailure: "break" } });
    const { actor, gem, gems, hostItem } = createHost({ rollTotal: 5, quantity: 3 });
    actor.createEmbeddedDocuments = async () => { throw new Error("Creation failed"); };

    await assert.rejects(SocketService.addGem(hostItem, 0, gem, DROP), /Creation failed/);
    assert.equal(gem.system.quantity, 3);
    assert.equal(gems().length, 1);

    // The slot is free for another attempt.
    actor.rollToolCheck = async () => [{ total: 20 }];
    assert.equal((await SocketService.addGem(hostItem, 0, gem, DROP)).reason, "gem-added");
  });

  test("failures on two sockets at once never duplicate or lose units of the same stack", async () => {
    for (const [failure, intact, broken] of [["break", 1, 2], ["lose", 1, 0]]) {
      clearFoundryStubs();
      install({ insertionCheck: { gemInsertionCheckFailure: failure } });
      const { gem, gems, hostItem } = createHost({ rollTotal: 5, quantity: 3 });
      hostItem.flags[Constants.MODULE_ID].sockets.push(SocketSlot.makeDefault());

      const results = await Promise.all([
        SocketService.addGem(hostItem, 0, gem, DROP),
        SocketService.addGem(hostItem, 1, gem, DROP)
      ]);

      assert.deepEqual(results.map((result) => result.reason), ["insertion-check-failed", "insertion-check-failed"]);
      const total = (state) => gems().filter((item) => GemBreakService.isBroken(item) === state)
        .reduce((sum, item) => sum + item.system.quantity, 0);
      assert.equal(total(false), intact);
      assert.equal(total(true), broken);
    }
  });

  test("a failure and a success on the same stack at once keep every unit accounted for", async () => {
    for (const failure of ["break", "lose"]) {
      clearFoundryStubs();
      install({ insertionCheck: { gemInsertionCheckFailure: failure } });
      const { actor, gem, gems, hostItem } = createHost({ quantity: 3 });
      const sockets = hostItem.flags[Constants.MODULE_ID].sockets;
      sockets.push(SocketSlot.makeDefault());
      const totals = [5, 20];
      actor.rollToolCheck = async () => [{ total: totals.shift() }];

      const results = await Promise.all([
        SocketService.addGem(hostItem, 0, gem, DROP),
        SocketService.addGem(hostItem, 1, gem, DROP)
      ]);

      assert.deepEqual(results.map((result) => result.reason), ["insertion-check-failed", "gem-added"]);
      const inInventory = gems().reduce((sum, item) => sum + item.system.quantity, 0);
      const socketed = hostItem.flags[Constants.MODULE_ID].sockets.filter((slot) => slot.gem).length;
      assert.equal(socketed, 1);
      assert.equal(inInventory, failure === "break" ? 2 : 1);
    }
  });

  test("a gem spent while its check was pending is not socketed", async () => {
    install();
    const { actor, gem, hostItem, slot } = createHost();
    actor.rollToolCheck = async () => {
      actor.items.delete(gem.id);
      return [{ total: 20 }];
    };

    const result = await SocketService.addGem(hostItem, 0, gem, DROP);

    assert.equal(result.reason, "gem-unavailable");
    assert.equal(slot().gem ?? null, null);
  });

  test("a slot overrides the global DC, and a DC of 0 removes its check", async () => {
    install();
    const hard = createHost({ slotConfig: { insertionCheckDc: "22" }, rollTotal: 20 });
    assert.equal((await SocketService.addGem(hard.hostItem, 0, hard.gem, DROP)).reason, "insertion-check-failed");
    assert.deepEqual(hard.rolls, [{ tool: "jeweler", target: 22 }]);

    const free = createHost({ slotConfig: { insertionCheckDc: "0" }, rollTotal: 1 });
    assert.equal((await SocketService.addGem(free.hostItem, 0, free.gem, DROP)).reason, "gem-added");
    assert.equal(free.rolls.length, 0);
  });

  test("a slot overrides what a failed check does to the gem", async () => {
    install({ insertionCheck: { gemInsertionCheckFailure: "lose" } });
    const kept = createHost({ slotConfig: { insertionCheckFailure: "keep" }, rollTotal: 5 });
    assert.equal((await SocketService.addGem(kept.hostItem, 0, kept.gem, DROP)).data.failure, "keep");
    assert.equal(kept.gems().length, 1);

    const broken = createHost({ slotConfig: { insertionCheckFailure: "break" }, rollTotal: 5 });
    await SocketService.addGem(broken.hostItem, 0, broken.gem, DROP);
    assert.equal(GemBreakService.isBroken(broken.gem), true);

    const inherited = createHost({ rollTotal: 5 });
    await SocketService.addGem(inherited.hostItem, 0, inherited.gem, DROP);
    assert.equal(inherited.gems().length, 0);
  });

  test("a slot overrides which check is rolled", async () => {
    install();
    const { actor, gem, hostItem, rolls } = createHost({ slotConfig: { insertionCheckType: "skill:arc" } });
    const skills = [];
    actor.rollSkill = async (config) => { skills.push(config); return [{ total: 20 }]; };

    assert.equal((await SocketService.addGem(hostItem, 0, gem, DROP)).reason, "gem-added");
    assert.equal(rolls.length, 0);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].skill, "arc");
  });

  test("a slot can be exempt from the check or use its own DC by gem rarity", async () => {
    install();
    const exempt = createHost({ slotConfig: { insertionCheckType: "none" }, rollTotal: 1 });
    assert.equal((await SocketService.addGem(exempt.hostItem, 0, exempt.gem, DROP)).reason, "gem-added");
    assert.equal(exempt.rolls.length, 0);

    const byRarity = createHost({
      slotConfig: { insertionCheckDc: "5", insertionCheckDcMode: "rarity", insertionCheckRarityDcs: { rare: 23 } },
      rollTotal: 23
    });
    assert.equal((await SocketService.addGem(byRarity.hostItem, 0, byRarity.gem, DROP)).reason, "gem-added");
    assert.deepEqual(byRarity.rolls, [{ tool: "jeweler", target: 23 }]);
    assert.equal(byRarity.slot().slotConfig.insertionCheckRarityDcs.rare, 23);
  });

  test("the global DC can follow the rarity of the gem", async () => {
    install({ insertionCheck: { gemInsertionCheckDcMode: "rarity", gemInsertionCheckRarityDcs: { rare: 19 } } });
    const { gem, hostItem, rolls } = createHost({ rollTotal: 19 });

    assert.equal((await SocketService.addGem(hostItem, 0, gem, DROP)).reason, "gem-added");
    assert.deepEqual(rolls, [{ tool: "jeweler", target: 19 }]);
  });

  test("nobody rolls when the check is disabled, for automation, or for a GM by default", async () => {
    install({ insertionCheck: { gemInsertionCheckEnabled: false } });
    const disabled = createHost({ rollTotal: 1 });
    assert.equal((await SocketService.addGem(disabled.hostItem, 0, disabled.gem, DROP)).reason, "gem-added");
    assert.equal(disabled.rolls.length, 0);

    clearFoundryStubs();
    install();
    const automation = createHost({ rollTotal: 1 });
    assert.equal((await SocketService.addGem(automation.hostItem, 0, automation.gem)).reason, "gem-added");
    assert.equal(automation.rolls.length, 0);

    clearFoundryStubs();
    install({ isGM: true });
    const gm = createHost({ rollTotal: 1 });
    assert.equal((await SocketService.addGem(gm.hostItem, 0, gm.gem, DROP)).reason, "gem-added");
    assert.equal(gm.rolls.length, 0);

    clearFoundryStubs();
    install({ isGM: true, insertionCheck: { gemInsertionCheckAppliesToGm: true } });
    const rollingGm = createHost({ rollTotal: 1 });
    assert.equal((await SocketService.addGem(rollingGm.hostItem, 0, rollingGm.gem, DROP)).reason, "insertion-check-failed");
    assert.equal(rollingGm.rolls.length, 1);
  });

  test("a gem the socket would refuse is turned down before anyone rolls", async () => {
    install();
    const { gem, hostItem, rolls } = createHost();
    await GemBreakService.break(gem);

    assert.equal((await SocketService.addGem(hostItem, 0, gem, DROP)).reason, "gem-broken");
    assert.equal(rolls.length, 0);
  });

  test("a cancelled roll sockets nothing and a second drop waits for the first roll", async () => {
    install();
    const { actor, gem, gems, hostItem, slot } = createHost({ rollTotal: null });
    assert.equal((await SocketService.addGem(hostItem, 0, gem, DROP)).reason, "insertion-check-cancelled");
    assert.equal(gems().length, 1);

    let finish;
    actor.rollToolCheck = () => new Promise((resolve) => { finish = () => resolve([{ total: 20 }]); });
    const first = SocketService.addGem(hostItem, 0, gem, DROP);
    await Promise.resolve();
    const second = await SocketService.addGem(hostItem, 0, gem, DROP);
    assert.equal(second.reason, "insertion-check-pending");
    finish();
    assert.equal((await first).reason, "gem-added");
    assert.equal(slot().gem.name, "Ruby");
  });

  test("only a GM changes the insertion check override of a slot", async () => {
    install();
    const { hostItem, slot } = createHost({ slotConfig: { insertionCheckDc: "15", insertionCheckFailure: "lose" } });
    const request = { name: "Bay", insertionCheckDc: "0", insertionCheckFailure: "keep", insertionCheckType: "flat" };

    assert.equal(await SocketService.updateSlotConfig(hostItem, 0, request), true);
    assert.equal(slot().slotConfig.name, "Bay");
    assert.equal(slot().slotConfig.insertionCheckDc, "15");
    assert.equal(slot().slotConfig.insertionCheckFailure, "lose");
    assert.equal(slot().slotConfig.insertionCheckType, undefined);

    game.user.isGM = true;
    assert.equal(await SocketService.updateSlotConfig(hostItem, 0, request), true);
    assert.equal(slot().slotConfig.insertionCheckDc, "0");
    assert.equal(slot().slotConfig.insertionCheckFailure, "keep");
    assert.equal(slot().slotConfig.insertionCheckType, "flat");
  });
});
