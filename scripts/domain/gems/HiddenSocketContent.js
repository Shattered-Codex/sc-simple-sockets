import { Constants } from "../../core/Constants.js";
import { canUserSeeSlot } from "../../core/helpers/socketSlotConfig.js";
import { GemConcealmentService } from "./GemConcealmentService.js";

/** Visibility policy. Never changes documents, effect application or stored data. */
export class HiddenSocketContent {
  static #tabViews = new WeakMap();
  static #tabSources = new WeakMap();
  static entries(collection) {
    if (!collection) return [];
    if (typeof collection.values === "function") return Array.from(collection.values());
    return Object.values(collection);
  }

  static isHidden(item, document, kind = "activity", user = globalThis.game?.user) {
    if (!item || !document || !user || user.isGM) return false;
    if (GemConcealmentService.isGemConcealed(item, user)) return true;
    const id = typeof document === "string" ? document : document.id ?? document._id;
    const collection = kind === "effect" ? item.effects : item.system?.activities;
    const source = collection?.get?.(id)
      ?? this.entries(collection).find((entry) => entry.id === id)
      ?? (typeof document === "object" ? document : null);
    let slot = source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM]?.slot;
    if (slot == null && kind === "activity") {
      const grants = item.getFlag?.(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES) ?? {};
      slot = Object.entries(grants).find(([, grant]) => grant?.activityIds?.includes(id))?.[0];
    }
    if (slot == null) return false;
    const sockets = item.getFlag?.(Constants.MODULE_ID, Constants.FLAGS.sockets)
      ?? item.flags?.[Constants.MODULE_ID]?.[Constants.FLAGS.sockets];
    return !canUserSeeSlot(sockets?.[slot], user);
  }

  static resolve(uuid) {
    if (!uuid) return null;
    try { return globalThis.fromUuidSync?.(uuid, { strict: false }) ?? null; }
    catch { return null; }
  }

  static documentHidden(document, kind = "activity") {
    return this.isHidden(document?.item ?? document?.parent, document, kind);
  }

  static visibleActivities(item) {
    return this.entries(item?.system?.activities).filter((entry) => entry.canUse && !this.isHidden(item, entry));
  }

  /** Filter sheet descriptors, retaining the sheet's own eligibility and sorting. */
  static filterEntries(entries, item, kind = "activity") {
    if (!Array.isArray(entries)) return entries;
    return entries.filter((entry) => {
      const document = entry.activity ?? entry.effect ?? this.resolve(entry.uuid);
      const parent = document?.item ?? document?.parent;
      const host = parent?.documentName === "Item" ? parent
        : item?.documentName === "Actor"
          ? item.items?.get?.(entry.parentId) ?? (entry.source?.documentName === "Item" ? entry.source : null)
          : item;
      return !this.isHidden(host, document ?? entry, kind);
    }).map((entry) => {
      // Documents are shared with mechanics; only copy presentation descriptors.
      if (!entry.riders || entry.documentName) return entry;
      return { ...entry, riders: this.filterEntries(this.entries(entry.riders), item, kind) };
    });
  }

  static filterSections(sections, item, kind) {
    if (!sections) return sections;
    const field = kind === "effect" ? "effects" : "activities";
    const filter = (section) => {
      const original = section[field];
      if (!Array.isArray(original)) return section;
      const visible = this.filterEntries(original, item, kind);
      return { ...section, [field]: visible };
    };
    return Array.isArray(sections)
      ? sections.map(filter)
      : Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, filter(value)]));
  }

  static filterContext(item, context) {
    if (!context || globalThis.game?.user?.isGM) return context;
    if (context.activities?.some?.((entry) => Array.isArray(entry.activities))) {
      context.activities = this.filterSections(context.activities, item, "activity");
    } else if (Array.isArray(context.activities)) {
      context.activities = this.filterEntries(context.activities, item);
    }
    context.effects = this.filterSections(context.effects, item, "effect");
    return context;
  }

  /** A read-only collection view, exclusively for the sheet's count callback. */
  static #collectionView(collection, item, kind) {
    const visible = this.entries(collection).filter((entry) => !this.isHidden(item, entry, kind));
    Object.defineProperties(visible, {
      size: { value: visible.length },
      contents: { get: () => visible },
      get: { value: (id) => visible.find((entry) => entry.id === id) }
    });
    return visible;
  }

  static countDocument(item) {
    const system = new Proxy(item.system, {
      get: (target, key) => key === "activities"
        ? this.#collectionView(target.activities, item, "activity") : Reflect.get(target, key, target)
    });
    return new Proxy(item, {
      get: (target, key) => {
        if (key === "system") return system;
        if (key === "effects") return this.#collectionView(target.effects, item, "effect");
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }

  static filterTidyContext(item, context) {
    if (!context || globalThis.game?.user?.isGM) return;
    this.filterContext(item, context);
    if (!Array.isArray(context.tabs) || item?.documentName !== "Item") return;
    if (GemConcealmentService.isGemConcealed(item)) {
      const privateTabs = new Set(["activities", "effects", "details", "sc-sockets-gem-details",
        `${Constants.MODULE_ID}-tidy-gem-filter`, `${Constants.MODULE_ID}-tidy-gem-details`]);
      context.tabs = context.tabs.filter((tab) => !privateTabs.has(typeof tab === "string" ? tab : tab.id));
    }
    context.tabs = context.tabs.map((tab) => {
      if (!["activities", "effects"].includes(tab.id) || typeof tab.itemCount !== "function") return tab;
      const original = this.#tabSources.get(tab) ?? tab;
      let views = this.#tabViews.get(original);
      if (!views) this.#tabViews.set(original, views = new WeakMap());
      if (views.has(item)) return views.get(item);
      const itemCount = (data) => original.itemCount.call(original, {
        ...data, document: this.countDocument(data?.document ?? item)
      });
      const methods = new Map();
      // A stable view preserves class getters/private fields without mutating
      // Tidy's shared tab definitions. Every method keeps a stable identity.
      const view = new Proxy(original, {
        get(target, key) {
          if (key === "itemCount") return itemCount;
          const value = Reflect.get(target, key, target);
          if (typeof value !== "function") return value;
          if (methods.get(key)?.original !== value) methods.set(key, { original: value, bound: value.bind(target) });
          return methods.get(key).bound;
        }
      });
      views.set(item, view);
      this.#tabSources.set(view, original);
      return view;
    });
  }
}
