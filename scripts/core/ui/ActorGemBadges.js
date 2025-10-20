import { Constants } from "../Constants.js";

export class ActorGemBadges {
  static CSS_CLASS = "sc-sockets-badges";
  static FLAG_KEY = "sockets";
  static #handlers = new Map();

  /**
   * Applies badges to the provided sheet/element combo.
   * @param {DocumentSheet} sheet
   * @param {HTMLElement|JQuery} html
   */
  static render(sheet, html) {
    this.#onRenderActorSheet(sheet, html);
  }

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
   * Exposes tooltip behaviour so other UIs can reuse the gem tooltip logic.
   * @param {HTMLElement} element
   * @param {object} slot
   * @param {string} [fallbackLabel]
   */
  static applyTooltip(element, slot, fallbackLabel) {
    ActorGemBadges.#applySlotTooltip(element, slot, fallbackLabel ?? ActorGemBadges.#emptySlotLabel());
  }

  /**
   * Returns the localized fallback label for empty slots.
   * @returns {string}
   */
  static emptySlotLabel() {
    return ActorGemBadges.#emptySlotLabel();
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

    const socketed = actor.items.filter((item) => {
      const sockets = item.getFlag(Constants.MODULE_ID, this.FLAG_KEY);
      return Array.isArray(sockets) && sockets.length;
    });

    if (!socketed.length) return;

    for (const item of socketed) {
      const slots = this.#normalizeSlots(item.getFlag(Constants.MODULE_ID, this.FLAG_KEY));
      if (!slots.length) continue;

      this.#removeExistingBadges(root, item.id);

      const targets = this.#collectTargets(root, item, slots);
      if (!targets.length) continue;

      for (const target of targets) {
        this.#scheduleInjection(target);
      }
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

  static #normalizeSlots(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((entry, index) => {
      const slot = entry ?? {};
      return {
        ...slot,
        _index: index,
        name: slot?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty"),
        img: slot?.img ?? slot?.gem?.img ?? Constants.SOCKET_SLOT_IMG,
        gem: slot?.gem ?? null
      };
    });
  }

  static #collectTargets(root, item, slots) {
    const targets = [];
    const itemId = item.id;

    const listTarget = this.#findListTarget(root, itemId);
    if (listTarget) {
      targets.push({ ...listTarget, slots: [...slots] });
    }

    const tidyTargets = this.#findTidyItemTargets(root, itemId);
    if (tidyTargets.length) {
      for (const tidyTarget of tidyTargets) {
        targets.push({ ...tidyTarget, slots: [...slots] });
      }
    }

    const activityTargets = this.#findTidyActivityTargets(root, item, slots);
    if (activityTargets.length) {
      targets.push(...activityTargets);
    }

    return targets;
  }

static #removeExistingBadges(root, itemId) {
    if (!root) return;
    root.querySelectorAll(`.${this.CSS_CLASS}[data-item-id="${itemId}"]`).forEach((el) => el.remove());
    root
      .querySelectorAll(`div.tidy-table-row-container[data-item-id="${itemId}"] .sc-sockets-name-with-badges`)
      .forEach((el) => el.classList.remove("sc-sockets-name-with-badges"));
  }

  static #findListTarget(root, itemId) {
    const selectors = [
      `li.item[data-item-id="${itemId}"] .name`,
      `div.list-item[data-item-id="${itemId}"] .name`
    ];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) {
        return {
          itemId,
          container: el,
          reference: null,
          inline: false
        };
      }
    }
    return null;
  }

  static #findTidyItemTargets(root, itemId) {
    const results = [];

    const containers = Array.from(
      root.querySelectorAll(`div.tidy-table-row-container[data-item-id="${itemId}"]`)
    );

    if (!containers.length && root.matches?.(`div.tidy-table-row-container[data-item-id="${itemId}"]`)) {
      containers.push(root);
    }

    for (const rowContainer of containers) {
      const row = rowContainer.querySelector?.(".tidy-table-row:not(.activity)") ?? rowContainer;
      if (!row) continue;

      const itemName =
        row.querySelector?.(".tidy-table-cell.item-label .item-name") ??
        row.querySelector?.(".tidy-table-cell.item-label") ??
        row.querySelector?.(".item-name");
      if (!itemName) continue;

      const cellText = itemName.querySelector(":scope > .cell-text") ?? itemName;
      const indicator = itemName.querySelector(":scope > .row-detail-expand-indicator");

      results.push({
        itemId,
        container: itemName,
        label: cellText,
        reference: indicator ?? null,
        inline: true
      });
    }

    return results;
  }

  static #findTidyActivityTargets(root, item, slots) {
    const results = [];
    const flag = item.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES) ?? {};
    for (const [slotIndex, payload] of Object.entries(flag)) {
      const index = Number(slotIndex);
      const slot = slots[index];
      if (!slot?.gem) continue;

      const meta = payload?.activityMeta ?? {};
      for (const [activityId] of Object.entries(meta)) {
        const row = root.querySelector(
          `div.tidy-table-row.activity[data-activity-id="${activityId}"]`
        );
        if (!row) continue;
        const cellText = row.querySelector(".tidy-table-cell.primary .item-name .cell-text");
        if (!cellText) continue;
        const indicator = cellText.querySelector(":scope > .row-detail-expand-indicator");
        results.push({
          itemId: item.id,
          container: cellText,
          reference: indicator ?? null,
          inline: true,
          activityId,
          slots: [slot]
        });
      }
    }
    return results;
  }

