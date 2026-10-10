import { SheetMutationObserver } from "./SheetMutationObserver.js";
import { HiddenSocketContent as Content } from "../../domain/gems/HiddenSocketContent.js";

const ROWS = "[data-activity-id], [data-effect-id], [data-activity-uuid]";
const SECTIONS = ".items-section, .tidy-table, .tidy-table-container";
const EDITORS = "[contenteditable], prose-mirror, .editor, .prosemirror";

/** Presentation only; document collections and passive effects remain intact. */
export class SocketContentVisibilityUI {
  static HIDDEN_ATTRIBUTE = "data-sc-sockets-hidden";
  static HIDDEN_CLASS = "sc-sockets-hidden-content";

  static render(root, { activityMap = new Map(), effectMap = new Map(), actor = null, item = null } = {}) {
    if (!root?.querySelectorAll) return;
    if (globalThis.game?.user?.isGM) {
      for (const row of root.querySelectorAll(`[${this.HIDDEN_ATTRIBUTE}], .${this.HIDDEN_CLASS}`)) this.#toggle(row, false);
      return;
    }
    for (const row of root.querySelectorAll(ROWS)) {
      const reference = this.#rowReference(row);
      const { id, kind } = reference;
      let hidden;
      if (actor) hidden = this.#actorRowHidden(actor, row, reference);
      else hidden = this.#rowHidden(row, item, reference)
        || (kind === "activity" ? activityMap : effectMap).get(id)?.hidden === true;
      this.#toggle(row, hidden);
    }
  }

  static #actorRowHidden(actor, row, reference) {
    const { id, kind, document, host } = reference;
    if (document) return Content.documentHidden(document, kind);
    const itemId = row.closest("[data-item-id]")?.dataset.itemId
      ?? row.closest("[data-parent-id]")?.dataset.parentId;
    const item = host ?? actor.items?.get?.(itemId);
    if (item) return Content.isHidden(item, id, kind);
    if (itemId === actor.id || (kind === "effect" && actor.effects?.get?.(id))) {
      return Content.documentHidden(actor.effects?.get?.(id), kind);
    }
    // Older layouts omit parent IDs. Only resolve an unambiguous document.
    const matches = Content.entries(actor.items).filter((entry) => {
      const collection = kind === "effect" ? entry.effects : entry.system?.activities;
      return Content.entries(collection).some((document) => document.id === id);
    });
    return matches.length === 1 && Content.isHidden(matches[0], id, kind);
  }

  /** A row with both IDs represents an effect; keep its ID and kind paired. */
  static #rowReference(row) {
    const kind = row.dataset.effectId ? "effect" : "activity";
    const id = kind === "effect" ? row.dataset.effectId : row.dataset.activityId;
    const resolved = Content.resolve(kind === "activity" ? row.dataset.activityUuid ?? row.dataset.uuid : row.dataset.uuid);
    const host = resolved?.documentName === "Item" ? resolved : null;
    const isDocument = resolved && !host && (!id || resolved.id === id) && (kind === "effect"
      ? resolved.documentName === "ActiveEffect" || resolved.parent?.effects?.get?.(resolved.id) === resolved
      : resolved.item && (!id || resolved.id === id));
    return { id, kind, host, document: isDocument ? resolved : null };
  }

  static #rowHidden(row, item, reference = this.#rowReference(row)) {
    const { id, kind, document, host } = reference;
    return document ? Content.documentHidden(document, kind) : Content.isHidden(host ?? item, id, kind);
  }

  static #toggle(node, hidden) {
    node.toggleAttribute(this.HIDDEN_ATTRIBUTE, Boolean(hidden));
    if (node.classList.contains(this.HIDDEN_CLASS) !== Boolean(hidden)) {
      node.classList.toggle(this.HIDDEN_CLASS, Boolean(hidden));
    }
  }

  static refreshChat() {
    if (globalThis.game?.user?.isGM) return;
    for (const node of globalThis.document?.querySelectorAll(".message[data-message-id]") ?? []) {
      const message = game.messages?.get(node.dataset.messageId);
      if (message) this.renderChat(message, node);
    }
  }

  static renderChat(message, root) {
    if (!root?.querySelectorAll) return;
    const activity = message.getAssociatedActivity?.()
      ?? Content.resolve(message.getFlag?.("dnd5e", "activity.uuid"));
    this.#toggle(root.closest?.(".message") ?? root, Content.documentHidden(activity));
    const item = message.getAssociatedItem?.();
    for (const row of root.querySelectorAll(ROWS)) {
      const hidden = this.#rowHidden(row, item);
      this.#toggle(row, hidden);
    }
    for (const section of root.querySelectorAll("section.activities")) {
      const rows = Array.from(section.querySelectorAll(ROWS));
      section.classList.toggle("sc-sockets-hidden-section", rows.length > 0 && rows.every((row) => row.classList.contains(this.HIDDEN_CLASS)));
    }
  }

  /** Framework class rewrites cannot remove our visibility attribute. */
  static observe(root, render, { badges = false } = {}) {
    if ((!badges && globalThis.game?.user?.isGM) || !root?.querySelectorAll) {
      this.disconnect(root);
      return;
    }
    SheetMutationObserver.subscribe(root, this, render, {
      attributes: ["data-activity-id", "data-effect-id", "data-item-id", "data-parent-id", "data-activity-uuid", "data-uuid"],
      relevant: (mutation) => {
        const target = mutation.target;
        if (target.closest?.(EDITORS)) return false;
        if (mutation.type === "attributes") return target.matches?.(`${ROWS}, ${SECTIONS}, [data-item-id], [data-parent-id]`);
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node.nodeType === 1 && (node.matches?.(`${ROWS}, ${SECTIONS}`) || node.querySelector?.(`${ROWS}, ${SECTIONS}`)));
      }
    });
  }

  static disconnect(root) {
    SheetMutationObserver.unsubscribe(root, this);
  }
}
