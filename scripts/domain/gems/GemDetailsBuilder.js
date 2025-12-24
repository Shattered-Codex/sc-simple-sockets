import { Constants } from "../../core/Constants.js";
import { GemCriteria } from "./GemCriteria.js";

export class GemDetailsBuilder {
  static #DEFAULT_VALUE = "none";
  static #VALID_VALUES = new Set([
    GemDetailsBuilder.#DEFAULT_VALUE,
    "weapons",
    "equipment"
  ]);

  /**
   * Builds the context consumed by the gem details tab template.
   * @param {Item|null} item
   * @param {Object} [options]
   * @param {boolean} [options.editable=false]
   * @param {string} [options.selectId]
   * @param {string} [options.selectName]
   * @param {Object} [options.part]
   * @param {boolean} [options.includeHints=true]
   * @returns {object}
   */
  static buildContext(item, {
    editable = undefined,
    selectId,
    selectName,
    part,
    includeHints = true
  } = {}) {
    const isGem = GemCriteria.matches(item);
    const value = this.#normalizeValue(this.#getStoredValue(item));
    const showWeaponDetails = value === "weapons";
    const damage = this.#buildDamageContext(item, { include: showWeaponDetails });
    const canEdit = Boolean(
      isGem && (
        (editable ?? true) ||
        item?.sheet?.isEditable ||
        item?.isOwner ||
        item?.parent?.isOwner
      )
    );

    const context = {
      isGem,
      editable: canEdit,
      label: Constants.localize("SCSockets.GemDetails.SelectLabel", "Additional Details"),
      hint: includeHints
        ? Constants.localize(
          "SCSockets.GemDetails.Hint",
          "Choose how this gem should be categorized."
        )
        : undefined,
      selectId: selectId ?? `${Constants.MODULE_ID}-gem-details-select`,
      selectName: selectName ?? `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_DETAIL_TYPE}`,
      value,
      options: this.#buildOptions(value),
      showWeaponDetails,
      damage
    };

    if (part) {
      context.part = part;
    }

    return context;
  }

  static #getStoredValue(item) {
    const raw = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_DETAIL_TYPE);
    return typeof raw === "string" ? raw : null;
  }

  static #normalizeValue(value) {
    if (typeof value === "string" && GemDetailsBuilder.#VALID_VALUES.has(value)) {
      return value;
    }
    return GemDetailsBuilder.#DEFAULT_VALUE;
  }

  static #buildOptions(selectedValue) {
    const options = [
      { value: GemDetailsBuilder.#DEFAULT_VALUE, label: Constants.localize("SCSockets.GemDetails.Options.None", "None") },
      { value: "weapons", label: Constants.localize("SCSockets.GemDetails.Options.Weapons", "Weapons") },
      { value: "equipment", label: Constants.localize("SCSockets.GemDetails.Options.Equipment", "Equipment") }
    ];

    return options.map((opt) => ({
      ...opt,
      selected: opt.value === selectedValue
    }));
  }

  static #buildDamageContext(item, { include = false } = {}) {
    const dieOptions = this.#buildDieOptions();
    const damageTypeOptions = this.#buildDamageTypeOptions();
    const defaults = this.#getDefaultDamageEntry({ dieOptions, damageTypeOptions });
    const entries = include
      ? this.getNormalizedDamageEntries(item, { dieOptions, damageTypeOptions, defaults })
      : [];

    const buildEntry = (entry) => ({
      ...entry,
      dieOptions: dieOptions.map((opt) => ({
        ...opt,
        selected: opt.value === entry.die
      })),
      damageTypeOptions: damageTypeOptions.map((opt) => ({
        ...opt,
        selected: opt.value === entry.type
      }))
    });

    const displayEntries = entries.map(buildEntry);

    return {
      namePrefix: `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_DAMAGE}`,
      entries: displayEntries,
      dieOptions,
      damageTypeOptions,
      defaults
    };
  }

  /**
   * Reads and normalizes stored gem damage entries from a gem document or raw data.
   * @param {Item|object|null} source
   * @param {Object} [options]
   * @param {Array} [options.dieOptions]
   * @param {Array} [options.damageTypeOptions]
   * @param {Object} [options.defaults]
   * @returns {Array}
   */
  static getNormalizedDamageEntries(source, {
    dieOptions,
    damageTypeOptions,
    defaults
  } = {}) {
    const dice = dieOptions ?? this.#buildDieOptions();
    const types = damageTypeOptions ?? this.#buildDamageTypeOptions();
    const fallbackDefaults = defaults ?? this.#getDefaultDamageEntry({
      dieOptions: dice,
      damageTypeOptions: types
    });
    const allowedDice = new Set(dice.map((opt) => opt.value));
    const allowedTypes = new Set(types.map((opt) => opt.value));
    const stored = this.#getStoredDamage(source);

    return this.#normalizeDamageEntries(stored, {
      defaults: fallbackDefaults,
      allowedDice,
      allowedTypes
    });
  }

  static #buildDieOptions() {
    const denominations = CONFIG?.Dice?.DamageRoll?.denominations ??
      CONFIG?.Dice?.d20?.denominations ??
      ["d4", "d6", "d8", "d10", "d12", "d20"];
    const unique = Array.from(new Set(denominations.map((d) => String(d).toLowerCase())));
    return unique.map((value) => ({
      value,
      label: value.toUpperCase()
    }));
  }

  static #buildDamageTypeOptions() {
    const types = CONFIG?.DND5E?.damageTypes ?? {};
    const lang = game?.i18n?.lang ?? undefined;
    return Object.entries(types)
      .map(([key, val]) => ({
        value: key,
        label: this.#localizeDamageLabel(val, key)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, lang));
  }

  static #localizeDamageLabel(value, fallback) {
    if (typeof value === "string") {
      const localized = game?.i18n?.localize?.(value);
      if (localized && localized !== value) {
        return localized;
      }
      return value;
    }
    if (value && typeof value === "object" && typeof value.label === "string") {
      const localized = game?.i18n?.localize?.(value.label);
      if (localized && localized !== value.label) {
        return localized;
      }
      return value.label;
    }
    if (fallback) {
      const formatted = fallback.replace(/([A-Z])/g, " $1").replace(/[-_:]/g, " ");
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    return "";
  }

  static #getStoredDamage(item) {
    const raw = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_DAMAGE);
    const flags = item?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_DAMAGE];
    const source = raw ?? flags ?? item?._source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_DAMAGE];

    if (Array.isArray(source)) {
      return source;
    }

    if (source && typeof source === "object") {
      // Convert a plain object with numeric keys into an array.
      const entries = Object.entries(source)
        .filter(([key]) => /^\d+$/.test(key))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, val]) => val);
      return entries;
    }

    return [];
  }

  static #normalizeDamageEntries(entries, { defaults, allowedDice, allowedTypes }) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .map((entry) => this.#normalizeDamageEntry(entry, { defaults, allowedDice, allowedTypes }))
      .filter(Boolean);
  }

  static #normalizeDamageEntry(entry, { defaults, allowedDice, allowedTypes }) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const number = Number(entry.number ?? defaults.number ?? 1);
    const die = typeof entry.die === "string" && allowedDice.has(entry.die.toLowerCase())
      ? entry.die.toLowerCase()
      : defaults.die;
    const bonus = Number(entry.bonus ?? defaults.bonus ?? 0);
    const type = typeof entry.type === "string" && allowedTypes.has(entry.type)
      ? entry.type
      : defaults.type;

    return {
      number: Number.isFinite(number) ? number : defaults.number,
      die,
      bonus: Number.isFinite(bonus) ? bonus : defaults.bonus,
      type
    };
  }

  static #getDefaultDamageEntry({ dieOptions, damageTypeOptions }) {
    const die = dieOptions?.[0]?.value ?? "d6";
    const type = damageTypeOptions?.[0]?.value ?? "";
    return {
      number: 1,
      die,
      bonus: 0,
      type
    };
  }
}