static #scheduleInjection(target) {
    if (!target) return;
    const schedule =
      globalThis?.requestAnimationFrame ??
      ((fn) => (typeof globalThis?.setTimeout === "function" ? globalThis.setTimeout(fn, 16) : fn()));
    schedule(() => {
      if (!target?.container?.isConnected) {
        return;
      }
      ActorGemBadges.#injectBadges(target);
    });
  }

  static #injectBadges(target) {
    if (!target?.container) return;
    const slots = Array.isArray(target.slots) ? target.slots : [];
    if (!slots.length) return;

    const wrap = document.createElement(target.inline ? "span" : "div");
    wrap.className = this.CSS_CLASS;
    wrap.dataset.itemId = target.itemId;
    wrap.classList.add(target.inline ? "sc-sockets-badges-inline" : "sc-sockets-badges-block");
    if (target.activityId) {
      wrap.dataset.activityId = target.activityId;
      wrap.classList.add("sc-sockets-badges-activity");
    }

    const container = target.container;
    const host = target.label ?? container;
    host?.classList.add("sc-sockets-name-with-badges");
    if (host !== container) {
      container.classList.add("sc-sockets-name-with-badges");
    }

    for (const slot of slots) {
      const badge = this.#createBadgeElement(slot, target.inline);
      wrap.appendChild(badge);
    }

    if (target.inline) {
      const host = target.label ?? container.querySelector(":scope > .cell-text") ?? container;
      host.classList.add("sc-sockets-name-with-badges");

      const cellContext = host.querySelector(":scope > .cell-context");
      const cellName = host.querySelector(":scope > .cell-name");

      if (cellContext) {
        cellContext.insertAdjacentElement("afterend", wrap);
      } else if (cellName) {
        cellName.insertAdjacentElement("afterend", wrap);
      } else {
        host.appendChild(wrap);
      }
    } else {
      const reference = target.reference ?? null;
      if (reference && reference.parentNode === target.container) {
        target.container.insertBefore(wrap, reference);
      } else {
        target.container.appendChild(wrap);
      }
    }
  }

  static #createBadgeElement(slot, inline = false) {
    const tag = inline ? "span" : "div";
    const el = document.createElement(tag);
    el.className = "gem";
    if (!slot?.gem) {
      el.classList.add("empty");
    }

    const img = document.createElement("img");
    const label = slot?.gem?.name ?? slot?.name ?? this.#emptySlotLabel();
    img.src = slot?.img ?? slot?.gem?.img ?? Constants.SOCKET_SLOT_IMG;
    img.alt = label;
    img.draggable = false;

    this.#applySlotTooltip(el, slot, label);

    el.appendChild(img);
    return el;
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

    const { type, label, uuid, uuids, direction, cssClass } = tooltip;
    const resolvedLabel = label ?? fallbackLabel ?? this.#emptySlotLabel();
    const resolvedDirection = direction ?? "LEFT";

    if (type === "item") {
      const candidates = Array.isArray(uuids) && uuids.length ? uuids : [uuid];
      this.#applyRichTooltip(element, candidates, resolvedLabel, resolvedDirection, cssClass);
      return;
    }

    this.#applyTextTooltip(element, resolvedLabel, resolvedDirection, cssClass);
  }

  /**
   * Builds tooltip metadata for a gem slot.
   * @param {object} slot
  * @param {string} fallbackLabel
   * @returns {{type: string, label?: string, uuid?: string, direction?: string, cssClass?: string}|null}
   * @private
   */
  static #buildSlotTooltip(slot, fallbackLabel) {
    const label = slot?.gem?.name ?? slot?.name ?? fallbackLabel ?? this.#emptySlotLabel();

    const uuids = this.#collectCandidateUuids(slot);
    if (uuids.length && game?.system?.id === "dnd5e") {
      return {
        type: "item",
        uuid: uuids[0],
        uuids,
        direction: "LEFT",
        cssClass: "dnd5e2 dnd5e-tooltip item-tooltip themed theme-light",
        label
      };
    }

    const getProperty = globalThis?.foundry?.utils?.getProperty;
    const description = getProperty?.(slot, "_gemData.system.description.value");
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

  /**
   * Apply a rich tooltip that leverages dnd5e's tooltip manager. Falls back to text if the UUID is invalid.
   * @private
   */
  static #applyRichTooltip(element, candidateUuids, fallbackLabel, direction, cssClass) {
    if (!element?.dataset || !Array.isArray(candidateUuids) || !candidateUuids.length) {
      this.#applyTextTooltip(element, fallbackLabel, direction, cssClass);
      return;
    }

    const [primary] = candidateUuids;
    if (typeof primary !== "string" || !primary.length) {
      this.#applyTextTooltip(element, fallbackLabel, direction, cssClass);
      return;
    }

    this.#setTooltipLoader(element, primary, direction, cssClass);
    this.#verifyTooltipDocument(element, candidateUuids, fallbackLabel, direction, cssClass);
  }

  /**
   * Apply a plain text tooltip.
   * @private
   */
  static #applyTextTooltip(element, label, direction, cssClass) {
    if (!element?.dataset || !element?.isConnected) return;

    element.classList.remove("item-tooltip");
    element.dataset.tooltip = label;
    element.dataset.tooltipDirection = direction;
    if (cssClass) element.dataset.tooltipClass = cssClass;
    else delete element.dataset.tooltipClass;
    delete element.dataset.uuid;
  }

  /**
   * Ensures we only hand off to the dnd5e tooltip manager when the UUID resolves to a document.
   * @private
   */
  static async #verifyTooltipDocument(element, candidateUuids, fallbackLabel, direction, cssClass) {
    if (typeof fromUuid !== "function") return;

    for (const uuid of candidateUuids) {
      try {
        const doc = await fromUuid(uuid);
        if (doc) {
          element.dataset.uuid = uuid;
          return;
        }
      } catch (err) {
        console.warn(`[${Constants.MODULE_ID}] failed to resolve tooltip uuid`, err);
      }
    }

    this.#applyTextTooltip(element, fallbackLabel, direction, cssClass);
  }

  /**
   * Configures dataset properties to show the tidy tooltip loader.
   * @private
   */
  static #setTooltipLoader(element, uuid, direction, cssClass) {
    element.dataset.uuid = uuid;
    element.dataset.tooltipDirection = direction;
    element.dataset.tooltip = `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
    element.dataset.tooltipClass = cssClass;
    element.classList.add("item-tooltip");
  }

  static #collectCandidateUuids(slot) {
    const candidates = [];
    const direct = slot?.gem?.uuid ?? slot?.gem?.flags?.core?.sourceId ?? slot?.gem?.sourceUuid;
    if (direct) {
      candidates.push(direct);
    }
    const stored = slot?.gem?.flags?.core?.sourceId ?? slot?._gemData?.flags?.core?.sourceId;
    if (stored) {
      candidates.push(stored);
    }
    return candidates;
  }

  static #emptySlotLabel() {
    return Constants.localize("SCSockets.SocketEmptyTooltip", "Empty Slot");
  }
}
