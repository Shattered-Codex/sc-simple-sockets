import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { JSDOM } from "jsdom";
import { Constants } from "../scripts/core/Constants.js";
import { ItemActivityBadges } from "../scripts/core/ui/ItemActivityBadges.js";
import { SocketContentVisibilityUI as UI } from "../scripts/core/ui/SocketContentVisibilityUI.js";
import { TidySocketDescriptionsUI } from "../scripts/core/ui/TidySocketDescriptionsUI.js";
import { clearFoundryStubs, installFoundryStubs, TestCollection } from "./support/foundryStubs.js";

const globals = ["Element", "HTMLElement", "MutationObserver", "document", "fromUuidSync"];
let saved, dom, hooks;
const flush = () => new Promise((resolve) => setTimeout(resolve, 40));

function fixture({ identified = true, legacy = false } = {}) {
  const source = { [Constants.MODULE_ID]: { [Constants.FLAG_SOURCE_GEM]: { slot: 0 } } };
  const activity = { id: "gem", name: "Fire", canConfigure: true, flags: legacy ? {} : source };
  const effect = { id: "effect", name: "Resistance", disabled: false, flags: source };
  const flags = {
    sockets: [{ gem: { name: "Ruby" }, slotConfig: { hidden: true } }],
    [Constants.FLAG_SOCKET_ACTIVITIES]: legacy ? { 0: { activityIds: [activity.id], gemName: "Unidentified Gem" } } : {}
  };
  const item = {
    id: "weapon", documentName: "Item",
    system: { identified, activities: new TestCollection([["gem", activity], ["own", { id: "own", canConfigure: true }]]) },
    effects: new TestCollection([["effect", effect]]),
    getFlag: (_module, key) => flags[key]
  };
  activity.item = item;
  effect.parent = item;
  const root = document.createElement("div");
  root.className = "tidy5e-sheet";
  root.innerHTML = `<section class="items-section">
    <div class="item activity" data-activity-id="gem" data-item-id="weapon"><div class="item-name activity-name"><span class="name name-stacked">Fire</span></div></div>
    <div class="item activity" data-activity-id="own" data-item-id="weapon">Attack</div>
    </section><section class="items-section" data-effect-type="passive"><h3>Passive Effects</h3>
    <div class="item effect" data-effect-id="effect" data-parent-id="weapon"><div class="item-name effect-name">Resistance</div></div></section>
    <section class="items-section" data-effect-type="temporary"><h3>Temporary Effects</h3></section>
    <div contenteditable="true">Description</div>`;
  document.body.append(root);
  return { item, flags, root, activity, effect, rows: [...root.querySelectorAll("[data-activity-id], [data-effect-id]")] };
}

beforeEach(() => {
  saved = Object.fromEntries(globals.map((key) => [key, globalThis[key]]));
  installFoundryStubs({ user: { id: "player", isGM: false }, settings: { [`${Constants.MODULE_ID}.concealUnidentifiedGems`]: true } });
  dom = new JSDOM("<!doctype html><body></body>");
  for (const key of globals.filter((key) => key !== "fromUuidSync")) globalThis[key] = dom.window[key];
  hooks = new Map();
  Hooks.on = (name, callback) => hooks.set(name, callback);
  Hooks.off = (name) => hooks.delete(name);
});

afterEach(() => {
  ItemActivityBadges.deactivate();
  for (const root of document.body.children) UI.disconnect(root);
  dom.window.close();
  clearFoundryStubs();
  Object.assign(globalThis, saved);
});

for (const identified of [true, false]) for (const legacy of [true, false]) {
  test(`hidden grants and badges disappear (identified=${identified}, legacy=${legacy})`, () => {
    const f = fixture({ identified, legacy });
    ItemActivityBadges.render({ item: f.item }, f.root);
    assert.equal(f.rows[0].classList.contains(UI.HIDDEN_CLASS), true);
    assert.equal(f.rows[1].classList.contains(UI.HIDDEN_CLASS), false);
    assert.equal(f.rows[2].classList.contains(UI.HIDDEN_CLASS), true);
    assert.equal(f.root.querySelectorAll(".sc-sockets-entry-badges").length, 0);
    assert.equal(f.effect.disabled, false);
    assert.equal(f.item.system.activities.size, 2);
    assert.equal(f.root.querySelector('[data-effect-type="passive"]').classList.contains("sc-sockets-hidden-section"), false);
    assert.equal(f.root.querySelector('[data-effect-type="temporary"]').classList.contains("sc-sockets-hidden-section"), false);
  });
}

