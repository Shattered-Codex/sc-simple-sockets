import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { SocketSlot } from "../scripts/core/model/SocketSlot.js";
import { SocketService } from "../scripts/core/services/SocketService.js";
import { buildSocketLayoutContext } from "../scripts/core/helpers/socketLayout.js";
import { buildSocketDescriptionEntries } from "../scripts/core/helpers/socketDescriptionEntries.js";
import { GemConcealmentService } from "../scripts/domain/gems/GemConcealmentService.js";
import { HostOperationQueue } from "../scripts/core/support/HostOperationQueue.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

const setting = (key) => `${Constants.MODULE_ID}.${key}`;

function install({ isGM = false, conceal = true } = {}) {
  installFoundryStubs({
    user: { id: "user-1", isGM, hasRole: () => true },
    settings: {
      [setting("editSocketPermission")]: 1,
      [setting("maxSockets")]: 6,
      [setting("deleteGemOnRemoval")]: false,
      [setting("socketableItemTypes")]: ["weapon", "equipment"],
      [setting("socketTabLayout")]: "list",
      [setting(Constants.SETTING_GEM_LOOT_SUBTYPES)]: ["gem"],
      [setting("concealUnidentifiedGems")]: conceal
    },
    textEditorImplementation: { enrichHTML: async (html) => html }
  });
  globalThis.CONST.USER_ROLES = { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 };
}

function gemData({ identified = true } = {}) {
  return {
    name: "Poison Gem",
    type: "loot",
    img: "icons/poison.webp",
    system: { quantity: 1, identified, type: { value: "gem" } },
    flags: { [Constants.MODULE_ID]: { [Constants.FLAG_SOCKET_DESCRIPTION]: "<p>Drips venom.</p>" } }
  };
}

function filledSlot({ gem = gemData(), slotConfig = {} } = {}) {
  return {
    ...SocketSlot.makeDefault(slotConfig),
    name: slotConfig.name || gem.name,
    gem: { name: gem.name, img: gem.img },
    img: gem.img,
    _gemInstanceId: "instance-1",
    _gemData: ItemResolver.compactSnapshot(gem)
  };
}

function createHost({ identified = false, slot = filledSlot() } = {}) {
  const actor = createTestActor({
    items: [{
      id: "host-1",
      name: "Dagger",
      type: "weapon",
      system: { identified, activities: {} },
      flags: { [Constants.MODULE_ID]: { sockets: [slot] } }
    }]
  });
  return { actor, hostItem: actor.items.get("host-1") };
}

