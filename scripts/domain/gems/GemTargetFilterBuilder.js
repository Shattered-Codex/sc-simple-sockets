import { Constants } from "../../core/Constants.js";
import { GemCriteria } from "./GemCriteria.js";

/**
 * Helper responsible for building the data model used by the gem target filter UI.
 */
export class GemTargetFilterBuilder {
  static #optionsCache = null;
  static #cacheLang = null;
  static #cacheConfig = null;

  /**
   * Builds the full context object consumed by the gem target filter template.
   * @param {Item|null} item                     - The gem item being edited.
   * @param {Object} [options]
   * @param {boolean} [options.editable=false]   - Whether the sheet is editable.
   * @param {string} [options.selectId]          - Optional select element id.
   * @param {Object} [options.part]              - Optional sheet part metadata.
   * @param {boolean} [options.includeHints=true]- Whether to include default label and hint.
   * @param {string} [options.label]             - Custom label override.
   * @param {string} [options.hint]              - Custom hint override.
   * @returns {object}
   */
  static buildContext(item, {
    editable = false,
    selectId,
    part,
    includeHints = true,
    label,
    hint
  } = {}) {
    const isGem = GemCriteria.matches(item);
    const stored = this.getStoredAllowedTypes(item);
    const selected = stored.length ? stored : [Constants.GEM_ALLOWED_TYPES_ALL];
    const selectedMap = Object.fromEntries(selected.map((value) => [value, true]));
    const options = this.applySelectionToOptions(this.buildGemTargetOptions(), selectedMap);

    const context = {
      isGem,
      editable: Boolean(editable && isGem),
      label: label ?? (includeHints
        ? Constants.localize("SCSockets.GemTargetTypes.Label", "Allowed Item Types")
        : undefined),
      hint: hint ?? (includeHints
        ? Constants.localize(
          "SCSockets.GemTargetTypes.Hint",
          "Choose which item subtypes can receive this gem."
        )
        : undefined),
      selectId: selectId ?? `${Constants.MODULE_ID}-gem-target-select`,
      options,
      selected,
      selectedMap,
      allValue: Constants.GEM_ALLOWED_TYPES_ALL
    };

    if (part) {
      context.part = part;
    }

    return context;
  }

  /**
   * Reads the allowed types stored on the gem.
   * @param {Item|null} item
   * @returns {string[]}
   */
  static getStoredAllowedTypes(item) {
    const raw = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES);
    if (!Array.isArray(raw)) {
      return [];
    }
    const unique = new Set();
    for (const value of raw) {
      if (typeof value === "string" && value.trim().length) {
        unique.add(value);
      }
    }
    return Array.from(unique);
  }

  /**
   * Generates all available options for the gem target select box.
   * @returns {Array}
   */
  static buildGemTargetOptions() {
    const lang = game?.i18n?.lang ?? "en";
    const configRef = CONFIG?.DND5E ?? null;
    if (this.#optionsCache && this.#cacheLang === lang && this.#cacheConfig === configRef) {
      return this.#optionsCache;
    }

    const options = [];

    options.push({
      value: Constants.GEM_ALLOWED_TYPES_ALL,
      label: Constants.localize("SCSockets.GemTargetTypes.AllTypes", "All Types")
    });

    const dnd5e = CONFIG?.DND5E;
    if (!dnd5e) {
      this.#cacheLang = lang;
      this.#cacheConfig = configRef;
      this.#optionsCache = options;
      return this.#optionsCache;
    }

    const groups = [
      {
        label: Constants.localize("SCSockets.GemTargetTypes.Groups.Weapons", "Weapons"),
        entries: this.normalizeCollection(dnd5e.weaponTypes),
        prefix: "weapon"
      },
      {
        label: Constants.localize("SCSockets.GemTargetTypes.Groups.Equipment", "Equipment"),
        entries: this.normalizeCollection(dnd5e.equipmentTypes),
        prefix: "equipment"
      }
    ];

    for (const group of groups) {
      if (!group.entries.length) {
        continue;
      }
      options.push({
        label: group.label,
        options: group.entries
          .map(([key, value]) => ({
            value: `${group.prefix}:${key}`,
            label: this.localizeConfigLabel(value, key)
          }))
          .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined))
      });
    }

    this.#cacheLang = lang;
    this.#cacheConfig = configRef;
    this.#optionsCache = options;
    return this.#optionsCache;
  }

  /**
   * Applies selection state to the provided options tree.
   * @param {Array} options
   * @param {Object} selectedMap
   * @returns {Array}
   */
  static applySelectionToOptions(options, selectedMap) {
    if (!Array.isArray(options)) {
      return [];
    }
    return options.map((entry) => {
      if (entry?.options) {
        return {
          ...entry,
          options: entry.options.map((opt) => ({
            ...opt,
            selected: !!selectedMap?.[opt.value]
          }))
        };
      }
      return {
        ...entry,
        selected: !!selectedMap?.[entry?.value]
      };
    });
  }

  /**
   * Normalizes different collection types into key/value tuples.
   * @param {*} collection
   * @returns {Array<[string,string|object]>}
   */
  static normalizeCollection(collection) {
    if (!collection) {
      return [];
    }
    if (collection instanceof Map) {
      return Array.from(collection.entries());
    }
    if (Array.isArray(collection)) {
      return collection.map((value, index) => [String(index), value]);
    }
    if (typeof collection === "object") {
      return Object.entries(collection);
    }
    return [];
  }

  /**
   * Resolves a localized label for a config entry.
   * @param {*} value
   * @param {string} fallback
   * @returns {string}
   */
  static localizeConfigLabel(value, fallback) {
    if (value && typeof value === "object") {
      if (typeof value.label === "string") {
        return this.localizeString(value.label, fallback);
      }
      if (typeof value.name === "string") {
        return this.localizeString(value.name, fallback);
      }
    }
    if (typeof value === "string") {
      return this.localizeString(value, fallback);
    }
    return this.formatFallbackLabel(fallback);
  }

  static localizeString(key, fallback) {
    const localized = game?.i18n?.localize?.(key);
    if (localized && localized !== key) {
      return localized;
    }
    return key ?? this.formatFallbackLabel(fallback);
  }

  static formatFallbackLabel(key) {
    if (!key) return "";
    const formatted = key.replace(/([A-Z])/g, " $1").replace(/[-_:]/g, " ");
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
}