test("revealing a socket or viewing as GM restores rows, sections and badges", () => {
  const f = fixture();
  ItemActivityBadges.render({ item: f.item }, f.root);
  game.user.isGM = true;
  ItemActivityBadges.render({ item: f.item }, f.root);
  assert.ok(f.rows.every((row) => !row.classList.contains(UI.HIDDEN_CLASS)));
  assert.equal(f.root.querySelectorAll(".sc-sockets-entry-badges").length, 2);
  assert.equal(f.root.querySelectorAll(".sc-sockets-hidden-section").length, 0);
  game.user.isGM = false;
  f.flags.sockets[0].slotConfig.hidden = false;
  ItemActivityBadges.render({ item: f.item }, f.root);
  assert.ok(f.rows.every((row) => !row.classList.contains(UI.HIDDEN_CLASS)));
});

test("a Svelte class rewrite and a lazily mounted row are concealed again without looping", async () => {
  const f = fixture();
  ItemActivityBadges.render({ item: f.item }, f.root);
  f.rows[0].className = "item activity highlighted";
  await flush();
  assert.equal(f.rows[0].hasAttribute(UI.HIDDEN_ATTRIBUTE), true);
  const row = f.rows[0].cloneNode(true);
  row.className = "item activity";
  f.root.append(row);
  await flush();
  assert.equal(row.classList.contains(UI.HIDDEN_CLASS), true);
  await flush();
});

test("description edits and module writes do not trigger visibility scans", async () => {
  const f = fixture();
  let scans = 0;
  UI.observe(f.root, () => { scans++; UI.render(f.root, { activityMap: new Map([["gem", { hidden: true }]]) }); });
  f.root.querySelector('[contenteditable]').textContent = "Typing a description";
  await flush();
  assert.equal(scans, 0);
  f.rows[0].dataset.activityId = "gem";
  await flush();
  await flush();
  assert.equal(scans, 1);
});

test("actor rows resolve their parent item, including colliding activity IDs", () => {
  const f = fixture();
  const other = { ...f.item, id: "other", getFlag: () => [] };
  const actor = { id: "actor", items: new TestCollection([[f.item.id, f.item], [other.id, other]]) };
  const visible = f.rows[0].cloneNode(true);
  visible.dataset.itemId = "other";
  f.root.append(visible);
  UI.render(f.root, { actor });
  assert.equal(f.rows[0].classList.contains(UI.HIDDEN_CLASS), true);
  assert.equal(f.rows[2].classList.contains(UI.HIDDEN_CLASS), true);
  assert.equal(visible.classList.contains(UI.HIDDEN_CLASS), false);
});

test("chat cards respect the viewing user and restore after revealing the socket", () => {
  const f = fixture();
  f.root.classList.add("message");
  const message = { getAssociatedActivity: () => f.activity, getAssociatedItem: () => f.item };
  UI.renderChat(message, f.root);
  assert.equal(f.root.classList.contains(UI.HIDDEN_CLASS), true);
  game.user.isGM = true;
  UI.renderChat(message, f.root);
  assert.equal(f.root.classList.contains(UI.HIDDEN_CLASS), false);
  game.user.isGM = false;
  f.flags.sockets[0].slotConfig.hidden = false;
  UI.renderChat(message, f.root);
  assert.equal(f.root.classList.contains(UI.HIDDEN_CLASS), false);
});

test("mixed chat cards hide only the hidden activity and its empty section", () => {
  const f = fixture();
  f.root.innerHTML = '<section class="activities"><li data-activity-uuid="hidden">Fire</li></section><p>Ordinary item content</p>';
  globalThis.fromUuidSync = () => f.activity;
  UI.renderChat({}, f.root);
  assert.equal(f.root.classList.contains(UI.HIDDEN_CLASS), false);
  assert.equal(f.root.querySelector("section").classList.contains("sc-sockets-hidden-section"), true);
  assert.equal(f.root.querySelector("p").textContent, "Ordinary item content");
});

test("legacy badge metadata cannot override the repaired name, but unidentified gems stay masked", () => {
  const f = fixture({ legacy: true });
  f.flags.sockets[0].slotConfig.hidden = false;
  ItemActivityBadges.render({ item: f.item }, f.root);
  assert.equal(f.root.querySelector(".sc-sockets-entry-badges .gem").dataset.tooltip, "Ruby");
  f.item.system.identified = false;
  ItemActivityBadges.render({ item: f.item }, f.root);
  assert.equal(f.root.querySelector(".sc-sockets-entry-badges .gem").dataset.tooltip, "Unidentified Gem");
});

