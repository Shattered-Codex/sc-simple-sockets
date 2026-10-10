import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Constants } from "../scripts/core/Constants.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { SocketSlot } from "../scripts/core/model/SocketSlot.js";
import { ActivityTransferService } from "../scripts/core/services/ActivityTransferService.js";
import { EffectService } from "../scripts/core/services/EffectService.js";
import { GemConcealmentService as Concealment } from "../scripts/domain/gems/GemConcealmentService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { applyPatch, createTestActor } from "./support/testDocuments.js";

const source = () => ({
  name: "Ruby", img: "ruby.webp", type: "loot",
  system: { identified: false, type: { value: "gem" }, unidentified: { name: "Strange stone" } }
});
const slot = () => SocketSlot.fillFromGem({}, { ...source(), id: "gem" }, ItemResolver.compactSnapshot(source()), 0);
const host = () => createTestActor({ items: [{
  id: "host", type: "weapon", system: { identified: true, activities: {} },
  flags: { [Constants.MODULE_ID]: { sockets: [slot()] } }
}] }).items.get("host");

beforeEach(() => installFoundryStubs({ user: { id: "player", isGM: false } }));
afterEach(() => clearFoundryStubs());

test("socket metadata falls back from empty snapshot metadata to the gem's source", () => {
  const gem = { _source: source(), name: "Strange stone", img: Concealment.PLACEHOLDER_IMG };
  const filled = SocketSlot.fillFromGem({}, gem, { name: "", img: "" }, 0);
  assert.equal(filled.gem.name, "Ruby");
  assert.equal(filled.gem.img, "ruby.webp");
});

test("transferring a masked gem stores real identity in both activity flag levels", async () => {
  const item = host();
  let writes = 0;
  const update = item.actor.updateEmbeddedDocuments.bind(item.actor);
  item.actor.updateEmbeddedDocuments = async (...args) => { writes++; return update(...args); };
  class Activity {
    constructor(data) { this.data = { ...data, _id: "copy" }; }
    _preCreate() {}
    toObject() { return structuredClone(this.data); }
  }
  CONFIG.DND5E = { activityTypes: { utility: { documentClass: Activity } } };
  const original = { _id: "source", type: "utility", name: "Fire" };
  const gem = {
    _source: source(), name: "Strange stone", img: Concealment.PLACEHOLDER_IMG, uuid: "Item.gem",
    system: { activities: { contents: [{ id: "source", toObject: () => structuredClone(original) }] } }
  };
  await ActivityTransferService.applyFromGem(item, 0, gem, {
    [Constants.MODULE_ID]: { [ActivityTransferService.UPDATE_OPTION_SKIP_REMOVE_EXISTING]: true }
  });
  const grant = item.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES][0];
  for (const meta of [grant, grant.activityMeta.copy]) {
    assert.equal(meta.gemName, "Ruby");
    assert.equal(meta.gemImg, "ruby.webp");
  }
  assert.equal(grant.activityMeta.copy.activityName, "Fire");
  assert.equal(item.system.activities.copy.name, "Fire");
  assert.equal(item.system.activities.copy.sort, 0);
  // Activities, their flag and the caller's data share one host write.
  assert.equal(writes, 1);
});

test("transferred effects use source identity for fallbacks, preserving their own source names and icons", async () => {
  const gem = {
    _source: source(), name: "Strange stone", img: Concealment.PLACEHOLDER_IMG,
    effects: { contents: [
      { id: "fallback", name: "Strange stone", img: Concealment.PLACEHOLDER_IMG, toObject: () => ({}) },
      { id: "custom", name: "Strange stone", img: Concealment.PLACEHOLDER_IMG, toObject: () => ({ name: "Resistance", img: "resist.webp" }) }
    ] }
  };
  let copied;
  await EffectService.applyGemEffects({ uuid: "Item.host", createEmbeddedDocuments: async (_type, data) => { copied = data; return []; } }, 0, gem);
  assert.equal(copied[0].name, "Ruby");
  assert.equal(copied[0].img, "ruby.webp");
  assert.equal(copied[1].name, "Resistance");
  assert.equal(copied[1].img, "resist.webp");
});

test("identification preserves custom cached slot names and images, including legacy names", () => {
  const customized = { ...slot(), name: "Legacy pommel", img: "custom-slot.webp", gem: { name: "Player nickname", img: "custom-gem.webp" } };
  const [identified] = Concealment.identifySlots([customized]);
  assert.equal(identified.name, customized.name);
  assert.equal(identified.img, customized.img);
  assert.deepEqual(identified.gem, customized.gem);
  assert.equal(ItemResolver.expandSnapshot(identified._gemData).system.identified, true);
  assert.equal(Concealment.identifySlots([identified]), null);
});

