import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { Constants } from "../scripts/core/Constants.js";
import { HiddenSocketContent as Content } from "../scripts/domain/gems/HiddenSocketContent.js";
import { HiddenSocketContentIntegration as Integration } from "../scripts/core/integration/HiddenSocketContentIntegration.js";
import { clearFoundryStubs, installFoundryStubs, TestCollection } from "./support/foundryStubs.js";

const hooks = new Map();
let originalDnd5e, originalFromUuid;
let choices, originalUses;
class Choice {
  constructor(item) { this.item = item; }
  static async create(item) { choices++; return Content.visibleActivities(item)[0]; }
  async _prepareContext() { return { activities: Content.entries(this.item.system.activities).filter((a) => a.canUse).map((a) => ({ id: a.id, name: a.name })) }; }
}
class Item {
  constructor() {
    this.documentName = "Item";
    this.id = "weapon";
    this.actor = {};
    this.flags = { [Constants.MODULE_ID]: { sockets: [{ gem: { name: "Ruby" }, slotConfig: { hidden: true } }] } };
    const source = { [Constants.MODULE_ID]: { [Constants.FLAG_SOURCE_GEM]: { slot: 0 } } };
    const activity = (id, flags = {}) => ({ id, flags, name: id, canUse: true, canConfigure: true, item: this, use: async (...args) => ({ id, args }) });
    this.system = { identified: true, activities: new TestCollection([["secret", activity("secret", source)], ["attack", activity("attack")]]) };
    this.effects = new TestCollection([["secret", { id: "secret", flags: source, disabled: false, parent: this }], ["visible", { id: "visible", parent: this }], ["excluded", { id: "excluded", parent: this }]]);
  }
  getFlag(module, key) { return this.flags[module]?.[key]; }
  async use(...args) { originalUses++; return { original: true, args }; }
  displayCard() { return "item-card"; }
}
class Sheet {
  constructor(item) { this.item = item; }
  async _prepareActivitiesContext(context) { return context; }
  async _prepareEffectsContext(context) { return context; }
}

beforeEach(() => {
  originalDnd5e = globalThis.dnd5e;
  originalFromUuid = globalThis.fromUuidSync;
  installFoundryStubs({ user: { id: "player", isGM: false } });
  Hooks.on = (name, callback) => hooks.set(name, callback);
  globalThis.dnd5e = { documents: { Item5e: Item }, applications: { activity: { ActivityChoiceDialog: Choice }, item: { ItemSheet5e: Sheet } } };
  choices = originalUses = 0;
  Integration.activate();
});
afterEach(() => {
  clearFoundryStubs();
  globalThis.dnd5e = originalDnd5e;
  globalThis.fromUuidSync = originalFromUuid;
});

test("item use preserves the native method, arguments and other wrappers for players", async () => {
  const item = new Item();
  const config = { chooseActivity: true };
  const dialog = { options: { sheet: "sheet" } }, message = { flag: true };
  const result = await item.use(config, dialog, message);
  assert.equal(result.original, true);
  assert.deepEqual(result.args, [config, dialog, message]);
  assert.equal(originalUses, 1);
  assert.equal(item.system.activities.size, 2);
  assert.equal(item.effects.get("secret").disabled, false);
});

test("quick use of a hidden first activity selects the first visible one with the caller's arguments and result", async () => {
  const item = new Item();
  const event = { shiftKey: true };
  const dialog = { configure: false, options: { sheet: "sheet" } }, message = { create: false };
  const pending = item.use({ event, chooseActivity: true, consume: false }, dialog, message);
  assert.ok(pending instanceof Promise);
  const result = await pending;
  assert.equal(result.id, "attack");
  assert.deepEqual(result.args[0], { event, consume: false });
  assert.equal(result.args[1], dialog);
  assert.equal(result.args[2], message);
  assert.equal(originalUses, 0);
});

test("quick use keeps the native method when the first usable activity is visible or none is", async () => {
  const item = new Item();
  item.system.activities.get("secret").canUse = false;
  assert.equal((await item.use({ event: { shiftKey: true } })).original, true);
  item.system.activities.get("secret").canUse = true;
  item.system.activities.delete("attack");
  assert.equal((await item.use({ event: { shiftKey: true } })).original, true);
  item.pack = "world.items";
  item.system.activities.set("attack", { id: "attack", canUse: true });
  assert.equal((await item.use({ event: { shiftKey: true } })).original, true);
  assert.equal(originalUses, 3);
});

