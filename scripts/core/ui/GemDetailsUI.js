import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { GemDetailsBuilder } from "../../domain/gems/GemDetailsBuilder.js";

export class GemDetailsUI {
  static #handler = null;
  static SELECTOR = '[data-sc-sockets="gem-details-container"]';
  static DAMAGE_SECTION_SELECTOR = '[data-sc-sockets="gem-details"]';
  static CRIT_DAMAGE_SECTION_SELECTOR = '[data-sc-sockets="gem-crit-details"]';

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
        await GemDetailsUI.#persistDamageFlags(container, sheet.item, value === "weapons");
        if (value !== "weapons") {
          await GemDetailsUI.#persistCritThreshold(sheet?.item, undefined);
          await GemDetailsUI.#persistCritMultiplier(sheet?.item, undefined);
          await GemDetailsUI.#persistAttackBonus(sheet?.item, undefined);
        }
        return;
      }

      if (name.includes(`${Constants.MODULE_ID}.${Constants.FLAG_GEM_CRIT_THRESHOLD}`)) {
        event.preventDefault();
        await GemDetailsUI.#persistCritThreshold(sheet?.item, target.value);
        return;
      }

      if (name.includes(`${Constants.MODULE_ID}.${Constants.FLAG_GEM_CRIT_MULTIPLIER}`)) {
        event.preventDefault();
        await GemDetailsUI.#persistCritMultiplier(sheet?.item, target.value);
        return;
      }

      if (name.includes(`${Constants.MODULE_ID}.${Constants.FLAG_GEM_ATTACK_BONUS}`)) {
        event.preventDefault();
        await GemDetailsUI.#persistAttackBonus(sheet?.item, target.value);
        return;
      }

      // Persist damage rows on any change within the damage containers.
      await GemDetailsUI.#persistDamageFlags(container, sheet.item);
    });

    container.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
      if (!target) {
        return;
      }

      switch (target.dataset.action) {
        case "addGemDamage":
          event.preventDefault();
          await GemDetailsUI.#handleAddDamage(sheet, container, {
            sectionSelector: GemDetailsUI.DAMAGE_SECTION_SELECTOR,
            flag: Constants.FLAG_GEM_DAMAGE
          });
          break;
        case "clearGemDamage":
          event.preventDefault();
          await GemDetailsUI.#handleClearDamage(sheet, {
            flag: Constants.FLAG_GEM_DAMAGE
          });
          break;
        case "removeGemDamage":
          event.preventDefault();
          await GemDetailsUI.#handleRemoveDamage(sheet, target, {
            sectionSelector: GemDetailsUI.DAMAGE_SECTION_SELECTOR,
            flag: Constants.FLAG_GEM_DAMAGE
          });
          break;
        case "addGemCritDamage":
          event.preventDefault();
          await GemDetailsUI.#handleAddDamage(sheet, container, {
            sectionSelector: GemDetailsUI.CRIT_DAMAGE_SECTION_SELECTOR,
            flag: Constants.FLAG_GEM_CRIT_DAMAGE
          });
          break;
        case "clearGemCritDamage":
          event.preventDefault();
          await GemDetailsUI.#handleClearDamage(sheet, {
            flag: Constants.FLAG_GEM_CRIT_DAMAGE
          });
          break;
        case "removeGemCritDamage":
          event.preventDefault();
          await GemDetailsUI.#handleRemoveDamage(sheet, target, {
            sectionSelector: GemDetailsUI.CRIT_DAMAGE_SECTION_SELECTOR,
            flag: Constants.FLAG_GEM_CRIT_DAMAGE
          });
          break;
        default:
          break;
      }
    });

    container.dataset.scSocketsGemDetailsBound = "true";
  }

  static async #handleAddDamage(sheet, container, { sectionSelector, flag }) {
    if (!sheet?.item) return;

    const section = GemDetailsUI.#querySection(container, sectionSelector);
    const defaults = GemDetailsUI.#readDefaults(section);
    const current = GemDetailsUI.#readEntries(container, sheet.item, { sectionSelector, flag }) ?? [];
    current.push(defaults);

    await GemDetailsUI.#writeEntries(sheet.item, current, flag);
  }

  static async #handleRemoveDamage(sheet, target, { sectionSelector, flag }) {
    if (!sheet?.item) return;

    const idx = Number(target.dataset.index ?? target.closest?.("[data-index]")?.dataset.index);
    if (!Number.isInteger(idx)) {
      return;
    }

    const container = target.closest?.(GemDetailsUI.SELECTOR);
    const current = GemDetailsUI.#readEntries(container, sheet.item, { sectionSelector, flag }) ?? [];
    const next = current.filter((_, i) => i !== idx);

    await GemDetailsUI.#writeEntries(sheet.item, next, flag);
  }

  static async #handleClearDamage(sheet, { flag }) {
    if (!sheet?.item) return;
    await GemDetailsUI.#writeEntries(sheet.item, [], flag);
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
      await GemDetailsUI.#persistDamageFlags(container, sheet.item);
      await GemDetailsUI.#persistCritThreshold(sheet?.item, undefined, container);
      await GemDetailsUI.#persistCritMultiplier(sheet?.item, undefined, container);
      await GemDetailsUI.#persistAttackBonus(sheet?.item, undefined, container);
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

  static #readEntries(container, item, { sectionSelector, flag }) {
    const section = GemDetailsUI.#querySection(container, sectionSelector);
    if (!section) {
      return GemDetailsUI.#cloneFlagEntries(item, flag);
    }

    const rows = section.querySelectorAll?.(".sc-sockets-gem-damage-row") ?? [];
    if (!rows.length) {
      return GemDetailsUI.#cloneFlagEntries(item, flag);
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

  static #cloneFlagEntries(item, flag) {
    const normalized = GemDetailsBuilder.getNormalizedDamageEntries(item, { flag });
    return foundry.utils.deepClone(normalized);
  }

  static async #writeEntries(item, entries, flag) {
    if (!item) return;
    const cleaned = Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry === "object") : [];
    const existing = item.getFlag(Constants.MODULE_ID, flag);
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
      await item.unsetFlag(Constants.MODULE_ID, flag);
      return;
    }

    await item.setFlag(Constants.MODULE_ID, flag, cleaned);
  }

  static #querySection(container, selector) {
    if (!container || !selector) return null;
    return container.querySelector?.(selector) ?? null;
  }

  static async #persistDamageFlags(container, item, keep = true) {
    if (!item) return;
    const baseEntries = keep
      ? (GemDetailsUI.#readEntries(container, item, {
          sectionSelector: GemDetailsUI.DAMAGE_SECTION_SELECTOR,
          flag: Constants.FLAG_GEM_DAMAGE
        }) ?? [])
      : [];
    const critEntries = keep
      ? (GemDetailsUI.#readEntries(container, item, {
          sectionSelector: GemDetailsUI.CRIT_DAMAGE_SECTION_SELECTOR,
          flag: Constants.FLAG_GEM_CRIT_DAMAGE
        }) ?? [])
      : [];

    await GemDetailsUI.#writeEntries(item, baseEntries, Constants.FLAG_GEM_DAMAGE);
    await GemDetailsUI.#writeEntries(item, critEntries, Constants.FLAG_GEM_CRIT_DAMAGE);
  }

  static async #persistCritThreshold(item, rawValue, container) {
    if (!item) return;
    const str = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (str === "" || str === null || str === undefined) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_THRESHOLD);
      return;
    }
    let value = Number(str);
    if (!Number.isFinite(value) || value <= 0) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_THRESHOLD);
      return;
    }
    value = Math.min(Math.max(Math.floor(value), 1), 20);
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_THRESHOLD, value);
  }

  static async #persistCritMultiplier(item, rawValue) {
    if (!item) return;
    const str = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (str === "" || str === null || str === undefined) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_MULTIPLIER);
      return;
    }
    let value = Number(str);
    if (!Number.isFinite(value)) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_MULTIPLIER);
      return;
    }
    value = Math.max(Math.floor(value), 1);
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_MULTIPLIER, value);
  }

  static async #persistAttackBonus(item, rawValue) {
    if (!item) return;
    const str = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (str === "" || str === null || str === undefined) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ATTACK_BONUS);
      return;
    }
    const value = Number(str);
    if (!Number.isFinite(value)) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ATTACK_BONUS);
      return;
    }
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ATTACK_BONUS, Math.floor(value));
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
