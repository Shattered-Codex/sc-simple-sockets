import { Constants } from "../Constants.js";
import { HiddenSocketContent as Content } from "../../domain/gems/HiddenSocketContent.js";
import { SocketContentVisibilityUI } from "../ui/SocketContentVisibilityUI.js";

export class HiddenSocketContentIntegration {
  static #wrapped = new WeakMap();
  static #active = false;

  static activate() {
    const Choice = globalThis.dnd5e?.applications?.activity?.ActivityChoiceDialog;
    const Sheet = globalThis.dnd5e?.applications?.item?.ItemSheet5e;
    const ActorSheet = globalThis.dnd5e?.applications?.actor?.BaseActorSheet;
    this.#wrap(Choice, "create", "dnd5e.applications.activity.ActivityChoiceDialog.create", function (wrapped, item, options = {}) {
      if (!Content.entries(item.system?.activities).some((activity) => Content.isHidden(item, activity))) return wrapped(item, options);
      const visible = Content.visibleActivities(item);
      if (!visible.length) return Promise.resolve(null);
      if (visible.length === 1) return Promise.resolve(visible[0]);
      return wrapped(item, options);
    }, "MIXED");
    // Quick use (Shift, or a lone usable activity) takes the first usable
    // activity natively and skips the filtered chooser. When that one is
    // hidden, select the first visible activity before anything is prepared.
    this.#wrap(globalThis.dnd5e?.documents?.Item5e?.prototype, "use", "dnd5e.documents.Item5e.prototype.use", function (wrapped, ...args) {
      const [config = {}, ...rest] = args;
      const usable = Content.entries(this.system?.activities).filter((activity) => activity.canUse);
      const chooses = ((usable.length > 1) || config.chooseActivity) && !config.event?.shiftKey;
      if (this.pack || chooses || !usable.length || !Content.isHidden(this, usable[0])) return wrapped(...args);
      const [visible] = Content.visibleActivities(this);
      if (!visible) return wrapped(...args);
      const { chooseActivity, ...usage } = config;
      return visible.use(usage, ...rest);
    }, "MIXED");
    this.#wrap(Choice?.prototype, "_prepareContext", "dnd5e.applications.activity.ActivityChoiceDialog.prototype._prepareContext", async function (wrapped, ...args) {
      const context = await wrapped(...args);
      context.activities = Content.filterEntries(context.activities, this.item);
      return context;
    });
    for (const method of ["_prepareActivitiesContext", "_prepareEffectsContext"]) {
      this.#wrap(Sheet?.prototype, method, `dnd5e.applications.item.ItemSheet5e.prototype.${method}`, async function (wrapped, ...args) {
        return Content.filterContext(this.item, await wrapped(...args));
      });
    }
    this.#wrap(ActorSheet?.prototype, "_prepareEffectsContext", "dnd5e.applications.actor.BaseActorSheet.prototype._prepareEffectsContext", async function (wrapped, ...args) {
      return Content.filterContext(this.actor, await wrapped(...args));
    });
    if (this.#active) return;
    this.#active = true;
    Hooks.on("tidy5e-sheet.prepareSheetContext", (document, _sheet, context) => {
      Content.filterTidyContext(document, context);
    });
    Hooks.on("tidy5e-sheet.preConfigureSections", (sheet, _element, context) => {
      Content.filterTidyContext(sheet.item ?? sheet.actor ?? null, context);
    });
    Hooks.on("tidy5e-sheet.getActivitiesForPlay", (item, context) => {
      context.activities = Content.filterEntries(context.activities, item);
    });
    // Native UI passes its DOM event through to the usage config, even for
    // one activity or Shift. Macros/automation without an item UI event retain
    // their mechanics. Integrations forwarding a UI event can opt in explicitly.
    Hooks.on("dnd5e.preUseActivity", (activity, config = {}) => {
      if (!Content.documentHidden(activity) || config.cause?.activity || config[Constants.MODULE_ID]?.allowHiddenActivity === true) return;
      const event = config.event?.originalEvent ?? config.event;
      const target = event?.target ?? event?.currentTarget;
      // A UI event forwarded from a different item/activity is an automated
      // follow-up, not a direct request to use this hidden activity.
      const activityRow = target?.closest?.("[data-activity-id]");
      if (activityRow && activityRow.dataset.activityId !== activity.id) return;
      const itemRow = target?.closest?.("[data-item-id]");
      if (itemRow && itemRow.dataset.itemId !== activity.item?.id) return;
      if (!target?.closest?.('[data-item-id], [data-activity-id], [data-activity-uuid], [data-roll-item], [data-roll-activity], .chat-card, .item-sheet, .application.item, .sheet.item, .tidy5e-sheet')) return;
      ui.notifications?.warn?.("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
      return false;
    });
    const chatHook = game.release?.generation >= 13 ? "renderChatMessageHTML" : "renderChatMessage";
    Hooks.on(chatHook, (message, html) => SocketContentVisibilityUI.renderChat(message, html?.[0] ?? html));
    for (const hook of ["closeItemSheet", "closeActorSheet", "closeApplicationV2"]) {
      Hooks.on(hook, (sheet) => SocketContentVisibilityUI.disconnect(sheet.element?.[0] ?? sheet.element));
    }
    // Identification and concealment settings can change existing cards too.
    Hooks.on("updateItem", (_item, changes = {}) => {
      if (game.user?.isGM) return;
      const paths = ["system.identified", `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`,
        `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`];
      if (paths.some((path) => foundry.utils.hasProperty(changes, path)
        || Object.keys(changes).some((key) => key === path || key.startsWith(`${path}.`)))) {
        SocketContentVisibilityUI.refreshChat();
      }
    });
    Hooks.on(`${Constants.MODULE_ID}.concealmentChanged`, () => SocketContentVisibilityUI.refreshChat());
  }

  static #wrap(target, method, path, callback, type = "WRAPPER") {
    if (typeof target?.[method] !== "function") return;
    const methods = this.#wrapped.get(target) ?? new Set();
    if (methods.has(method)) return;
    const original = target[method];
    if (globalThis.libWrapper?.register) {
      libWrapper.register(Constants.MODULE_ID, path, function (wrapped, ...args) {
        return callback.call(this, wrapped.bind(this), ...args);
      }, type);
    } else {
      target[method] = function (...args) { return callback.call(this, original.bind(this), ...args); };
    }
    methods.add(method);
    this.#wrapped.set(target, methods);
  }
}
