import { Constants } from "../Constants.js";

const BADGE_CLASS = "sc-sockets-activity-badge";

const SOCKET_FLAG = Constants.FLAGS?.sockets ?? "sockets";

export class ItemActivityBadges {
  static #handlers = new Map();

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

    const activities = item.system?.activities;
    if (!activities?.size) return;

    const activityMap = this.#buildActivityMap(item);
    if (!activityMap.size) {
      this.#clearBadges(root);
      return;
    }

    for (const activity of activities) {
      const node = root.querySelector(`.activity.card[data-activity-id="${activity.id}"] .icon`);
      this.#decorateIcon(node, activity, activityMap.get(activity.id));
    }
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
      this.#decorateIcon(icon, activity, activityMap.get(activity.id));
    });
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") return html[0] ?? html.get(0);
    if (html instanceof Element || html?.querySelector) return html;
    return null;
  }

  static #clearBadges(root) {
    root.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
  }

  static #buildActivityMap(item) {
    const data = item.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES) ?? {};
    const sockets = item.getFlag(Constants.MODULE_ID, SOCKET_FLAG) ?? [];
    const map = new Map();
    for (const [slotKey, entry] of Object.entries(data)) {
      if (!entry) continue;
      const activityIds = Array.isArray(entry.activityIds) ? entry.activityIds : [];
      const meta = entry.activityMeta ?? {};
      const slotIndex = Number(slotKey);
      const socketInfo = Array.isArray(sockets) ? sockets[slotIndex] : sockets?.[slotKey];
      for (const activityId of activityIds) {
        const info = meta[activityId] ?? {};
        map.set(activityId, {
          slot: slotKey,
          gemImg: info.gemImg ?? entry.gemImg ?? socketInfo?.img ?? socketInfo?.gem?.img ?? Constants.SOCKET_SLOT_IMG,
          gemName: info.gemName ?? entry.gemName ?? socketInfo?.gem?.name ?? socketInfo?.name ?? item.name,
          activityName: info.activityName ?? null,
          sourceId: info.sourceId ?? null
        });
      }
    }
    return map;
  }

  static #decorateIcon(node, activity, meta) {
    if (!node) return;
    node.querySelector(`.${BADGE_CLASS}`)?.remove();

    if (!meta) return;

    const imgSrc = meta.gemImg ?? Constants.SOCKET_SLOT_IMG;
    const label = meta.gemName ?? activity.name;

    node.style.position ??= "relative";

    const badge = document.createElement("div");
    badge.className = BADGE_CLASS;
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
