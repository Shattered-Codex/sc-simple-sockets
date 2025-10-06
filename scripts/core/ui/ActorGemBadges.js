import { Constants } from "../Constants.js";

export class ActorGemBadges {
  static CSS_CLASS = "sc-sockets-badges";
  static FLAG_KEY = "sockets";
  static #handlers = new Map();

  /**
   * Activates badge rendering on supported actor sheets.
   */
  static activate() {
    if (this.#handlers.size) {
      return;
    }

    const hookNames = [
      "renderActorSheet5e",     // dnd5e default (ApplicationV2)
      "renderBaseActorSheet",   // some modules
      "renderActorSheet"        // generic fallback
    ];

    for (const hook of hookNames) {
      const handler = (sheet, html, ...rest) => this.#onRenderActorSheet(sheet, html, ...rest);
      Hooks.on(hook, handler);
      this.#handlers.set(hook, handler);
    }

    console.debug(`[${Constants.MODULE_ID}] ActorGemBadges activated`);
  }

  /**
   * Deactivates badge rendering and removes hooks.
   */
  static deactivate() {
    if (!this.#handlers.size) {
      return;
    }

    for (const [hook, handler] of this.#handlers) {
      Hooks.off(hook, handler);
    }
    this.#handlers.clear();

    console.debug(`[${Constants.MODULE_ID}] ActorGemBadges deactivated`);
  }

  /**
   * Handles rendering of gem badges on actor sheets.
   * @private
   */
  static #onRenderActorSheet(sheet, html) {
    const actor = sheet?.actor;
    if (!actor) return;

    const root = this.#rootOf(html);
    if (!root) return;

    const socketed = actor.items.filter(i => {
      const sockets = i.getFlag(Constants.MODULE_ID, this.FLAG_KEY);
      return Array.isArray(sockets) && sockets.some(s => s?.gem?.img);
    });

    if (!socketed.length) return;

    for (const item of socketed) {
      const sockets = item.getFlag(Constants.MODULE_ID, this.FLAG_KEY) ?? [];
      const gems = sockets.map(s => s?.gem).filter(Boolean);
      if (!gems.length) continue;

      const cell = this.#findItemNameCell(root, item.id);
      if (!cell) continue;

      // Remove previous badge block (idempotent)
      cell.querySelectorAll(`.${this.CSS_CLASS}[data-item-id="${item.id}"]`).forEach(e => e.remove());

      // Build badge block
      const wrap = document.createElement("div");
      wrap.className = this.CSS_CLASS;
      wrap.dataset.itemId = item.id;

      for (const gem of gems) {
        const div = document.createElement("div");
        div.className = "gem";

        const img = document.createElement("img");
        img.src = gem.img;
        img.alt = gem.name ?? "Gem";
        img.setAttribute("data-tooltip", gem.name ?? "Gem");
        img.draggable = false;

        div.appendChild(img);
        wrap.appendChild(div);
      }

      cell.appendChild(wrap);
    }

    // Optional debug:
    // console.debug(`[${Constants.MODULE_ID}] gem badges applied`, {actor: actor.name, count: socketed.length});
  }

  /**
   * Normalizes html to HTMLElement (supports jQuery or HTMLElement).
   * @private
   */
  static #rootOf(html) {
    if (!html) return null;
    // jQuery
    if (html.jquery || typeof html.get === "function") return html[0] ?? html.get(0);
    // HTMLElement
    if (html instanceof Element || html?.querySelector) return html;
    // Some themes expose via sheet.element
    return null;
  }

  /**
   * Attempts to locate the item name cell in different layouts and returns the first found.
   * @private
   */
  static #findItemNameCell(root, itemId) {
    const selectors = [
      `li.item[data-item-id="${itemId}"] .name`,                              // dnd5e default
      `div.item-table-row-container[data-item-id="${itemId}"] .item-table-cell.primary`, // tidy5e-like
      `[data-item-id="${itemId}"] .name`,
      `[data-item-id="${itemId}"] .item-name`
    ];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
}