test("all-hidden activity choices return null without overriding item use", async () => {
  const item = new Item();
  item.system.activities.delete("attack");
  assert.equal((await item.use()).original, true);
  assert.equal(await Choice.create(item), null);
  assert.equal(choices, 0);
});

test("multiple visible activities retain the native chooser", async () => {
  const item = new Item();
  item.system.activities.set("second", { id: "second", canUse: true });
  await Choice.create(item);
  assert.equal(choices, 1);
  const context = await new Choice(item)._prepareContext();
  assert.deepEqual(context.activities.map((a) => a.id), ["attack", "second"]);
});

test("the chooser's factory handles zero and one visible option before rendering", async () => {
  const item = new Item();
  assert.equal((await Choice.create(item)).id, "attack");
  assert.equal(choices, 0);
});

test("GM and items without hidden grants use the original system method", async () => {
  const item = new Item();
  game.user.isGM = true;
  assert.equal((await item.use()).original, true);
  game.user.isGM = false;
  item.flags[Constants.MODULE_ID].sockets[0].slotConfig.hidden = false;
  assert.equal((await item.use()).original, true);
  assert.equal(originalUses, 2);
});

test("programmatic hidden activity use is preserved for players without a UI veto", async () => {
  assert.equal(hooks.get("dnd5e.preUseActivity")(new Item().system.activities.get("secret"), {}), undefined);
  const activity = new Item().system.activities.get("secret");
  assert.equal((await activity.use()).id, "secret");
});

test("native contexts filter descriptors and preserve empty categories and creation controls without changing effect documents", async () => {
  const item = new Item();
  const sheet = new Sheet(item);
  const context = {
    activities: [{ id: "secret" }, { id: "attack", riders: [{ id: "secret" }] }],
    effects: { passive: { effects: [{ id: "secret" }] }, empty: { effects: [] }, visible: { effects: [{ id: "visible" }] } }
  };
  await sheet._prepareActivitiesContext(context);
  await sheet._prepareEffectsContext(context);
  assert.deepEqual(context.activities, [{ id: "attack", riders: [] }]);
  assert.deepEqual(Object.keys(context.effects), ["passive", "empty", "visible"]);
  assert.deepEqual(context.effects.passive.effects, []);
  assert.equal(item.effects.size, 3);
});

test("Tidy uses its actual counting callback, including its own filters", () => {
  const item = new Item();
  const context = { tabs: [{ id: "effects", itemCount: ({ document }) => document.effects.filter((effect) => effect.id !== "excluded").length }] };
  Content.filterTidyContext(item, context);
  assert.equal(context.tabs[0].itemCount({ document: item }), 1);
  Content.filterTidyContext(item, context);
  assert.equal(context.tabs[0].itemCount({ document: item }), 1, "multiple hooks do not subtract twice");
  assert.equal(item.effects.size, 3);
  game.user.isGM = true;
  assert.equal(context.tabs[0].itemCount({ document: item }), 2);
});

test("counter reevaluation handles equal raw numbers after deleting a visible activity", () => {
  const item = new Item();
  const context = { tabs: [{ id: "activities", itemCount: ({ document }) => document.system.activities.filter((activity) => activity.canConfigure).length }] };
  Content.filterTidyContext(item, context);
  const count = () => context.tabs[0].itemCount({ document: item });
  assert.equal(count(), 1);
  item.system.activities.delete("attack");
  assert.equal(count(), 0);
  item.flags[Constants.MODULE_ID].sockets[0].slotConfig.hidden = false;
  assert.equal(count(), 1);
});

test("Tidy's play hook and section contexts exclude hidden activities", () => {
  const item = new Item();
  const play = { activities: [...item.system.activities] };
  hooks.get("tidy5e-sheet.getActivitiesForPlay")(item, play);
  assert.deepEqual(play.activities.map((a) => a.id), ["attack"]);
  const context = { activities: [{ activities: [{ id: "secret" }] }], effects: [] };
  hooks.get("tidy5e-sheet.preConfigureSections")({ item }, null, context);
  assert.deepEqual(context.activities, [{ activities: [] }]);
});