test("Tidy descriptions never fall back to the sheet root when the tab is absent", async () => {
  const f = fixture();
  f.flags.sockets[0].slotConfig.hidden = false;
  await TidySocketDescriptionsUI.renderInto(f.root, f.item);
  assert.equal(f.root.querySelector(TidySocketDescriptionsUI.SELECTOR), null);
});

test("Tidy descriptions are inserted inside a mounted description tab", async () => {
  const f = fixture({ identified: false });
  f.flags.sockets[0].slotConfig.hidden = false;
  const tab = document.createElement("section");
  tab.className = "tidy-tab description";
  f.root.append(tab);
  await TidySocketDescriptionsUI.renderInto(f.root, f.item);
  const section = f.root.querySelector(TidySocketDescriptionsUI.SELECTOR);
  assert.ok(section);
  assert.equal(section.parentElement, tab);
});

test("an extracted unknown gem hides native tabs and extra contexts until identified", async () => {
  const { GemSheetExtension } = await import("../scripts/core/GemSheetExtension.js");
  const { GemDetailsBuilder } = await import("../scripts/domain/gems/GemDetailsBuilder.js");
  const { GemTargetFilterBuilder } = await import("../scripts/domain/gems/GemTargetFilterBuilder.js");
  class Sheet {
    static TABS = [{ tab: "activities", condition: () => true }, { tab: "effects", condition: () => true }];
    static PARTS = {};
    static itemHasActivities() { return true; }
    async _preparePartContext(_id, context) { return context; }
  }
  const f = fixture({ identified: false });
  f.item.type = "loot";
  f.item.system.type = { value: "gem" };
  f.flags.sockets = [];
  f.activity.flags = {};
  f.effect.flags = {};
  const extension = new GemSheetExtension({ sheetClass: Sheet });
  extension.applyChanges();
  const visible = () => Sheet.TABS.filter((tab) => tab.condition(f.item)).map((tab) => tab.tab);
  assert.deepEqual(visible(), []);
  assert.equal(Sheet.itemHasActivities(f.item), false);
  assert.equal(GemDetailsBuilder.buildContext(f.item).isGem, false);
  assert.equal(GemTargetFilterBuilder.buildContext(f.item).isGem, false);
  ItemActivityBadges.render({ item: f.item }, f.root);
  assert.ok(f.rows.every((row) => row.classList.contains(UI.HIDDEN_CLASS)));
  game.user.isGM = true;
  assert.deepEqual(visible(), ["activities", "effects", "sc-sockets-gem-details"]);
  assert.equal(Sheet.itemHasActivities(f.item), true);
  game.user.isGM = false;
  f.item.system.identified = true;
  assert.deepEqual(visible(), ["activities", "effects", "sc-sockets-gem-details"]);
  assert.equal(GemDetailsBuilder.buildContext(f.item).isGem, true);
});

test("an unidentified standalone gem does not expose an extra socket description card", async () => {
  const { GemSocketDescriptionUI } = await import("../scripts/core/ui/GemSocketDescriptionUI.js");
  const f = fixture({ identified: false });
  f.item.type = "loot";
  f.item.system.type = { value: "gem" };
  f.root.innerHTML = '<div class="item-descriptions"><div class="card description" data-target="system.unidentified.description">Unknown gem</div><div data-sc-sockets="socket-description">Old secret</div></div>';
  await GemSocketDescriptionUI.bindToSheet({ item: f.item, isEditable: true }, f.root);
  assert.equal(f.root.querySelector(GemSocketDescriptionUI.SELECTOR), null);
  assert.equal(f.root.querySelector(".card.description").textContent, "Unknown gem");
});

test("an equipment section retains all inventory items when its only activity is hidden", () => {
  const f = fixture();
  f.root.innerHTML = `<section class="items-section"><h3>Equipment</h3>
    <div class="item" data-item-id="weapon">Armor <div data-activity-id="gem">Secret</div></div>
    <div class="item" data-item-id="other">Visible shield</div>
    <button data-action="createItem">Create item</button></section>`;
  UI.render(f.root, { actor: { items: new TestCollection([[f.item.id, f.item]]) } });
  assert.ok(f.root.querySelector('[data-activity-id]').classList.contains(UI.HIDDEN_CLASS));
  assert.equal(f.root.querySelector("section").classList.contains("sc-sockets-hidden-section"), false);
  assert.equal(f.root.querySelector('[data-item-id="other"]').closest(`.${UI.HIDDEN_CLASS}`), null);
  assert.equal(f.root.querySelector("button").closest(`.${UI.HIDDEN_CLASS}`), null);
});

