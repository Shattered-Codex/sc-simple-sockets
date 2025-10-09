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
      return Array.isArray(sockets) && sockets.length > 0;
    });

    if (!socketed.length) return;

    for (const item of socketed) {
      const sockets = item.getFlag(Constants.MODULE_ID, this.FLAG_KEY) ?? [];
      const slots = sockets.filter(Boolean);
      if (!slots.length) continue;

      const cell = this.#findItemNameCell(root, item.id);
      if (!cell) continue;

      // Remove previous badge block (idempotent)
      cell.querySelectorAll(`.${this.CSS_CLASS}[data-item-id="${item.id}"]`).forEach(e => e.remove());

      // Build badge block
      const wrap = document.createElement("div");
      wrap.className = this.CSS_CLASS;
      wrap.dataset.itemId = item.id;

      for (const slot of slots) {
        const div = document.createElement("div");
        div.className = "gem";
        if (!slot?.gem) {
          div.classList.add("empty");
        }

        const img = document.createElement("img");
        const src =
          slot?.img ??
          slot?.gem?.img ??
          Constants.SOCKET_SLOT_IMG;
        const label = slot?.gem?.name ?? slot?.name ?? "Empty Slot";
        img.src = src;
        img.alt = label;
        img.draggable = false;

        this.#applySlotTooltip(div, slot, label);

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

  /**
   * Assigns tooltip behaviour for a gem slot icon.
   * @param {HTMLElement} element  The element receiving the tooltip.
   * @param {object} slot          Slot data, possibly containing gem details.
   * @param {string} fallbackLabel Default label if no richer info is available.
   * @private
   */
  static #applySlotTooltip(element, slot, fallbackLabel) {
    const tooltip = this.#buildSlotTooltip(slot, fallbackLabel);
    if (!tooltip) return;

    const { type, label, uuid, direction, cssClass } = tooltip;
    if (type === "item" && uuid) {
      element.classList.add("item-tooltip");
      element.dataset.tooltip =
        `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
      element.dataset.tooltipClass = cssClass ?? "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light";
      element.dataset.tooltipDirection ??= direction ?? "LEFT";
      element.dataset.uuid = uuid;
      return;
    }

    element.dataset.tooltip = label ?? fallbackLabel;
    element.dataset.tooltipDirection ??= direction ?? "LEFT";
    if (cssClass) element.dataset.tooltipClass = cssClass;
  }

  /**
   * Builds tooltip metadata for a gem slot.
   * @param {object} slot
   * @param {string} fallbackLabel
   * @returns {{type: string, label?: string, uuid?: string, direction?: string, cssClass?: string}|null}
   * @private
   */
  static #buildSlotTooltip(slot, fallbackLabel) {
    const label = slot?.gem?.name ?? slot?.name ?? fallbackLabel;

    if (slot?.gem?.uuid && game?.system?.id === "dnd5e") {
      return {
        type: "item",
        uuid: slot.gem.uuid,
        direction: "LEFT",
        cssClass: "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light",
        label
      };
    }

    const description = foundry?.utils?.getProperty(slot, "_gemData.system.description.value");
    if (description && typeof TextEditor?.stripHTML === "function") {
      const plain = TextEditor.stripHTML(description)?.trim();
      if (plain) {
        return {
          type: "text",
          label: `${label}\n${plain}`
        };
      }
    }

    return {
      type: "text",
      label
    };
  }
}
