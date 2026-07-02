import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { GemFormulaPresentation } from "../../domain/gems/GemFormulaPresentation.js";

/**
 * Enriches the Formula column of actor sheets (default dnd5e and Tidy) with
 * the extra damage granted by socketed gems. Presentation only: the roll
 * pipeline and the host item's persisted data are never touched.
 */
export class ActorGemFormulaUI {
  static CSS_CLASS = "sc-sockets-gem-formula";
  static CELL_CLASS = "sc-sockets-gem-formula-cell";
  static #handlers = new Map();

  static activate() {
    if (this.#handlers.size) {
      return;
    }

    const hookNames = [
      "renderActorSheet5e",
      "renderBaseActorSheet",
      "renderActorSheet"
    ];

    for (const hook of hookNames) {
      const handler = (sheet, html) => this.#onRenderActorSheet(sheet, html);
      Hooks.on(hook, handler);
      this.#handlers.set(hook, handler);
    }

    const updateItemHandler = (item, changes) => this.#onOwnedItemUpdated(item, changes);
    Hooks.on("updateItem", updateItemHandler);
    this.#handlers.set("updateItem", updateItemHandler);
  }

  static deactivate() {
    if (!this.#handlers.size) {
      return;
    }
    for (const [hook, handler] of this.#handlers) {
      Hooks.off(hook, handler);
    }
    this.#handlers.clear();
  }

  /**
   * Applies the gem formula presentation to the provided sheet/element combo.
   * @param {DocumentSheet} sheet
   * @param {HTMLElement|JQuery} html
   */
  static render(sheet, html) {
    this.#onRenderActorSheet(sheet, html);
  }

  static #onRenderActorSheet(sheet, html) {
    const actor = sheet?.actor;
    if (!actor) return;

    const root = this.#rootOf(html);
    if (!root) return;

    this.#clear(root);

    const mode = ModuleSettings.getGemFormulaLayoutMode();
    if (mode === ModuleSettings.GEM_FORMULA_LAYOUT_CURRENT) {
      return;
    }

    const showImage = ModuleSettings.shouldShowGemFormulaImages();