test("visibility mutations coalesce in a frame and GM sheets add no visibility observer", async () => {
  const f = fixture();
  let scans = 0;
  UI.observe(f.root, () => scans++);
  for (let i = 0; i < 3; i++) {
    f.rows[0].dataset.activityId = `activity-${i}`;
    await Promise.resolve();
  }
  assert.equal(scans, 0);
  await flush();
  assert.equal(scans, 1);
  game.user.isGM = true;
  UI.observe(f.root, () => scans++);
  f.rows[0].className = "another-state";
  await flush();
  assert.equal(scans, 1);
});

test("visibility and broken gems share one observer and release it after both unsubscribe", async () => {
  const { SheetMutationObserver } = await import("../scripts/core/ui/SheetMutationObserver.js");
  const { BrokenGemUI } = await import("../scripts/core/ui/BrokenGemUI.js");
  const NativeObserver = globalThis.MutationObserver;
  const observers = [];
  globalThis.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  const f = fixture();
  BrokenGemUI.render({ actor: { items: [] } }, f.root);
  let scans = 0;
  UI.observe(f.root, () => scans++);
  assert.equal(observers.length, 1);
  SheetMutationObserver.unsubscribe(f.root, BrokenGemUI);
  f.rows[0].dataset.activityId = "changed";
  await flush();
  assert.equal(scans, 1, "removing the overlay subscriber retains visibility tracking");
  UI.disconnect(f.root);
  f.rows[0].dataset.activityId = "changed-again";
  await flush();
  assert.equal(scans, 1);
});

test("chat hooks select a single API per Foundry generation and refresh identification/settings", async () => {
  for (const generation of [12, 13]) {
    const { HiddenSocketContentIntegration: Integration } = await import(`../scripts/core/integration/HiddenSocketContentIntegration.js?generation=${generation}`);
    hooks.clear();
    game.release = { generation };
    Integration.activate();
    const hookName = generation >= 13 ? "renderChatMessageHTML" : "renderChatMessage";
    assert.equal(hooks.has(hookName), true);
    assert.equal(hooks.has(generation >= 13 ? "renderChatMessage" : "renderChatMessageHTML"), false);
    const f = fixture({ identified: false });
    f.item.type = "loot";
    f.item.system.type = { value: "gem" };
    f.flags.sockets = [];
    f.activity.flags = {};
    f.root.classList.add("message");
    f.root.dataset.messageId = "chat";
    const message = { getAssociatedActivity: () => f.activity };
    game.messages = new Map([["chat", message]]);
    hooks.get(hookName)(message, generation >= 13 ? f.root : [f.root]);
    assert.ok(f.root.classList.contains(UI.HIDDEN_CLASS));
    f.item.system.identified = true;
    hooks.get("updateItem")(f.item, { "system.identified": true });
    assert.equal(f.root.classList.contains(UI.HIDDEN_CLASS), false);
    f.item.system.identified = false;
    hooks.get("updateItem")(f.item, { system: { identified: false } });
    assert.equal(f.root.classList.contains(UI.HIDDEN_CLASS), true);
    await game.settings.set(Constants.MODULE_ID, "concealUnidentifiedGems", false);
    const { GemConcealmentService } = await import("../scripts/domain/gems/GemConcealmentService.js");
    Hooks.callAll = (name) => hooks.get(name)?.();
    GemConcealmentService.refreshPreparedContent();
    assert.equal(f.root.classList.contains(UI.HIDDEN_CLASS), false);
    f.root.remove();
    await game.settings.set(Constants.MODULE_ID, "concealUnidentifiedGems", true);
  }
});

test("GM badges appear on lazily mounted Tidy activity and effect rows", async () => {
  game.user.isGM = true;
  const f = fixture();
  const activity = f.rows[0], effect = f.rows[2];
  activity.remove();
  effect.remove();
  ItemActivityBadges.render({ item: f.item }, f.root);
  f.root.append(activity, effect);
  await flush();
  assert.equal(activity.querySelectorAll('.sc-sockets-entry-badges .gem').length, 1);
  assert.equal(effect.querySelectorAll('.sc-sockets-entry-badges .gem').length, 1);
  assert.equal(activity.hasAttribute(UI.HIDDEN_ATTRIBUTE), false);
});

