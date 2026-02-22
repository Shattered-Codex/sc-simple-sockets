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
    TransferFilterUI.bindToSheet(sheet, html);
  }

  static bindToSheet(sheet, html) {
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

    const values = Array.from(select.selectedOptions ?? [])
      .map((opt) => String(opt.value ?? "").trim())
      .filter((value) => value.length);
    const uniqueSet = new Set(values);
    if (uniqueSet.has(Constants.GEM_ALLOWED_TYPES_ALL) && uniqueSet.size > 1) {
      uniqueSet.delete(Constants.GEM_ALLOWED_TYPES_ALL);
      const allOption = Array.from(select.options ?? [])
        .find((option) => String(option.value ?? "") === Constants.GEM_ALLOWED_TYPES_ALL);
      if (allOption) {
        allOption.selected = false;
      }
    }

    let hasAll = uniqueSet.has(Constants.GEM_ALLOWED_TYPES_ALL);
    if (!hasAll) {
      TransferFilterUI.#expandGroupSelection(select, uniqueSet);
    }

    hasAll = uniqueSet.has(Constants.GEM_ALLOWED_TYPES_ALL);
    const unique = Array.from(uniqueSet);
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

  static #expandGroupSelection(select, uniqueSet) {
    const selectedGroups = Array.from(select.options ?? [])
      .filter((option) => option?.dataset?.groupOption === "true")
      .filter((option) => uniqueSet.has(String(option.value ?? "").trim()))
      .map((option) => String(option.dataset.groupType ?? option.value ?? "").trim().toLowerCase())
      .filter((value) => value.length);
    if (!selectedGroups.length) return;

    for (const option of Array.from(select.options ?? [])) {
      const rawValue = String(option.value ?? "").trim();
      const groupType = String(option.dataset.groupChildOf ?? "").trim().toLowerCase();
      if (!groupType.length || !selectedGroups.includes(groupType)) {
        continue;
      }

      option.selected = true;
      uniqueSet.add(rawValue);
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
