import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { GemDetailsBuilder } from "../../domain/gems/GemDetailsBuilder.js";

export class GemDetailsUI {
  static #handler = null;
  static SELECTOR = '[data-sc-sockets="gem-details"]';

  static activate() {
    if (GemDetailsUI.#handler) {
      return;
    }
    GemDetailsUI.#handler = (sheet, html) => GemDetailsUI.bindToSheet(sheet, html);
    Hooks.on("renderItemSheet5e", GemDetailsUI.#handler);
  }

  static deactivate() {
    if (!GemDetailsUI.#handler) {
      return;
    }
    Hooks.off("renderItemSheet5e", GemDetailsUI.#handler);
    GemDetailsUI.#handler = null;
  }

  static bindToSheet(sheet, html) {
    const item = sheet?.item;
    if (!GemCriteria.matches(item)) {
      return;
    }

    const root = GemDetailsUI.#rootOf(html ?? sheet?.element);
    if (!root) return;

    GemDetailsUI.#bindFormSubmit(root, sheet);

    const container = root.querySelector(GemDetailsUI.SELECTOR);
    if (!container) return;

    if (container.dataset.scSocketsGemDetailsBound === "true") {
      return;
    }

    container.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      const name = target.name ?? "";
      if (name.includes(`${Constants.MODULE_ID}.${Constants.FLAG_GEM_DETAIL_TYPE}`)) {
        event.preventDefault();
        const value = target.value;
        await sheet?.item?.setFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_DETAIL_TYPE, value);
        if (value !== "weapons") {
          await GemDetailsUI.#writeEntries(sheet.item, []);
        }
      }

      // Persist damage rows on any change within the damage container.
      const current = GemDetailsUI.#readEntries(container, sheet.item) ?? [];
      await GemDetailsUI.#writeEntries(sheet.item, current);
    });

    container.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
      if (!target) {
        return;
      }

      switch (target.dataset.action) {
        case "addGemDamage":
          event.preventDefault();
          await GemDetailsUI.#handleAddDamage(sheet, container);
          break;
        case "clearGemDamage":
          event.preventDefault();
          await GemDetailsUI.#handleClearDamage(sheet);
          break;
        case "removeGemDamage":
          event.preventDefault();
          await GemDetailsUI.#handleRemoveDamage(sheet, target);
          break;
        default:
          break;
      }
    });

    container.dataset.scSocketsGemDetailsBound = "true";
  }

  static async #handleAddDamage(sheet, container) {
    if (!sheet?.item) return;

    const defaults = GemDetailsUI.#readDefaults(container);
    const current = GemDetailsUI.#readEntries(container, sheet.item) ?? [];
    current.push(defaults);

    await GemDetailsUI.#writeEntries(sheet.item, current);
  }

  static async #handleRemoveDamage(sheet, target) {
    if (!sheet?.item) return;

    const idx = Number(target.dataset.index ?? target.closest?.("[data-index]")?.dataset.index);
    if (!Number.isInteger(idx)) {
      return;
    }

    const container = target.closest?.(GemDetailsUI.SELECTOR);
    const current = GemDetailsUI.#readEntries(container, sheet.item) ?? [];
    const next = current.filter((_, i) => i !== idx);

    await GemDetailsUI.#writeEntries(sheet.item, next);
  }

  static async #handleClearDamage(sheet) {
    if (!sheet?.item) return;
    await GemDetailsUI.#writeEntries(sheet.item, []);
  }

  static #bindFormSubmit(root, sheet) {
    const form = root?.querySelector?.("form") ?? root?.closest?.("form");
    if (!form) return;
    if (form.dataset.scSocketsGemDetailsSubmitBound === "true") {
      return;
    }
    form.addEventListener("submit", async () => {
      const container = root.querySelector(GemDetailsUI.SELECTOR);
      if (!container || !sheet?.item) return;
      const current = GemDetailsUI.#readEntries(container, sheet.item) ?? [];
      await GemDetailsUI.#writeEntries(sheet.item, current);
    });
    form.dataset.scSocketsGemDetailsSubmitBound = "true";
  }

  static #readDefaults(container) {
    const number = Number(container?.dataset?.defaultNumber ?? 1);
    const bonus = Number(container?.dataset?.defaultBonus ?? 0);
    const die = String(container?.dataset?.defaultDie ?? "d6").toLowerCase();
    const type = String(container?.dataset?.defaultType ?? "");
    return {
      number: Number.isFinite(number) ? number : 1,
      die,
      bonus: Number.isFinite(bonus) ? bonus : 0,
      type
    };
  }

  static #readEntries(container, item) {
    if (!container) {
      return GemDetailsUI.#cloneFlagEntries(item);
    }
    const rows = container.querySelectorAll?.(".sc-sockets-gem-damage-row") ?? [];
    if (!rows.length) {
      return GemDetailsUI.#cloneFlagEntries(item);
    }

    const entries = [];
    for (const row of rows) {
      const number = Number(row.querySelector('input[name$=".number"]')?.value ?? 0);
      const die = row.querySelector('select[name$=".die"]')?.value ?? "";
      const bonus = Number(row.querySelector('input[name$=".bonus"]')?.value ?? 0);
      const type = row.querySelector('select[name$=".type"]')?.value ?? "";
      entries.push({
        number: Number.isFinite(number) ? number : 0,
        die,
        bonus: Number.isFinite(bonus) ? bonus : 0,
        type
      });
    }
    return entries;
  }

  static #cloneFlagEntries(item) {
    const normalized = GemDetailsBuilder.getNormalizedDamageEntries(item);
    return foundry.utils.deepClone(normalized);
  }

  static async #writeEntries(item, entries) {
    if (!item) return;
    const cleaned = Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry === "object") : [];
    const existing = item.getFlag(Constants.MODULE_ID, Constants.FLAG_GEM_DAMAGE);
    const sameLength = Array.isArray(existing) && existing.length === cleaned.length;
    const sameContent = sameLength && cleaned.every((entry, idx) => {
      const prev = existing?.[idx] ?? {};
      return prev.number === entry.number &&
        prev.die === entry.die &&
        prev.bonus === entry.bonus &&
        prev.type === entry.type;
    });
    if (sameContent) return;

    if (!cleaned.length) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_DAMAGE);
      return;
    }

    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_DAMAGE, cleaned);
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") {
      return html[0] ?? html.get(0) ?? null;
    }
    if (html instanceof Element || html?.querySelector) {
      return html;
    }
    return null;
  }
}