test("class changes do not schedule scans or reveal rows hidden by the module attribute", async () => {
  const f = fixture();
  UI.render(f.root, { item: f.item });
  let scans = 0;
  UI.observe(f.root, () => scans++);
  f.rows[0].className = "activity highlighted expanded";
  f.root.querySelector('section').className = "items-section expanded";
  await flush();
  assert.equal(scans, 0);
  assert.equal(f.rows[0].hasAttribute(UI.HIDDEN_ATTRIBUTE), true);
});

test("actor and chat rows use an Item UUID as the host, not as the activity", () => {
  const f = fixture();
  f.rows[0].dataset.uuid = 'Item.weapon';
  globalThis.fromUuidSync = () => f.item;
  const actor = { items: new TestCollection([[f.item.id, f.item]]) };
  UI.render(f.root, { actor });
  assert.equal(f.rows[0].hasAttribute(UI.HIDDEN_ATTRIBUTE), true);
  UI.renderChat({ getAssociatedItem: () => f.item }, f.root);
  assert.equal(f.rows[0].hasAttribute(UI.HIDDEN_ATTRIBUTE), true);
});

test("rows containing both activity and effect IDs consistently use the effect identity", () => {
  const f = fixture();
  f.rows[1].dataset.effectId = 'effect';
  for (const context of [{ item: f.item }, { actor: { items: new TestCollection([[f.item.id, f.item]]) } }]) {
    UI.render(f.root, context);
    assert.equal(f.rows[1].hasAttribute(UI.HIDDEN_ATTRIBUTE), true);
  }
  UI.renderChat({ getAssociatedItem: () => f.item }, f.root);
  assert.equal(f.rows[1].hasAttribute(UI.HIDDEN_ATTRIBUTE), true);
});

test("hidden UI activities stop before consumption; programmatic, linked and GM uses pass", async () => {
  const { HiddenSocketContentIntegration: Integration } = await import('../scripts/core/integration/HiddenSocketContentIntegration.js?ui-policy');
  Integration.activate();
  const f = fixture();
  const guard = hooks.get('dnd5e.preUseActivity');
  let consumed = 0, warnings = 0;
  ui.notifications.warn = () => warnings++;
  const use = (config = {}) => {
    if (guard(f.activity, config) === false) return;
    consumed++;
  };
  for (const shiftKey of [false, true]) {
    const event = new dom.window.MouseEvent('click', { bubbles: true, shiftKey });
    f.rows[0].dispatchEvent(event);
    use({ event });
  }
  assert.equal(consumed, 0);
  assert.equal(warnings, 2);
  use();
  const event = new dom.window.MouseEvent('click', { bubbles: true });
  f.rows[0].dispatchEvent(event);
  use({ event, cause: { activity: 'visible-source' } });
  use({ event, [Constants.MODULE_ID]: { allowHiddenActivity: true } });
  const hotbar = document.createElement('button');
  document.body.append(hotbar);
  const macroEvent = new dom.window.MouseEvent('click');
  hotbar.dispatchEvent(macroEvent);
  use({ event: macroEvent });
  const forwarded = new dom.window.MouseEvent('click', { bubbles: true });
  f.rows[1].dispatchEvent(forwarded);
  use({ event: forwarded });
  game.user.isGM = true;
  use({ event });
  assert.equal(consumed, 6);
  assert.equal(warnings, 2);
});

test("chat is not rescanned for spent uses or GM item updates", async () => {
  const { HiddenSocketContentIntegration: Integration } = await import('../scripts/core/integration/HiddenSocketContentIntegration.js?chat-updates');
  Integration.activate();
  const original = UI.refreshChat;
  let scans = 0;
  UI.refreshChat = () => scans++;
  try {
    const update = hooks.get('updateItem');
    update({}, { system: { uses: { spent: 1 } } });
    update({}, { 'system.uses.spent': 2 });
    update({}, { flags: { [Constants.MODULE_ID]: { unrelated: true } } });
    assert.equal(scans, 0);
    update({}, { 'system.identified': true });
    update({}, { flags: { [Constants.MODULE_ID]: { sockets: [] } } });
    assert.equal(scans, 2);
    game.user.isGM = true;
    update({}, { system: { identified: true } });
    assert.equal(scans, 2);
  } finally { UI.refreshChat = original; }
});