    for (const item of actor.items) {
      const entries = GemFormulaPresentation.collectEntries(item);
      if (entries.length) {
        const cells = this.#findFormulaCells(root, item.id);
        for (const cell of cells) {
          this.#scheduleInjection(() => this.#injectIntoCell(cell, item, entries, { mode, showImage }));
        }
      }

      const attackBonus = GemFormulaPresentation.collectAttackBonus(item);
      if (attackBonus.total !== 0) {
        const rollCells = this.#findRollCells(root, item.id);
        for (const cell of rollCells) {
          this.#scheduleInjection(() => this.#injectRollBonus(cell, item, attackBonus));
        }
      }
    }
  }

  static #onOwnedItemUpdated(item, changes) {
    const actor = item?.parent;
    if (actor?.documentName !== "Actor") return;
    if (!this.#hasSocketUpdate(changes)) return;
    this.#refreshActorSheets(actor);
  }

  static #hasSocketUpdate(changes) {
    if (!changes || typeof changes !== "object") return false;

    const socketsPath = `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;
    const hasProperty = foundry?.utils?.hasProperty;
    if (typeof hasProperty === "function" && hasProperty(changes, socketsPath)) {
      return true;
    }

    return Object.keys(changes).some((key) => (
      key === socketsPath || key.startsWith(`${socketsPath}.`)
    ));
  }

  static #refreshActorSheets(actor) {
    const apps = new Set();
    if (actor.sheet?.rendered) {
      apps.add(actor.sheet);
    }

    const applicationInstances = foundry?.applications?.instances;
    const instances = applicationInstances instanceof Map
      ? Array.from(applicationInstances.values())
      : Array.isArray(applicationInstances)
        ? applicationInstances
        : applicationInstances && typeof applicationInstances === "object"
          ? Object.values(applicationInstances)
          : [];

    for (const app of [...Object.values(ui?.windows ?? {}), ...instances]) {
      const doc = app?.document ?? app?.object;
      if (!app?.rendered) continue;
      if (doc === actor || doc?.uuid === actor.uuid) {
        apps.add(app);
      }
    }

    for (const app of apps) {
      const root = this.#rootOf(app.element);
      if (!root?.isConnected) continue;
      this.#onRenderActorSheet(app, root);
    }
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") return html[0] ?? html.get(0);
    if (html instanceof Element || html?.querySelector) return html;
    return null;
  }

  static #clear(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(`.${this.CSS_CLASS}`).forEach((el) => el.remove());
    root.querySelectorAll(`.${this.CELL_CLASS}`).forEach((cell) => {
      cell.classList.remove(this.CELL_CLASS, "sc-sockets-gem-formula-roll-cell");
      if (cell.dataset.scSocketsFormulaWasEmpty === "true") {
        cell.classList.add("empty");
        delete cell.dataset.scSocketsFormulaWasEmpty;
      }
    });
  }

  /**
   * Finds the Formula column cells for an item on both supported sheets.
   * @private
   */
  static #findFormulaCells(root, itemId) {
    const cells = [];

    // Default dnd5e sheet rows; skip the expanded activity sub-rows.
    root.querySelectorAll(
      `li.item[data-item-id="${itemId}"] [data-column-id="formula"]`
    ).forEach((cell) => {
      if (!cell.closest("li.activity-row")) {
        cells.push(cell);
      }
    });

    // Tidy (quadrone) table rows; skip activity sub-rows.
    root.querySelectorAll(
      `div.tidy-table-row-container[data-item-id="${itemId}"] .tidy-table-row:not(.activity) .tidy-table-cell[data-tidy-column-key="formula"]`
    ).forEach((cell) => cells.push(cell));

    return cells;
  }

  /**
   * Finds the Roll column cells (to-hit modifier) for an item on both sheets.
   * @private
   */
  static #findRollCells(root, itemId) {
    const cells = [];

    root.querySelectorAll(
      `li.item[data-item-id="${itemId}"] [data-column-id="roll"]`
    ).forEach((cell) => {
      if (!cell.closest("li.activity-row")) {
        cells.push(cell);
      }
    });

    root.querySelectorAll(
      `div.tidy-table-row-container[data-item-id="${itemId}"] .tidy-table-row:not(.activity) .tidy-table-cell[data-tidy-column-key="roll"]`
    ).forEach((cell) => cells.push(cell));

    return cells;
  }

  static #scheduleInjection(callback) {
    const schedule =
      globalThis?.requestAnimationFrame ??
      ((fn) => (typeof globalThis?.setTimeout === "function" ? globalThis.setTimeout(fn, 16) : fn()));
    schedule(callback);
  }

  static #injectIntoCell(cell, item, entries, { mode, showImage }) {
    if (!cell?.isConnected) return;
    if (cell.querySelector(`:scope > .${this.CSS_CLASS}`)) return;

    const isTidy = cell.classList.contains("tidy-table-cell");

    cell.classList.add(this.CELL_CLASS);
    if (cell.classList.contains("empty")) {
      cell.classList.remove("empty");
      cell.dataset.scSocketsFormulaWasEmpty = "true";
    }

    if (mode === ModuleSettings.GEM_FORMULA_LAYOUT_INLINE) {
      for (const entry of entries) {
        cell.appendChild(this.#createInlineEntry(item, entry, { isTidy, showImage }));
      }
      return;
    }

    if (mode === ModuleSettings.GEM_FORMULA_LAYOUT_TOOLTIP) {
      cell.appendChild(this.#createTooltipBadge(item, entries, { showImage }));
    }
  }

  /**
   * Appends the summed gem attack bonus to the Roll column as a small
   * gem icon + signed value, with a per-gem breakdown on hover/focus.
   * @private
   */
  static #injectRollBonus(cell, item, attackBonus) {
    if (!cell?.isConnected) return;
    if (cell.querySelector(`:scope > .sc-sockets-gem-formula-roll`)) return;

    cell.classList.add(this.CELL_CLASS, "sc-sockets-gem-formula-roll-cell");
    if (cell.classList.contains("empty")) {
      cell.classList.remove("empty");
      cell.dataset.scSocketsFormulaWasEmpty = "true";
    }

    const badge = document.createElement("span");
    badge.className = `${this.CSS_CLASS} sc-sockets-gem-formula-roll`;
    badge.dataset.itemId = item.id;
    badge.tabIndex = 0;
    badge.dataset.tooltip = GemFormulaPresentation.buildAttackBonusTooltip(attackBonus.parts);
    badge.dataset.tooltipClass = "sc-sockets-gem-formula-tooltip";
    badge.dataset.tooltipDirection = "LEFT";
    badge.setAttribute(
      "aria-label",
      attackBonus.parts
        .map((part) => `${part.gemName} ${GemFormulaPresentation.formatSignedBonus(part.bonus)}`)
        .join(", ")
    );

    const icon = document.createElement("i");
    icon.className = "fas fa-gem sc-sockets-gem-formula-icon";
    badge.appendChild(icon);

    const value = document.createElement("span");
    value.className = "sc-sockets-gem-formula-roll-value";
    value.textContent = GemFormulaPresentation.formatSignedBonus(attackBonus.total);
    badge.appendChild(value);

    cell.appendChild(badge);
  }

  /**
   * Builds one inline row/segment: [icon or name] formula type.
   * @private
   */
  static #createInlineEntry(item, entry, { isTidy, showImage }) {
    const el = document.createElement(isTidy ? "span" : "div");
    el.className = `${this.CSS_CLASS} sc-sockets-gem-formula-entry`;
    if (!isTidy) el.classList.add("row");
    el.dataset.itemId = item.id;

    if (showImage && entry.gemImg) {
      el.classList.add("sc-sockets-gem-formula-entry--img");
      const img = document.createElement("img");
      img.className = "sc-sockets-gem-formula-img";
      img.src = entry.gemImg;
      img.alt = entry.gemName;
      img.draggable = false;
      img.dataset.tooltip = entry.gemName;
      el.appendChild(img);
    } else {
      el.classList.add("sc-sockets-gem-formula-entry--text");
      const name = document.createElement("span");
      name.className = "sc-sockets-gem-formula-name";
      name.textContent = `[${entry.gemName}]`;
      el.appendChild(name);
    }

    const formula = document.createElement("span");
    formula.className = "formula sc-sockets-gem-formula-value";
    formula.textContent = entry.formula;
    el.appendChild(formula);

    el.appendChild(this.#createTypeElement(entry));

    return el;
  }

  /**
   * Builds the damage type element as dnd5e damage type icons. Inherit
   * entries (and types without icon metadata) fall back to the text label.
   * @private
   */
  static #createTypeElement(entry) {
    const type = document.createElement("span");
    type.className = "sc-sockets-gem-formula-type";

    const iconDetails = (entry.typeDetails ?? []).filter((detail) => detail.icon);
    if (iconDetails.length) {
      type.classList.add("sc-sockets-gem-formula-type--icons");
      for (const detail of iconDetails) {
        const wrap = document.createElement("span");
        wrap.dataset.tooltip = detail.label;
        wrap.setAttribute("aria-label", detail.label);
        const icon = document.createElement("dnd5e-icon");
        icon.setAttribute("src", detail.icon);
        wrap.appendChild(icon);
        type.appendChild(wrap);
      }
      return type;
    }

    type.textContent = entry.typeLabel;
    return type;
  }

  /**
   * Builds the compact badge that reveals the full breakdown on hover/focus.
   * Always a gem icon plus the count of extra damage entries, e.g. " (4)";
   * the show-image setting only affects the breakdown inside the tooltip.
   * @private
   */
  static #createTooltipBadge(item, entries, { showImage }) {
    const badge = document.createElement("span");
    badge.className = `${this.CSS_CLASS} sc-sockets-gem-formula-badge`;
    badge.dataset.itemId = item.id;
    badge.tabIndex = 0;
    badge.dataset.tooltip = GemFormulaPresentation.buildTooltipContent(entries, { showImage });
    badge.dataset.tooltipClass = "sc-sockets-gem-formula-tooltip";
    badge.dataset.tooltipDirection = "LEFT";
    badge.setAttribute("aria-label", GemFormulaPresentation.buildPlainSummary(entries));

    const icon = document.createElement("i");
    icon.className = "fas fa-gem sc-sockets-gem-formula-icon";
    badge.appendChild(icon);

    const count = document.createElement("span");
    count.className = "sc-sockets-gem-formula-count";
    count.textContent = `(${entries.length})`;
    badge.appendChild(count);

    return badge;
  }
}