test("legacy activity mappings are still honored without source flags", () => {
  const item = new Item();
  item.system.activities.get("secret").flags = {};
  item.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES] = { 0: { activityIds: ["secret"] } };
  assert.equal(Content.isHidden(item, { id: "secret" }), true);
});

test("actor effect contexts resolve the parent item without hiding an actor's own effects", () => {
  const item = new Item();
  const actor = { documentName: "Actor", items: new TestCollection([[item.id, item]]) };
  const context = { effects: { passive: { effects: [{ id: "secret", parentId: item.id }, { id: "secret", parentId: null }] } } };
  Content.filterContext(actor, context);
  assert.deepEqual(context.effects.passive.effects, [{ id: "secret", parentId: null }]);
});

test("libWrapper registrations mix into item use and the choice factory and wrap choice presentation", () => {
  const original = globalThis.libWrapper;
  const types = new Map();
  globalThis.libWrapper = { register: (_module, path, _callback, type) => types.set(path, type) };
  globalThis.dnd5e = {
    documents: { Item5e: class { use() {} } },
    applications: { activity: { ActivityChoiceDialog: class { static create() {} _prepareContext() {} } } }
  };
  try {
    Integration.activate();
    assert.equal(types.get("dnd5e.documents.Item5e.prototype.use"), "MIXED");
    assert.equal(types.get("dnd5e.applications.activity.ActivityChoiceDialog.create"), "MIXED");
    assert.equal(types.get("dnd5e.applications.activity.ActivityChoiceDialog.prototype._prepareContext"), "WRAPPER");
  } finally {
    globalThis.libWrapper = original;
  }
});

test("standalone unidentified gems keep activities and effects out of player contexts while preserving programmatic use", async () => {
  await game.settings.set(Constants.MODULE_ID, "concealUnidentifiedGems", true);
  const item = new Item();
  item.type = "loot";
  item.system.type = { value: "gem" };
  item.system.identified = false;
  item.flags[Constants.MODULE_ID].sockets = [];
  for (const activity of item.system.activities) activity.flags = {};
  const context = {
    tabs: [{ id: "description" }, { id: "activities" }, { id: "effects" }, { id: `${Constants.MODULE_ID}-tidy-gem-details` }],
    activities: [...item.system.activities], effects: [{ effects: [...item.effects] }]
  };
  Content.filterTidyContext(item, context);
  assert.deepEqual(context.tabs, [{ id: "description" }]);
  assert.deepEqual(context.activities, []);
  assert.deepEqual(context.effects, [{ effects: [] }]);
  assert.equal((await item.use()).original, true);
  assert.equal(choices, 0);
  item.system.identified = true;
  assert.equal((await item.use()).original, true);
});

test("Tidy counts tolerate an unmounted context and preserve tab class behavior", () => {
  const item = new Item();
  class Tab {
    #label = "Effects";
    id = "effects";
    get label() { return this.#label; }
    title() { return this.#label; }
    itemCount({ document }) {
      assert.equal(this.#label, "Effects");
      return document.effects.length;
    }
  }
  const original = new Tab();
  const context = { tabs: [original] };
  Content.filterTidyContext(item, undefined);
  Content.filterTidyContext(item, context);
  Content.filterTidyContext(item, context);
  assert.ok(context.tabs[0] instanceof Tab);
  assert.equal(context.tabs[0].label, "Effects");
  assert.equal(context.tabs[0].title(), "Effects");
  assert.equal(context.tabs[0].title, context.tabs[0].title);
  const view = context.tabs[0];
  const count = view.itemCount;
  Content.filterTidyContext(item, context);
  assert.equal(context.tabs[0], view);
  assert.equal(context.tabs[0].itemCount, count);
  assert.equal(context.tabs[0].itemCount(), 2);
  assert.equal(context.tabs[0].itemCount(null), 2);
  assert.equal(original.itemCount({ document: { effects: [1, 2, 3] } }), 3);
});

test("an unavailable chooser does not prevent native item use", async () => {
  globalThis.dnd5e.applications.activity = {};
  Integration.activate();
  assert.equal((await new Item().use()).original, true);
});
