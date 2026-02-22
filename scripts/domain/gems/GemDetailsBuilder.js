import { Constants } from "../../core/Constants.js";
import { GemCriteria } from "./GemCriteria.js";

export class GemDetailsBuilder {
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
    const value = "weapons";
    const showWeaponDetails = true;
    const damage = this.#buildDamageContext(item, { include: showWeaponDetails });
    const critThreshold = this.#buildCritThresholdContext(item, { include: showWeaponDetails });
    const critMultiplier = this.#buildCritMultiplierContext(item, { include: showWeaponDetails });
    const attackBonus = this.#buildAttackBonusContext(item, { include: showWeaponDetails });
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
      options: [],
      showWeaponDetails,
      damage,
      critThreshold,
      critMultiplier,
      attackBonus
    };

    if (part) {
      context.part = part;
    }

    return context;
  }

  static #buildDamageContext(item, { include = false, flag = Constants.FLAG_GEM_DAMAGE } = {}) {
    const dieOptions = this.#buildDieOptions();
    const damageTypeOptions = this.#buildDamageTypeOptions();
    const activityOptions = this.#buildActivityOptions();
    const defaults = this.#getDefaultDamageEntry({ dieOptions, damageTypeOptions });
    const entries = include
      ? this.getNormalizedDamageEntries(item, { dieOptions, damageTypeOptions, defaults, flag })
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
      })),
      activityOptions: activityOptions.map((opt) => ({
        ...opt,
        selected: opt.value === entry.activity
      }))
    });

    const displayEntries = entries.map(buildEntry);

    return {
      namePrefix: `flags.${Constants.MODULE_ID}.${flag}`,
      entries: displayEntries,
      dieOptions,
      damageTypeOptions,
      activityOptions,
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
    defaults,
    flag = Constants.FLAG_GEM_DAMAGE
  } = {}) {
    const dice = dieOptions ?? this.#buildDieOptions();
    const types = damageTypeOptions ?? this.#buildDamageTypeOptions();
    const fallbackDefaults = defaults ?? this.#getDefaultDamageEntry({
      dieOptions: dice,
      damageTypeOptions: types
    });
    const allowedDice = new Set(dice.map((opt) => opt.value));
    const allowedTypes = new Set(types.map((opt) => opt.value));
    const allowedActivities = new Set(["any", "attack", "spell"]);
    const stored = this.#getStoredDamage(source, flag);

    return this.#normalizeDamageEntries(stored, {
      defaults: fallbackDefaults,
      allowedDice,
      allowedTypes,
      allowedActivities
    });
  }

  static #buildDieOptions() {
    const denominations = CONFIG?.Dice?.DamageRoll?.denominations ??
      CONFIG?.Dice?.d20?.denominations ??
      ["d4", "d6", "d8", "d10", "d12", "d20"];
    const unique = Array.from(new Set(denominations.map((d) => String(d).toLowerCase()))).filter(Boolean);
    const options = unique.map((value) => ({
      value,
      label: value.toUpperCase()
    }));
    // Allow a blank entry.
    options.unshift({ value: "", label: "" });
    return options;
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

  static #getStoredDamage(item, flag = Constants.FLAG_GEM_DAMAGE) {
    const raw = item?.getFlag?.(Constants.MODULE_ID, flag);
    const flags = item?.flags?.[Constants.MODULE_ID]?.[flag];
    const source = raw ?? flags ?? item?._source?.flags?.[Constants.MODULE_ID]?.[flag];

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

  static #normalizeDamageEntries(entries, { defaults, allowedDice, allowedTypes, allowedActivities }) {
    if (!Array.isArray(entries)) {
      return [];
    }
    return entries
      .map((entry) => this.#normalizeDamageEntry(entry, { defaults, allowedDice, allowedTypes, allowedActivities }))
      .filter(Boolean);
  }

  static #normalizeDamageEntry(entry, { defaults, allowedDice, allowedTypes, allowedActivities }) {
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
    const activity = typeof entry.activity === "string" && allowedActivities?.has(entry.activity)
      ? entry.activity
      : "any";

    return {
      number: Number.isFinite(number) ? number : defaults.number,
      die,
      bonus: Number.isFinite(bonus) ? bonus : defaults.bonus,
      type,
      activity
    };
  }

  static #getDefaultDamageEntry({ dieOptions, damageTypeOptions }) {
    const die = dieOptions?.find?.((opt) => opt.value)?.value ?? "d6";
    const type = damageTypeOptions?.[0]?.value ?? "";
    return {
      number: 1,
      die,
      bonus: 0,
      type,
      activity: "any"
    };
  }

  static #buildActivityOptions() {
    return [
      { value: "any", label: Constants.localize("SCSockets.GemDetails.ExtraDamageActivity.Any", "Any action") },
      { value: "attack", label: Constants.localize("SCSockets.GemDetails.ExtraDamageActivity.Attack", "Attack only") },
      { value: "spell", label: Constants.localize("SCSockets.GemDetails.ExtraDamageActivity.Spell", "Spell only") }
    ];
  }

  static #buildCritThresholdContext(item, { include = false } = {}) {
    const stored = include ? GemDetailsBuilder.#getStoredCritThreshold(item) : null;
    const value = GemDetailsBuilder.#normalizeCritThreshold(stored);
    return {
      value: value ?? "",
      name: `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_CRIT_THRESHOLD}`,
      label: Constants.localize("SCSockets.GemDetails.CritThreshold.Label", "Critical Threshold"),
      hint: Constants.localize(
        "SCSockets.GemDetails.CritThreshold.Hint",
        "Lowest d20 result that counts as a critical hit for this gem. If multiple gems adjust this, the lowest value is used. Leave blank for no change."
      )
    };
  }

  static #getStoredCritThreshold(item) {
    const raw = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_THRESHOLD);
    const flags = item?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_CRIT_THRESHOLD];
    const source = raw ?? flags ?? item?._source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_CRIT_THRESHOLD];
    return source;
  }

  static #normalizeCritThreshold(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    const clamped = Math.min(Math.max(Math.floor(num), 1), 20);
    return clamped;
  }

  static #buildCritMultiplierContext(item, { include = false } = {}) {
    const stored = include ? GemDetailsBuilder.#getStoredCritMultiplier(item) : null;
    const value = GemDetailsBuilder.#normalizeCritMultiplier(stored);
    return {
      value: value ?? "",
      name: `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_CRIT_MULTIPLIER}`,
      label: Constants.localize("SCSockets.GemDetails.CritMultiplier.Label", "Critical Multiplier"),
      hint: Constants.localize(
        "SCSockets.GemDetails.CritMultiplier.Hint",
        "Multiply critical damage by this value when this gem is socketed. If multiple gems set this, the highest value is used. Leave blank to use the normal multiplier."
      )
    };
  }

  static #getStoredCritMultiplier(item) {
    const raw = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_CRIT_MULTIPLIER);
    const flags = item?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_CRIT_MULTIPLIER];
    const source = raw ?? flags ?? item?._source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_CRIT_MULTIPLIER];
    return source;
  }

  static #normalizeCritMultiplier(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const normalized = Math.max(Math.floor(num), 1);
    return normalized;
  }

  static #buildAttackBonusContext(item, { include = false } = {}) {
    const stored = include ? GemDetailsBuilder.#getStoredAttackBonus(item) : null;
    const value = GemDetailsBuilder.#normalizeAttackBonus(stored);
    return {
      value: value ?? "",
      name: `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_ATTACK_BONUS}`,
      label: Constants.localize("SCSockets.GemDetails.AttackBonus.Label", "Attack Bonus"),
      hint: Constants.localize(
        "SCSockets.GemDetails.AttackBonus.Hint",
        "Flat bonus added to attack rolls when this gem is socketed. Bonuses from multiple gems stack. Leave blank for none."
      )
    };
  }

  static #getStoredAttackBonus(item) {
    const raw = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_ATTACK_BONUS);
    const flags = item?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_ATTACK_BONUS];
    const source = raw ?? flags ?? item?._source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_ATTACK_BONUS];
    return source;
  }

  static #normalizeAttackBonus(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.floor(num);
  }
}
