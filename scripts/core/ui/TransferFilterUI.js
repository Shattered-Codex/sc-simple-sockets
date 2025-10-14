import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";

export class TransferFilterUI {
  static #handler = null;
  static SELECT_SELECTOR = '[data-sc-sockets="gem-target-select"]';

  static activate() {
    if (TransferFilterUI.#handler) {
      return;
    }
    TransferFilterUI.#handler = (sheet, html) => TransferFilterUI.#onRender(sheet, html);
    Hooks.on("renderItemSheet5e", TransferFilterUI.#handler);
  }

  static deactivate() {
    if (!TransferFilterUI.#handler) {
      return;
    }
    Hooks.off("renderItemSheet5e", TransferFilterUI.#handler);
    TransferFilterUI.#handler = null;
  }

  static #onRender(sheet, html) {
    const item = sheet?.item;
    if (!GemCriteria.matches(item)) {
      return;
    }

    const root = TransferFilterUI.#rootOf(html ?? sheet?.element);
    if (!root) {
      return;
    }

    const select = root.querySelector(TransferFilterUI.SELECT_SELECTOR);
    if (!select) {
      return;
    }

    if (select.dataset.scSocketsBound === "true") {
      return;
    }
    select.dataset.scSocketsBound = "true";

    select.addEventListener("change", async () => {
      await TransferFilterUI.#handleSelectionChange(sheet, select);
    });
  }

  static async #handleSelectionChange(sheet, select) {
    if (!sheet?.item) {
      return;
    }

    const values = Array.from(select.selectedOptions ?? []).map((opt) => opt.value).filter((value) => typeof value === "string" && value.length);
    const unique = Array.from(new Set(values));
    const hasAll = unique.includes(Constants.GEM_ALLOWED_TYPES_ALL);

    const cleaned = hasAll ? [Constants.GEM_ALLOWED_TYPES_ALL] : unique;

    try {
      if (!cleaned.length || hasAll) {
        await sheet.item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES);
      } else {
        await sheet.item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES, cleaned);
      }
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] Failed to update gem target filter`, error);
    }

    if (hasAll) {
      for (const option of Array.from(select.options ?? [])) {
        option.selected = option.value === Constants.GEM_ALLOWED_TYPES_ALL;
      }
    }
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