test("identification repairs existing activity caches even when slots already have their original identity", async () => {
  const item = host();
  item.flags[Constants.MODULE_ID].sockets[0]._gemData = ItemResolver.compactSnapshot({ ...source(), system: { identified: true } });
  item.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES] = {
    0: { gemName: "Strange stone", gemImg: Concealment.PLACEHOLDER_IMG, activityIds: ["copy"], activityMeta: {
      copy: { gemName: "Strange stone", gemImg: Concealment.PLACEHOLDER_IMG, activityName: "Fire", sourceId: "source" }
    } }
  };
  await Concealment.identifyHostGems(item);
  const grant = item.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES][0];
  assert.equal(grant.gemName, "Ruby");
  assert.equal(grant.gemImg, "ruby.webp");
  assert.equal(grant.activityMeta.copy.gemName, "Ruby");
  assert.equal(grant.activityMeta.copy.gemImg, "ruby.webp");
  assert.equal(grant.activityMeta.copy.activityName, "Fire");
  assert.equal(grant.activityMeta.copy.sourceId, "source");
  assert.deepEqual(grant.activityIds, ["copy"]);
});

test("identification repairs recognized persisted effect placeholders without replacing custom effects", async () => {
  const item = host();
  const flags = { [Constants.MODULE_ID]: { [Constants.FLAG_SOURCE_GEM]: { slot: 0, sourceId: "effect" } } };
  const effects = [
    { _id: "masked", flags, name: "Strange stone", img: Concealment.PLACEHOLDER_IMG, disabled: true },
    { _id: "custom", flags, name: "Custom effect", img: "custom.webp", disabled: false }
  ];
  const toObject = item.toObject.bind(item);
  item.toObject = () => ({ ...toObject(), effects: structuredClone(effects) });
  item.updateEmbeddedDocuments = async (_type, updates) => {
    for (const patch of updates) applyPatch(effects.find((effect) => effect._id === patch._id), patch);
  };
  await Concealment.identifyHostGems(item);
  assert.equal(effects[0].name, "Ruby");
  assert.equal(effects[0].img, "ruby.webp");
  assert.equal(effects[0].disabled, true);
  assert.equal(effects[1].name, "Custom effect");
  assert.equal(effects[1].img, "custom.webp");
});

test("identity repair tolerates null grants and metadata, writes slots and flags together, and parses each slot once", async () => {
  const item = host();
  item.flags[Constants.MODULE_ID].sockets.push(slot());
  item.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES] = {
    0: { gemName: 'Strange stone', activityMeta: { gone: null, copy: { gemName: 'Strange stone' } } },
    1: null
  };
  const originalExpand = ItemResolver.expandSnapshot;
  let parses = 0;
  ItemResolver.expandSnapshot = (...args) => { parses++; return originalExpand.call(ItemResolver, ...args); };
  const write = item.actor.updateEmbeddedDocuments.bind(item.actor);
  const writes = [];
  item.actor.updateEmbeddedDocuments = async (type, patches) => { writes.push(patches); return write(type, patches); };
  try { await Concealment.identifyHostGems(item); }
  finally { ItemResolver.expandSnapshot = originalExpand; }
  assert.equal(parses, 2);
  assert.equal(writes.length, 1);
  assert.ok(writes[0][0][`flags.${Constants.MODULE_ID}.sockets`]);
  assert.equal(writes[0][0][`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.0.gemName`], 'Ruby');
  assert.equal(item.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES][1], null);
});

test("identity repair returns safely when the host has disappeared", async () => {
  const { HostItemUpdateService } = await import('../scripts/core/support/HostItemUpdateService.js');
  const resolve = HostItemUpdateService.resolve;
  HostItemUpdateService.resolve = () => null;
  try { await Concealment.identifyHostGems(host()); }
  finally { HostItemUpdateService.resolve = resolve; }
});

test("placeholder recognition works across shipped languages and protects actual names", () => {
  for (const alias of ['Unidentified Gem', 'Gema não identificada', 'Strange stone']) {
    const unknown = { ...slot(), name: alias, gem: { name: alias, img: 'ruby.webp' } };
    const [identified] = Concealment.identifySlots([unknown]);
    assert.equal(identified.gem.name, 'Ruby');
    assert.equal(identified.name, 'Ruby');
    assert.equal(Concealment.isPlaceholderName(alias, source(), alias), false, 'source effect names take precedence');
    const realName = { ...source(), name: alias };
    const named = SocketSlot.fillFromGem({}, realName, ItemResolver.compactSnapshot(realName), 0);
    assert.equal(Concealment.identifySlots([named])[0].gem.name, alias);
  }
});
