import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { GemDetailsBuilder } from "../../domain/gems/GemDetailsBuilder.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";
import { GemTagService } from "../../domain/gems/GemTagService.js";

export class GemDetailsUI {
  static #handler = null;
  static SELECTOR = '[data-sc-sockets="gem-details-container"]';
  static DAMAGE_SECTION_SELECTOR = '[data-sc-sockets="gem-details"]';

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
      const target = GemDetailsUI.#resolveFieldTarget(event.target);
      if (!GemDetailsUI.#isSupportedInputTarget(target)) {
        return;
      }
      const isNormalizationReplay = target instanceof HTMLElement
        && target.dataset.scSocketsNormalizePending === "true";
      if (isNormalizationReplay) {
        delete target.dataset.scSocketsNormalizePending;
      } else {
        GemDetailsUI.#normalizeDamageTypeSelections(container, target);
      }

      const name = target.getAttribute?.("name") ?? target.name ?? "";
      if (name.includes(`${Constants.MODULE_ID}.${Constants.FLAG_GEM_TAGS}`)) {
        event.preventDefault();
        await GemDetailsUI.#persistGemTags(sheet?.item, target.value);
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

      if (name.includes(`${Constants.MODULE_ID}.${Constants.FLAG_GEM_RESOURCE}`)) {
        event.preventDefault();
        await GemDetailsUI.#persistGemResource(container, sheet?.item);
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
        case "removeGemDamageType":
          event.preventDefault();
          await GemDetailsUI.#handleRemoveDamageType(sheet, target);
          break;
        default:
          break;
      }
    });

    container.dataset.scSocketsGemDetailsBound = "true";
    GemDetailsUI.#normalizeDamageTypeSelections(container);
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

  static async #handleRemoveDamageType(sheet, target) {
    if (!sheet?.item || !(target instanceof HTMLElement)) {
      return;
    }

    const typeValue = String(target.dataset.typeValue ?? "").trim();
    if (!typeValue || typeValue === Constants.GEM_DAMAGE_INHERIT_TYPE) {
      return;
    }

    const row = target.closest?.(".sc-sockets-gem-damage-row");
    const typesField = row?.querySelector?.('[name$=".types"]');
    if (!(typesField instanceof HTMLElement)) {
      return;
    }

    const selectedValues = GemDetailsUI.#readSelectedValues(typesField);
    const nextValues = selectedValues.filter((value) => value !== typeValue);
    GemDetailsUI.#applySelectedValues(typesField, nextValues);
    GemDetailsUI.#writeSelectionSnapshot(typesField, nextValues);

    typesField.dispatchEvent(new Event("change", { bubbles: true }));
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
      const critThresholdValue = GemDetailsUI.#readGemFlagInputValue(container, Constants.FLAG_GEM_CRIT_THRESHOLD);
      const critMultiplierValue = GemDetailsUI.#readGemFlagInputValue(container, Constants.FLAG_GEM_CRIT_MULTIPLIER);
      const attackBonusValue = GemDetailsUI.#readGemFlagInputValue(container, Constants.FLAG_GEM_ATTACK_BONUS);
      const gemTagsValue = GemDetailsUI.#readGemFlagInputValue(container, Constants.FLAG_GEM_TAGS);
      await GemDetailsUI.#persistDamageFlags(container, sheet.item);
      await GemDetailsUI.#persistCritThreshold(sheet?.item, critThresholdValue);
      await GemDetailsUI.#persistCritMultiplier(sheet?.item, critMultiplierValue);
      await GemDetailsUI.#persistAttackBonus(sheet?.item, attackBonusValue);
      await GemDetailsUI.#persistGemTags(sheet?.item, gemTagsValue);
      await GemDetailsUI.#persistGemResource(container, sheet?.item);
    });
    form.dataset.scSocketsGemDetailsSubmitBound = "true";
  }

  static #readGemFlagInputValue(container, flag) {
    if (!container || !flag) return undefined;
    const name = `flags.${Constants.MODULE_ID}.${flag}`;
    const field = container.querySelector(`[name="${name}"]`);
    if (!(field instanceof HTMLInputElement
      || field instanceof HTMLSelectElement
      || field instanceof HTMLTextAreaElement
      || (field instanceof HTMLElement && field.tagName === "STRING-TAGS"))) {
      return undefined;
    }
    return field.value;
  }

  static #readDefaults(container) {
    const number = Number(container?.dataset?.defaultNumber ?? 1);
    const bonus = Number(container?.dataset?.defaultBonus ?? 0);
    const die = String(container?.dataset?.defaultDie ?? "d6").toLowerCase();
    return {
      number: Number.isFinite(number) ? number : 1,
      die,
      bonus: Number.isFinite(bonus) ? bonus : 0,
      custom: {
        enabled: false,
        formula: ""
      },
      typeMode: "inherit",
      types: [Constants.GEM_DAMAGE_INHERIT_TYPE],
      type: "",
      activity: "any"
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
      const number = Number(GemDetailsUI.#readNamedFieldValue(row, ".number") ?? 0);
      const die = String(GemDetailsUI.#readNamedFieldValue(row, ".die") ?? "");
      const bonus = Number(GemDetailsUI.#readNamedFieldValue(row, ".bonus") ?? 0);
      const customEnabled = row.querySelector('input[name$=".custom.enabled"]')?.checked === true;
      const customFormula = String(GemDetailsUI.#readNamedFieldValue(row, ".custom.formula") ?? "").trim();
      const types = GemDetailsUI.#normalizeDamageTypeValues(
        GemDetailsUI.#readSelectedValues(row.querySelector('[name$=".types"]'))
      );
      const typeMode = types.includes(Constants.GEM_DAMAGE_INHERIT_TYPE) ? "inherit" : "fixed";
      const activity = row.querySelector('select[name$=".activity"]')?.value ?? "any";
      entries.push({
        number: Number.isFinite(number) ? number : 0,
        die,
        bonus: Number.isFinite(bonus) ? bonus : 0,
        custom: {
          enabled: customEnabled,
          formula: customFormula
        },
        typeMode,
        types,
        type: typeMode === "fixed" ? (types[0] ?? "") : "",
        activity
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
    const cleaned = Array.isArray(entries)
      ? entries
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => GemDetailsUI.#normalizeEntry(entry))
      : [];
    const existing = GemDetailsBuilder.getNormalizedDamageEntries(item, { flag });
    const sameLength = existing.length === cleaned.length;
    const sameContent = sameLength && cleaned.every((entry, idx) => GemDetailsUI.#damageEntriesEqual(entry, existing[idx]));
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

  static #resolveFieldTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return target;
    }
    const path = typeof target.composedPath === "function" ? target.composedPath() : [];
    const customElement = path.find((entry) => (
      entry instanceof HTMLElement
      && (entry.tagName === "MULTI-SELECT" || entry.tagName === "STRING-TAGS")
    ));
    const namedElement = path.find((entry) => entry instanceof HTMLElement && entry.hasAttribute?.("name"));
    return customElement ?? namedElement ?? target.closest?.("multi-select,string-tags,[name]") ?? target;
  }

  static #isSupportedInputTarget(target) {
    return target instanceof HTMLInputElement
      || target instanceof HTMLSelectElement
      || target instanceof HTMLTextAreaElement
      || (target instanceof HTMLElement && ["MULTI-SELECT", "STRING-TAGS"].includes(target.tagName));
  }

  static #readNamedFieldValue(root, suffix) {
    if (!root || !suffix) {
      return undefined;
    }
    const field = root.querySelector?.(`[name$="${suffix}"]`);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) {
      return undefined;
    }
    return field.value;
  }

  static #readSelectedValues(field) {
    if (!(field instanceof HTMLElement)) {
      return [];
    }
    if (field.tagName === "MULTI-SELECT") {
      const values = GemDetailsUI.#coerceSelectedValues(field.value);
      if (values.length) {
        return values;
      }
    }
    const options = Array.from(field.querySelectorAll?.("option") ?? []);
    return GemDetailsUI.#coerceSelectedValues(options
      .filter((option) => option.selected)
      .map((option) => String(option.value ?? "").trim())
      .filter(Boolean));
  }

  static #coerceSelectedValues(rawValues) {
    if (Array.isArray(rawValues)) {
      return rawValues
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
    }
    if (rawValues && typeof rawValues !== "string" && typeof rawValues[Symbol.iterator] === "function") {
      return Array.from(rawValues)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
    }
    if (typeof rawValues === "string") {
      const value = rawValues.trim();
      return value ? [value] : [];
    }
    return [];
  }

  static #normalizeDamageTypeValues(types) {
    const cleaned = Array.from(new Set(
      (Array.isArray(types) ? types : [])
        .map((type) => String(type ?? "").trim())
        .filter(Boolean)
    ));
    if (!cleaned.length || cleaned.includes(Constants.GEM_DAMAGE_INHERIT_TYPE)) {
      return [Constants.GEM_DAMAGE_INHERIT_TYPE];
    }
    return cleaned.filter((type) => type !== Constants.GEM_DAMAGE_INHERIT_TYPE);
  }

  static #readSelectionSnapshot(field) {
    if (!(field instanceof HTMLElement)) {
      return [];
    }
    const raw = String(field.dataset.scSocketsSelectedValues ?? "").trim();
    if (!raw.length) {
      return [];
    }
    return raw.split("|").map((value) => value.trim()).filter(Boolean);
  }

  static #writeSelectionSnapshot(field, values) {
    if (!(field instanceof HTMLElement)) {
      return;
    }
    field.dataset.scSocketsSelectedValues = (Array.isArray(values) ? values : []).join("|");
  }

  static #resolveExclusiveDamageTypes(currentValues, previousValues, isChangedField) {
    const inherit = Constants.GEM_DAMAGE_INHERIT_TYPE;
    const normalizedCurrent = Array.from(new Set(
      GemDetailsUI.#coerceSelectedValues(currentValues)
    ));
    const previous = Array.isArray(previousValues) ? previousValues : [];
    const fixedTypes = normalizedCurrent.filter((value) => value !== inherit);

    if (!normalizedCurrent.length) {
      return [inherit];
    }
    if (!normalizedCurrent.includes(inherit)) {
      return fixedTypes;
    }
    if (!fixedTypes.length) {
      return [inherit];
    }

    if (!isChangedField) {
      return [inherit];
    }

    if (previous.includes(inherit)) {
      return fixedTypes.length ? fixedTypes : [inherit];
    }

    return [inherit];
  }

  static #applySelectedValues(field, values) {
    if (!(field instanceof HTMLElement)) {
      return;
    }
    const normalizedValues = GemDetailsUI.#coerceSelectedValues(values);
    for (const option of Array.from(field.querySelectorAll?.("option") ?? [])) {
      option.selected = normalizedValues.includes(String(option.value ?? "").trim());
    }
    if (field.tagName !== "MULTI-SELECT") {
      return;
    }
    try {
      field.value = normalizedValues;
    } catch (_error) {
      // The option state already reflects the normalized selection.
    }
  }

  static #normalizeEntry(entry) {
    const number = Number(entry?.number ?? 0);
    const bonus = Number(entry?.bonus ?? 0);
    const die = typeof entry?.die === "string" ? entry.die : "";
    const customEnabled = entry?.custom?.enabled === true;
    const customFormula = typeof entry?.custom?.formula === "string"
      ? entry.custom.formula.trim()
      : "";
    const types = GemDetailsUI.#normalizeDamageTypeValues(entry?.types);
    const typeMode = types.includes(Constants.GEM_DAMAGE_INHERIT_TYPE) ? "inherit" : "fixed";
    const activity = typeof entry?.activity === "string" ? entry.activity : "any";

    return {
      number: Number.isFinite(number) ? number : 0,
      die,
      bonus: Number.isFinite(bonus) ? bonus : 0,
      custom: {
        enabled: customEnabled,
        formula: customFormula
      },
      typeMode,
      types,
      type: typeMode === "fixed" ? (types[0] ?? "") : "",
      activity
    };
  }

  static #damageEntriesEqual(left, right) {
    if (!left || !right) return false;
    if (left.number !== right.number || left.die !== right.die || left.bonus !== right.bonus) {
      return false;
    }
    if (left.custom?.enabled !== right.custom?.enabled) {
      return false;
    }
    if ((left.custom?.formula ?? "") !== (right.custom?.formula ?? "")) {
      return false;
    }
    if (left.typeMode !== right.typeMode || left.activity !== right.activity) {
      return false;
    }
    if ((left.types?.length ?? 0) !== (right.types?.length ?? 0)) {
      return false;
    }
    return left.types.every((type, index) => type === right.types[index]);
  }

  static #normalizeDamageTypeSelections(container, changedTarget = null) {
    const rows = container?.querySelectorAll?.(".sc-sockets-gem-damage-row") ?? [];
    for (const row of rows) {
      const typesField = row.querySelector('[name$=".types"]');
      if (!(typesField instanceof HTMLElement)) {
        continue;
      }

      const selectedValues = GemDetailsUI.#readSelectedValues(typesField);
      const previousValues = GemDetailsUI.#readSelectionSnapshot(typesField);
      const normalizedValues = GemDetailsUI.#resolveExclusiveDamageTypes(
        selectedValues,
        previousValues,
        typesField === changedTarget
      );
      const needsUpdate = normalizedValues.length !== selectedValues.length
        || normalizedValues.some((value, index) => value !== selectedValues[index]);

      if (needsUpdate) {
        GemDetailsUI.#applySelectedValues(typesField, normalizedValues);
        if (typesField === changedTarget && typeof typesField.dispatchEvent === "function") {
          typesField.dataset.scSocketsNormalizePending = "true";
          queueMicrotask(() => {
            typesField.dispatchEvent(new Event("change", { bubbles: true }));
          });
        }
      }

      GemDetailsUI.#writeSelectionSnapshot(typesField, normalizedValues);

      if (row instanceof HTMLElement) {
        row.dataset.damageTypeMode = normalizedValues.includes(Constants.GEM_DAMAGE_INHERIT_TYPE) ? "inherit" : "fixed";
      }
    }
  }

  static async #persistDamageFlags(container, item, keep = true) {
    if (!item) return;
    const baseEntries = keep
      ? (GemDetailsUI.#readEntries(container, item, {
          sectionSelector: GemDetailsUI.DAMAGE_SECTION_SELECTOR,
          flag: Constants.FLAG_GEM_DAMAGE
        }) ?? [])
      : [];

    await GemDetailsUI.#writeEntries(item, baseEntries, Constants.FLAG_GEM_DAMAGE);
  }

  static async #persistGemResource(container, item) {
    if (!item || !container) return;

    const prefix = `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_RESOURCE}`;
    const readField = (suffix) => {
      const field = container.querySelector(`[name="${prefix}.${suffix}"]`);
      return field instanceof HTMLInputElement ? field.value : undefined;
    };
    const readCheckbox = (suffix) => {
      const field = container.querySelector(`[name="${prefix}.${suffix}"]`);
      return field instanceof HTMLInputElement ? field.checked : false;
    };

    const key = readField("key");
    if (key === undefined) {
      return;
    }

    const resource = GemResourceService.normalizeResource({
      key,
      max: readField("max"),
      value: readField("value"),
      destroyOnEmpty: readCheckbox("destroyOnEmpty")
    });

    const existing = GemResourceService.getGemResource(item);
    if (!resource) {
      if (existing) {
        await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_RESOURCE);
      }
      return;
    }

    if (existing
      && existing.key === resource.key
      && existing.max === resource.max
      && existing.value === resource.value
      && existing.destroyOnEmpty === resource.destroyOnEmpty) {
      return;
    }

    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_RESOURCE, resource);
  }

  static async #persistGemTags(item, rawValue) {
    if (!item || rawValue === undefined) return;

    const tags = GemTagService.normalizeTags(rawValue);
    const existing = GemTagService.getTags(item);
    const unchanged = existing.length === tags.length
      && existing.every((tag, index) => tag === tags[index]);
    if (unchanged) return;

    if (!tags.length) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_TAGS);
      return;
    }

    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_TAGS, tags);
  }

  static async #persistCritThreshold(item, rawValue) {
    if (!item) return;
    if (rawValue === undefined) {
      return;
    }
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
    if (rawValue === undefined) {
      return;
    }
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
    if (rawValue === undefined) {
      return;
    }
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
