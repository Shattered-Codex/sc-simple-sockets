import { Constants } from "../../core/Constants.js";
import { ModuleSettings } from "../../core/settings/ModuleSettings.js";
import { GemCriteria } from "./GemCriteria.js";

/**
 * Helper responsible for building the data model used by the gem target filter UI.
 */
export class GemTargetFilterBuilder {
  static #optionsCache = null;
  static #cacheLang = null;
  static #cacheConfig = null;
  static #cacheTypeKey = null;

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
    const configuredTypes = ModuleSettings.getSocketableItemTypes();
    const typeKey = configuredTypes.join("|");
    if (this.#optionsCache && this.#cacheLang === lang && this.#cacheConfig === configRef && this.#cacheTypeKey === typeKey) {
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
      this.#cacheTypeKey = typeKey;
      this.#optionsCache = options;
      return this.#optionsCache;
    }

    const typeLabelMap = new Map(
      ModuleSettings.getAvailableSocketableItemTypes().map((entry) => [entry.value, entry.label])
    );

    for (const type of configuredTypes) {
      const normalizedType = String(type ?? "").trim().toLowerCase();
      if (!normalizedType.length) {
        continue;
      }

      const subtypeEntries = this.#resolveSubtypeEntries(dnd5e, normalizedType);
      if (subtypeEntries.length) {
        const groupLabel = this.#resolveGroupLabel(normalizedType, typeLabelMap.get(normalizedType));
        options.push({
          label: groupLabel,
          options: [
            {
              value: normalizedType,
              label: groupLabel,
              isGroup: true,
              groupType: normalizedType
            },
            ...subtypeEntries.map((entry) => ({
              value: `${normalizedType}:${entry.key}`,
              label: entry.label,
              groupChildOf: normalizedType
            }))
          ]
        });
        continue;
      }

      options.push({
        value: normalizedType,
        label: typeLabelMap.get(normalizedType) ?? this.formatFallbackLabel(normalizedType)
      });
    }

    this.#cacheLang = lang;
    this.#cacheConfig = configRef;
    this.#cacheTypeKey = typeKey;
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
      if (Array.isArray(entry?.options)) {
        return {
          ...entry,
          options: entry.options.map((option) => {
            const groupType = String(option?.groupType ?? option?.groupChildOf ?? "").toLowerCase();
            if (option?.isGroup && groupType.length) {
              return {
                ...option,
                selected: !!selectedMap?.[groupType]
              };
            }
            if (option?.groupChildOf && groupType.length) {
              return {
                ...option,
                selected: !!selectedMap?.[option.value] || !!selectedMap?.[groupType]
              };
            }
            return {
              ...option,
              selected: !!selectedMap?.[option?.value]
            };
          })
        };
      }

      return {
        ...entry,
        selected: !!selectedMap?.[entry?.value]
      };
    });
  }

  static #resolveSubtypeEntries(dnd5e, type) {
    const normalizedType = String(type ?? "").trim().toLowerCase();
    if (normalizedType === "container") {
      return [];
    }

    const typeLabel = this.formatFallbackLabel(normalizedType).toLowerCase();
    const collection = this.#resolveSubtypeCollection(dnd5e, type);
    const entries = this.normalizeCollection(collection)
      .map(([key, value]) => ({
        key: String(key ?? "").trim(),
        label: String(this.localizeConfigLabel(value, key) ?? "").trim()
      }))
      .filter((entry) => entry.key.length && entry.label.length)
      .filter((entry) => {
        if (!normalizedType.length) return true;
        const keyLower = entry.key.toLowerCase();
        const labelLower = entry.label.toLowerCase();

        // Keep only semantic subtype keys (slug/camelCase), skipping technical ids.
        if (!this.#looksLikeSemanticSubtypeKey(entry.key)) {
          return false;
        }

        // Ignore duplicate "parent-as-child" entries (e.g. Container -> Container).
        if (keyLower === normalizedType && labelLower === typeLabel) {
          return false;
        }

        // Ignore opaque/generated ids that leak into config collections.
        if (this.#looksLikeOpaqueSubtypeToken(entry.key) && this.#looksLikeOpaqueSubtypeToken(entry.label)) {
          return false;
        }
        if (entry.label === entry.key && this.#looksLikeOpaqueSubtypeToken(entry.label)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined));

    return entries;
  }

  static #resolveSubtypeCollection(dnd5e, type) {
    if (!dnd5e || !type) return null;
    const candidates = [
      `${type}Types`,
      `${type.replace(/s$/, "")}Types`
    ];

    for (const key of candidates) {
      const collection = dnd5e?.[key];
      if (collection) return collection;
    }

    return null;
  }

  static #resolveGroupLabel(type, fallbackLabel) {
    if (type === "weapon") {
      return Constants.localize("SCSockets.GemTargetTypes.Groups.Weapons", "Weapons");
    }
    if (type === "equipment") {
      return Constants.localize("SCSockets.GemTargetTypes.Groups.Equipment", "Equipment");
    }
    return fallbackLabel ?? this.formatFallbackLabel(type);
  }

  static #looksLikeOpaqueSubtypeToken(value) {
    const token = String(value ?? "").trim();
    if (!token.length) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return false;
    if (token.length < 12) return false;
    if (/[\s.]/.test(token)) return false;

    const compact = token.replace(/[-_]/g, "");
    const hasLower = /[a-z]/.test(compact);
    const hasUpper = /[A-Z]/.test(compact);
    const hasDigit = /\d/.test(compact);

    return (hasLower && hasUpper && hasDigit) || (hasLower && hasUpper && compact.length >= 16);
  }

  static #looksLikeSemanticSubtypeKey(value) {
    const token = String(value ?? "").trim();
    if (!token.length) return false;
    if (token.length > 48) return false;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(token)) return false;
    if (!/^[a-z]/.test(token)) return false;
    if (this.#looksLikeOpaqueSubtypeToken(token)) return false;
    return true;
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