describe("unidentified gem concealment", () => {
  afterEach(() => {
    clearFoundryStubs();
  });

  test("a gem in an unidentified item is concealed from players only", () => {
    install();
    const { hostItem } = createHost();
    const slot = hostItem.flags[Constants.MODULE_ID].sockets[0];

    assert.equal(GemConcealmentService.isSlotConcealed(hostItem, slot), true);
    assert.equal(GemConcealmentService.isSlotConcealed(hostItem, slot, { isGM: true }), false);
    assert.equal(GemConcealmentService.isSlotConcealed(createHost({ identified: true }).hostItem, slot), false);
    assert.equal(GemConcealmentService.isSlotConcealed(hostItem, SocketSlot.makeDefault()), false);
  });

  test("a gem that was unidentified when socketed stays concealed in an identified item", () => {
    install();
    const slot = filledSlot({ gem: gemData({ identified: false }) });
    const { hostItem } = createHost({ identified: true, slot });

    assert.equal(GemConcealmentService.isSlotConcealed(hostItem, slot), true);
  });

  test("recognizes unidentified gems in formatted JSON snapshots", () => {
    install();
    const snapshot = { data: JSON.stringify(gemData({ identified: false }), null, 2) };
    assert.equal(GemConcealmentService.isSnapshotUnidentified(snapshot), true);
  });

  test("nothing is concealed while the setting is disabled", () => {
    install({ conceal: false });
    const { hostItem } = createHost();

    assert.equal(
      GemConcealmentService.isSlotConcealed(hostItem, hostItem.flags[Constants.MODULE_ID].sockets[0]),
      false
    );
  });

  test("a masked slot hides the gem name and image, and a custom slot name", () => {
    install();
    const { hostItem } = createHost();
    const masked = GemConcealmentService.maskSlot(hostItem, hostItem.flags[Constants.MODULE_ID].sockets[0]);

    assert.equal(masked.concealed, true);
    assert.equal(masked.gem.name, "Unidentified Gem");
    assert.equal(masked.name, "Unidentified Gem");
    assert.equal(masked.gem.img, GemConcealmentService.PLACEHOLDER_IMG);

    const named = GemConcealmentService.maskSlot(hostItem, filledSlot({ slotConfig: { name: "Pommel" } }));
    assert.equal(named.name, "Unidentified Gem");
    assert.equal(named.gem.name, "Unidentified Gem");
    assert.equal(named.slotConfig.name, "");

    const source = filledSlot({ slotConfig: {
      name: "Venom Channel", description: "Poison gem", condition: "gem.name === 'Poison Gem'",
      frameImg: "icons/poison.webp"
    } });
    const safe = GemConcealmentService.maskSlot(hostItem, source);
    assert.equal(safe.slotConfig.description, "");
    assert.equal(safe.slotConfig.condition, "");
    assert.equal(safe.slotConfig.frameImg, "");
    assert.equal(source.slotConfig.description, "Poison gem");
  });

  test("an empty slot of an unidentified item hides its custom name and description", async () => {
    install();
    const slot = SocketSlot.makeDefault({ name: "Venom Channel", description: "<p>Holds a poison gem.</p>" });
    const { hostItem } = createHost({ slot });

    const masked = GemConcealmentService.maskSlot(hostItem, slot);
    assert.equal(masked.name, "Empty");
    assert.equal(masked.slotConfig.name, "");
    assert.equal(masked.slotConfig.description, "");
    assert.deepEqual(await buildSocketDescriptionEntries(hostItem, [slot]), []);
    assert.equal(buildSocketLayoutContext(hostItem, { sockets: [slot] }).sockets[0].slotName, "Empty");

    // Identified item, or a GM: the slot shows as configured.
    const identified = createHost({ identified: true, slot }).hostItem;
    assert.equal(GemConcealmentService.maskSlot(identified, slot), slot);
    assert.equal(GemConcealmentService.maskSlot(hostItem, slot, { isGM: true }), slot);
  });

  test("socket settings conceal the rail and configuration without overwriting stored values", async () => {
    install();
    // Application options carry function handlers that structuredClone cannot copy.
    foundry.utils.mergeObject = (source, update, { inplace = true } = {}) =>
      Object.assign(inplace ? source : { ...source }, update);
    foundry.applications.api = {
      ApplicationV2: class {
        constructor(options) { this.id = options.id; }
        async close() {}
      },
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    };
    const { SocketSlotConfigApp } = await import("../scripts/core/ui/SocketSlotConfigApp.js");
    const slot = filledSlot({ slotConfig: {
      name: "Venom Channel", description: "Poison gem", condition: "gem.name === 'Poison Gem'"
    } });
    const { hostItem } = createHost({ slot });
    const before = structuredClone(hostItem.flags);
    const app = new SocketSlotConfigApp(hostItem, 0);
    const context = await app._preparePartContext("form");
    assert.equal(context.railSlots[0].gemLabel, "Unidentified Gem");
    assert.equal(context.slotConfigName, "");
    assert.equal(context.description, "");
    assert.equal(context.condition, "");
    assert.equal(context.canInspectGem, false);
    assert.equal(context.canUnsocketGem, true);
    assert.equal(context.editable, false);
    await app._processSubmitData(null, null);
    assert.deepEqual(hostItem.flags, before);
  });

  test("the socket tab shows the placeholder to players and the real gem to the GM", () => {
    install();
    const player = createHost();
    const playerContext = buildSocketLayoutContext(player.hostItem, {
      sockets: SocketService.getSlots(player.hostItem)
    });
    assert.equal(playerContext.sockets[0].gemName, "Unidentified Gem");
    assert.equal(playerContext.sockets[0].gemImg, GemConcealmentService.PLACEHOLDER_IMG);
    clearFoundryStubs();

    install({ isGM: true });
    const gm = createHost();
    const gmContext = buildSocketLayoutContext(gm.hostItem, { sockets: SocketService.getSlots(gm.hostItem) });
    assert.equal(gmContext.sockets[0].gemName, "Poison Gem");
  });

  test("resource names of concealed gems stay out of displayed charge pools", () => {
    install();
    const gem = gemData();
    gem.flags[Constants.MODULE_ID][Constants.FLAG_GEM_RESOURCE] = { key: "venom", max: 5, value: 3 };
    const { hostItem } = createHost({ slot: filledSlot({ gem }) });
    const context = () => buildSocketLayoutContext(hostItem, { sockets: SocketService.getSlots(hostItem) });
    assert.deepEqual(context().socketPools, []);
    assert.deepEqual(context().socketResourceRows, []);
    game.user.isGM = true;
    assert.equal(context().socketPools.length, 1);
    assert.equal(context().socketResourceRows[0].resourceKey, "venom");
  });

  test("the gem socket description is replaced by a notice while the gem is concealed", async () => {
    install();
    const hidden = createHost();
    const concealed = await buildSocketDescriptionEntries(hidden.hostItem, SocketService.getSlots(hidden.hostItem));
    assert.equal(concealed.length, 1);
    assert.equal(concealed[0].name, "Unidentified Gem");
    assert.equal(concealed[0].img, GemConcealmentService.PLACEHOLDER_IMG);
    assert.equal(concealed[0].description, "<p>This gem has not been identified.</p>");
    assert.equal(concealed[0].canRecharge, false);

    const visible = createHost({ identified: true });
    const entries = await buildSocketDescriptionEntries(visible.hostItem, SocketService.getSlots(visible.hostItem));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "Poison Gem");
  });

  test("a gem removed from an unidentified item returns unidentified and does not stack", async () => {
    install();
    const { actor, hostItem } = createHost();
    const twin = createTestItem({ id: "gem-twin", ...gemData(), actor, parent: actor });
    actor.items.set(twin.id, twin);

    const result = await SocketService.removeGem(hostItem, 0);

    assert.equal(result.success, true);
    const gems = Array.from(actor.items.values()).filter((item) => item.type === "loot");
    assert.equal(gems.length, 2);
    assert.equal(twin.system.quantity, 1);
    const returned = gems.find((gem) => gem !== twin);
    assert.equal(returned.system.identified, false);
    assert.equal(returned.system.unidentified.name, "Unidentified Gem");
  });

  test("a gem removed from an identified item returns as it was", async () => {
    install();
    const { actor, hostItem } = createHost({ identified: true });

    await SocketService.removeGem(hostItem, 0);

    const [returned] = Array.from(actor.items.values()).filter((item) => item.type === "loot");
    assert.equal(returned.system.identified, true);
  });

  test("identifying the host identifies its socketed gems", () => {
    install();
    const slots = [filledSlot({ gem: gemData({ identified: false }) }), SocketSlot.makeDefault()];

    const next = GemConcealmentService.identifySlots(slots);

    assert.equal(GemConcealmentService.isSnapshotUnidentified(next[0]._gemData), false);
    assert.equal(ItemResolver.expandSnapshot(next[0]._gemData).system.identified, true);
    // Nothing to write when every gem is already identified.
    assert.equal(GemConcealmentService.identifySlots(next), null);
  });

  test("identifying gems waits for socket edits and preserves the latest slots", async () => {
    install();
    const { hostItem } = createHost({ identified: true, slot: filledSlot({ gem: gemData({ identified: false }) }) });
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const edit = HostOperationQueue.enqueue(hostItem, async () => {
      await pending;
      hostItem.flags[Constants.MODULE_ID].sockets.push(SocketSlot.makeDefault({ name: "New slot" }));
    });
    const identify = GemConcealmentService.identifyHostGems(hostItem);
    release();
    await Promise.all([edit, identify]);
    const slots = hostItem.flags[Constants.MODULE_ID].sockets;
    assert.equal(slots.length, 2);
    assert.equal(slots[1].slotConfig.name, "New slot");
    assert.equal(ItemResolver.expandSnapshot(slots[0]._gemData).system.identified, true);
  });

  test("changing concealment restores prepared names and descriptions without changing source data", async () => {
    install();
    const { hostItem } = createHost();
    const flags = { [Constants.MODULE_ID]: { [Constants.FLAG_SOURCE_GEM]: { slot: 0 } } };
    const source = { name: "Venom Strike", img: "icons/poison.webp", description: { chatFlavor: "Poison gem" } };
    const activity = { ...source, flags, _source: source };
    const effect = { name: "Venom", img: source.img, description: "Poison gem effect", flags };
    hostItem.system.activities = [activity];
    hostItem.effects = [effect];
    game.items.set(hostItem.id, hostItem);
    GemConcealmentService.refreshPreparedContent();
    assert.equal(activity.name, "Unidentified Gem");
    assert.equal(activity.description.chatFlavor, "");
    assert.equal(effect.description, "");
    assert.equal(source.name, "Venom Strike");
    assert.equal(source.description.chatFlavor, "Poison gem");

    await game.settings.set(Constants.MODULE_ID, "concealUnidentifiedGems", false);
    GemConcealmentService.refreshPreparedContent();
    assert.equal(activity.name, "Venom Strike");
    assert.equal(activity.img, source.img);
    assert.equal(activity.description.chatFlavor, "Poison gem");
    assert.equal(effect.description, "Poison gem effect");
    await game.settings.set(Constants.MODULE_ID, "concealUnidentifiedGems", true);
    GemConcealmentService.refreshPreparedContent();
    assert.equal(activity.name, "Unidentified Gem");
  });

  test("activities and effects granted by a concealed gem are masked in prepared data", () => {
    install();
    const { hostItem } = createHost();
    const fromGem = { [Constants.MODULE_ID]: { [Constants.FLAG_SOURCE_GEM]: { slot: 0 } } };
    const gemActivity = { name: "Venom Strike", img: "icons/poison.webp", description: { chatFlavor: "Sssss" }, flags: fromGem };
    const ownActivity = { name: "Attack", img: "icons/dagger.webp", flags: {} };
    const gemEffect = { name: "Poisoned Blade", img: "icons/poison.webp", flags: fromGem };
    hostItem.system.activities = [gemActivity, ownActivity];
    hostItem.effects = [gemEffect];

    GemConcealmentService.maskTransferredContent(hostItem);

    assert.equal(gemActivity.name, "Unidentified Gem");
    assert.equal(gemActivity.img, GemConcealmentService.PLACEHOLDER_IMG);
    assert.equal(gemActivity.description.chatFlavor, "");
    assert.equal(ownActivity.name, "Attack");
    assert.equal(gemEffect.name, "Unidentified Gem");

    const untouched = { name: "Venom Strike", flags: fromGem };
    hostItem.system.activities = [untouched];
    GemConcealmentService.maskTransferredContent(hostItem, { isGM: true });
    assert.equal(untouched.name, "Venom Strike");
  });
});
