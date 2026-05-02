import { Constants } from "../Constants.js";

const LEGACY_ACTIVITY_BADGE_CLASS = "sc-sockets-activity-badge";
const BADGE_HOST_CLASS = "sc-sockets-entry-name-with-badges";
const BADGE_WRAPPER_CLASS = "sc-sockets-entry-badges";
const OBSERVER_DEBOUNCE_MS = 50;

const SOCKET_FLAG = Constants.FLAGS?.sockets ?? "sockets";
const MODULE_MUTATION_CLASSES = [BADGE_WRAPPER_CLASS];

export class ItemActivityBadges {
  static #handlers = new Map();
  static #observerState = new WeakMap();

  static activate() {
    this.deactivate();
    if (this.#handlers.size) return;

    const itemHandler = (sheet, html, ...rest) => this.#onRenderItemSheet(sheet, html, ...rest);
    Hooks.on("renderItemSheet5e", itemHandler);
    Hooks.on("renderItemSheet", itemHandler);
    this.#handlers.set("renderItemSheet5e", itemHandler);
    this.#handlers.set("renderItemSheet", itemHandler);

    const choiceHandler = (app, html, ...rest) => this.#onRenderActivityChoice(app, html, ...rest);
    Hooks.on("renderActivityChoiceDialog", choiceHandler);
    this.#handlers.set("renderActivityChoiceDialog", choiceHandler);
  }

  static deactivate() {
    if (!this.#handlers.size) return;
    for (const [hook, handler] of this.#handlers) {
      Hooks.off(hook, handler);
    }
    this.#handlers.clear();
  }

  static #onRenderItemSheet(sheet, html) {
    const item = sheet?.item ?? sheet?.document;
    if (!item) return;

    const root = this.#rootOf(html);
    if (!root) return;

    this.#renderBadges(root, item);
    this.#observeLazyTidyContent(root, item);
  }

  static #renderBadges(root, item) {
    root.querySelectorAll(`.${LEGACY_ACTIVITY_BADGE_CLASS}`).forEach((node) => node.remove());

    const activities = item.system?.activities;
    const effects = item.effects;

    const activityMap = this.#buildActivityMap(item);
    const effectMap = this.#buildEffectMap(item);
    const renderedHosts = new Set();

    for (const activity of this.#entries(activities)) {
      const meta = activityMap.get(activity.id);
      if (!meta) continue;

      const host = this.#findActivityBadgeHost(root, activity.id);
      if (!host) continue;

      renderedHosts.add(host);
      this.#syncBadges(host, [meta]);
    }

    for (const effect of this.#entries(effects)) {
      const meta = effectMap.get(effect.id);
      if (!meta) continue;

      const host = this.#findEffectBadgeHost(root, effect.id);
      if (!host) continue;

      renderedHosts.add(host);
      this.#syncBadges(host, [meta]);
    }

    this.#clearStaleBadges(root, renderedHosts);
  }

  static #onRenderActivityChoice(app, html) {
    const item = app?.item ?? app?.document;
    if (!item) return;

    const root = this.#rootOf(html);
    if (!root) return;

    const activities = item.system?.activities;
    if (!activities?.size) return;

    const activityMap = this.#buildActivityMap(item);
    if (!activityMap.size) return;

    root.querySelectorAll("button[data-activity-id]").forEach((button) => {
      const id = button.dataset.activityId;
      const activity = activities.get?.(id) ?? activities.find?.((a) => a.id === id);
      if (!activity) return;
      const icon = button.querySelector(".icon");
      this.#decorateChoiceIcon(icon, activity, activityMap.get(activity.id));
    });
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") return html[0] ?? html.get(0);
    if (html instanceof Element || html?.querySelector) return html;
    return null;
  }

  static #entries(collection) {
    if (!collection) return [];
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (Array.isArray(collection)) return collection;
    if (typeof collection === "object") {
      return Object.values(collection).filter((entry) => entry && typeof entry === "object");
    }
    return [];
  }

  static #findActivityBadgeHost(root, activityId) {
    if (!root || !activityId) return null;

    const escapedId = this.#escapeSelectorValue(activityId);
    if (!escapedId) return null;

    const selectors = [
      `.item.activity[data-activity-id="${escapedId}"] .item-name.activity-name .name.name-stacked`,
      `.activity-row[data-activity-id="${escapedId}"] .item-name.activity-name .name.name-stacked`,
      `[data-activity-id="${escapedId}"] .item-name.activity-name .name.name-stacked`,
      `.tidy-table-row.activity[data-activity-id="${escapedId}"] .tidy-table-cell.primary .item-name .cell-text`,
      `[data-activity-id="${escapedId}"] .tidy-table-cell.primary .item-name .cell-text`,
      `.activity.card[data-activity-id="${escapedId}"] .name`,
      `[data-activity-id="${escapedId}"] .item-name .cell-text`,
      `[data-activity-id="${escapedId}"] .cell-text`
    ];

    return this.#findFirst(root, selectors);
  }

  static #findEffectBadgeHost(root, effectId) {
    if (!root || !effectId) return null;

    const escapedId = this.#escapeSelectorValue(effectId);
    if (!escapedId) return null;

    const selectors = [
      `.item.effect[data-effect-id="${escapedId}"] .item-name.effect-name .name.name-stacked`,
      `.activity-row[data-effect-id="${escapedId}"] .item-name.effect-name .name.name-stacked`,
      `[data-effect-id="${escapedId}"] .item-name.effect-name .name.name-stacked`,
      `.item.effect[data-effect-id="${escapedId}"] .item-name.effect-name .truncate`,
      `[data-effect-id="${escapedId}"] .item-name.effect-name .truncate`,
      `.item.effect[data-effect-id="${escapedId}"] .item-name.effect-name`,
      `[data-effect-id="${escapedId}"] .item-name.effect-name`,
      `[data-effect-id="${escapedId}"] .tidy-table-cell.primary .item-name .cell-text`,
      `[data-effect-id="${escapedId}"] .item-name .cell-text`,
      `[data-effect-id="${escapedId}"] .cell-text`,
      `[data-effect-id="${escapedId}"] .cell-name`
    ];

    return this.#findFirst(root, selectors);
  }

  static #findFirst(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node instanceof HTMLElement) return node;
    }

    return null;
  }

  static #escapeSelectorValue(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (globalThis.CSS?.escape) return globalThis.CSS.escape(text);
    return text.replace(/["\\]/g, "\\$&");
  }

  static #buildActivityMap(item) {
    const data = item.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES) ?? {};
    const sockets = item.getFlag(Constants.MODULE_ID, SOCKET_FLAG) ?? [];
    const activities = item.system?.activities;
    const map = new Map();
    for (const [slotKey, entry] of Object.entries(data)) {
      if (!entry) continue;
      const activityIds = Array.isArray(entry.activityIds) ? entry.activityIds : [];
      const meta = entry.activityMeta ?? {};
      const slotIndex = Number(slotKey);
      const socketInfo = Array.isArray(sockets) ? sockets[slotIndex] : sockets?.[slotKey];
      for (const activityId of activityIds) {
        const info = meta[activityId] ?? {};
        const flagImg = info.gemImg !== Constants.SOCKET_SLOT_IMG ? info.gemImg : null;
        const entryImg = entry.gemImg !== Constants.SOCKET_SLOT_IMG ? entry.gemImg : null;
        map.set(activityId, {
          slot: slotKey,
          gemImg: socketInfo?.gem?.img ?? flagImg ?? entryImg ?? socketInfo?.img ?? Constants.SOCKET_SLOT_IMG,
          gemName: info.gemName ?? entry.gemName ?? socketInfo?.gem?.name ?? socketInfo?.name ?? item.name,
          activityName: info.activityName ?? null,
          sourceId: info.sourceId ?? null
        });
      }
    }

    for (const activity of this.#entries(activities)) {
      if (!activity?.id || map.has(activity.id)) continue;

      const sourceGem = this.#getModuleFlags(activity)[Constants.FLAG_SOURCE_GEM];
      if (!sourceGem) continue;

      const slotKey = String(sourceGem.slot);
      const socketInfo = Array.isArray(sockets) ? sockets[sourceGem.slot] : sockets?.[slotKey];
      map.set(activity.id, {
        slot: slotKey,
        gemImg: socketInfo?.img ?? socketInfo?.gem?.img ?? Constants.SOCKET_SLOT_IMG,
        gemName: socketInfo?.gem?.name ?? socketInfo?.name ?? item.name,
        activityName: activity.name ?? null,
        sourceId: sourceGem.sourceId ?? null
      });
    }

    return map;
  }

  static #buildEffectMap(item) {
    const sockets = item.getFlag(Constants.MODULE_ID, SOCKET_FLAG) ?? [];
    const map = new Map();

    for (const effect of this.#entries(item.effects)) {
      if (!effect?.id) continue;

      const sourceGem = this.#getModuleFlags(effect)[Constants.FLAG_SOURCE_GEM];
      if (!sourceGem) continue;

      const slotKey = String(sourceGem.slot);
      const slotIndex = Number(sourceGem.slot);
      const socketInfo = Array.isArray(sockets) ? sockets[slotIndex] : sockets?.[slotKey];
      const socketGem = socketInfo?.gem ?? {};

      map.set(effect.id, {
        slot: slotKey,
        gemImg: socketGem.img ?? socketInfo?.img ?? Constants.SOCKET_SLOT_IMG,
        gemName: socketGem.name ?? socketInfo?.name ?? item.name,
        sourceId: sourceGem.sourceId ?? null
      });
    }

    return map;
  }

  static #getModuleFlags(documentLike) {
    if (!documentLike || typeof documentLike !== "object") return {};

    const directFlags = documentLike.flags?.[Constants.MODULE_ID];
    if (directFlags && typeof directFlags === "object") {
      return directFlags;
    }

    const sourceFlags = documentLike.toObject?.()?.flags?.[Constants.MODULE_ID];
    return sourceFlags && typeof sourceFlags === "object" ? sourceFlags : {};
  }

  static #syncBadges(host, badges) {
    host.classList.add(BADGE_HOST_CLASS);

    const signature = this.#buildBadgeSignature(badges);
    const existing = this.#findBadgeWrapper(host);
    if (existing?.dataset.scSocketsBadgeSignature === signature) return;

    this.#removeBadgeWrappers(host);
    this.#injectBadges(host, badges, signature);
  }

  static #injectBadges(host, badges, signature) {
    const wrapper = document.createElement(host.matches("a, button, span") ? "span" : "div");
    wrapper.className = `${BADGE_WRAPPER_CLASS} sc-sockets-badges sc-sockets-badges-inline`;
    wrapper.dataset.scSocketsBadgeSignature = signature;

    for (const entry of badges) {
      const badge = document.createElement("span");
      badge.className = "gem";

      const label = String(entry?.gemName || "Socketed Gem").trim();
      if (label) {
        badge.dataset.tooltip = label;
        badge.dataset.tooltipDirection = "LEFT";
      }

      const image = document.createElement("img");
      image.src = String(entry?.gemImg || "").trim() || Constants.SOCKET_SLOT_IMG;
      image.alt = label;
      image.draggable = false;

      badge.append(image);
      wrapper.append(badge);
    }

    host.append(wrapper);
  }

  static #buildBadgeSignature(badges) {
    return badges
      .map((entry) => [
        String(entry?.gemName || "Socketed Gem").trim(),
        String(entry?.gemImg || "").trim(),
        String(entry?.slot ?? "").trim()
      ].join("|"))
      .join(";");
  }

  static #findBadgeWrapper(host) {
    return Array.from(host.children).find((child) => (
      child instanceof HTMLElement
      && child.classList.contains(BADGE_WRAPPER_CLASS)
    )) ?? null;
  }

  static #removeBadgeWrappers(host) {
    Array.from(host.children)
      .filter((child) => child instanceof HTMLElement && child.classList.contains(BADGE_WRAPPER_CLASS))
      .forEach((node) => node.remove());
  }

  static #clearStaleBadges(root, renderedHosts) {
    root.querySelectorAll(`.${BADGE_WRAPPER_CLASS}`).forEach((wrapper) => {
      const host = wrapper.parentElement;
      if (host && renderedHosts.has(host)) return;
      wrapper.remove();
    });

    root.querySelectorAll(`.${BADGE_HOST_CLASS}`).forEach((host) => {
      if (this.#findBadgeWrapper(host)) return;
      host.classList.remove(BADGE_HOST_CLASS);
    });
  }

  static #observeLazyTidyContent(root, item) {
    if (!(root instanceof HTMLElement)) return;
    this.#disconnectObserver(root);

    if (!this.#isTidyRoot(root)) return;

    const state = { timer: null };
    const observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => this.#isOwnBadgeMutation(mutation))) return;

      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.timer = null;
        if (!root.isConnected) {
          this.#disconnectObserver(root);
          return;
        }
        this.#renderBadges(root, item);
      }, OBSERVER_DEBOUNCE_MS);
    });

    observer.observe(root, { childList: true, subtree: true });
    this.#observerState.set(root, { observer, state });
  }

  static #disconnectObserver(root) {
    const existing = this.#observerState.get(root);
    if (!existing) return;

    existing.observer.disconnect();
    if (existing.state.timer) clearTimeout(existing.state.timer);
    this.#observerState.delete(root);
  }

  static #isTidyRoot(root) {
    return root.matches?.(".tidy5e-sheet, .tidy-tab, .tidy-table, [data-tidy-sheet-part]")
      || Boolean(root.querySelector(".tidy5e-sheet, .tidy-tab, .tidy-table, [data-tidy-sheet-part]"));
  }

  static #isOwnBadgeMutation(mutation) {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    if (!nodes.length) return false;

    return nodes.every((node) => (
      node instanceof HTMLElement
      && MODULE_MUTATION_CLASSES.some((className) => (
        node.classList.contains(className)
        || Boolean(node.closest?.(`.${className}`))
      ))
    ));
  }

  static #decorateChoiceIcon(node, activity, meta) {
    if (!node) return;
    node.querySelector(`.${LEGACY_ACTIVITY_BADGE_CLASS}`)?.remove();

    if (!meta) return;

    const imgSrc = meta.gemImg ?? Constants.SOCKET_SLOT_IMG;
    const label = meta.gemName ?? activity.name;

    if (!node.style.position) {
      node.style.position = "relative";
    }

    const badge = document.createElement("div");
    badge.className = LEGACY_ACTIVITY_BADGE_CLASS;
    badge.dataset.tooltip = label;
    badge.dataset.tooltipDirection = "LEFT";

    const img = document.createElement("img");
    img.src = imgSrc;
    img.alt = label;
    img.draggable = false;

    badge.appendChild(img);
    node.appendChild(badge);
  }
}
