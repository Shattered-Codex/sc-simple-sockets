import { Constants } from "../Constants.js";

/**
 * Shared building blocks for the gem checks (removal and repair): which check
 * is rolled, how its DC is resolved, and the roll itself.
 *
 * A check is `{ type, key }` — a flat d20, or a dnd5e ability, skill or tool.
 * A DC is `{ mode, value, formula, rarity }` — a fixed number, a deterministic
 * formula, or a table indexed by the gem's rarity.
 */
export class GemCheckService {
  static TYPE_NONE = "none";
  static TYPE_FLAT = "flat";
  static TYPE_ABILITY = "ability";
  static TYPE_SKILL = "skill";
  static TYPE_TOOL = "tool";
  static CHECK_TYPES = Object.freeze(["flat", "ability", "skill", "tool"]);

  static DC_MODE_FIXED = "fixed";
  static DC_MODE_FORMULA = "formula";
  static DC_MODE_RARITY = "rarity";
  static DC_MODES = Object.freeze(["fixed", "formula", "rarity"]);

  static RARITY_NONE = "none";
  /** Ordered from lowest to highest; the index is exposed to formulas as `@gem.rarity`. */
  static RARITY_KEYS = Object.freeze([
    "none",
    "common",
    "uncommon",
    "rare",
    "veryRare",
    "legendary",
    "artifact"
  ]);

  static DEFAULT_DC = 15;
  static DEFAULT_DC_FORMULA = "10 + 2 * @gem.rarity";
  static DEFAULT_RARITY_DCS = Object.freeze({
    none: 10,
    common: 10,
    uncommon: 13,
    rare: 15,
    veryRare: 18,
    legendary: 20,
    artifact: 25
  });

  // ---------------------------------------------------------------------------
  // Check identity
  // ---------------------------------------------------------------------------

  /** Parses a compact check id ("flat", "skill:slt", "tool:jeweler") into `{ type, key }`. */
  static parseCheckId(value) {
    const raw = String(value ?? "").trim();
    const separator = raw.indexOf(":");
    const type = (separator === -1 ? raw : raw.slice(0, separator)).toLowerCase();
    const key = separator === -1 ? "" : raw.slice(separator + 1).trim();

    if (!GemCheckService.CHECK_TYPES.includes(type)) {
      return { type: GemCheckService.TYPE_FLAT, key: "" };
    }
    if (type !== GemCheckService.TYPE_FLAT && !key.length) {
      return { type: GemCheckService.TYPE_FLAT, key: "" };
    }
    return { type, key: type === GemCheckService.TYPE_FLAT ? "" : key };
  }

  static formatCheckId(check) {
    const type = String(check?.type ?? "").trim().toLowerCase();
    const key = String(check?.key ?? "").trim();
    if (!GemCheckService.CHECK_TYPES.includes(type) || type === GemCheckService.TYPE_FLAT || !key.length) {
      return GemCheckService.TYPE_FLAT;
    }
    return `${type}:${key}`;
  }

  static listAbilityOptions() {
    return Object.entries(globalThis.CONFIG?.DND5E?.abilities ?? {}).map(([value, config]) => ({
      value,
      label: config?.label ?? value
    }));
  }

  static listSkillOptions() {
    return Object.entries(globalThis.CONFIG?.DND5E?.skills ?? {}).map(([value, config]) => ({
      value,
      label: config?.label ?? value
    }));
  }

  static listToolOptions() {
    return Object.keys(globalThis.CONFIG?.DND5E?.tools ?? {})
      .map((value) => ({ value, label: GemCheckService.#toolLabel(value) }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  /** Every available check as a flat `{ value, label }` list keyed by compact check id. */
  static listCheckChoices() {
    const prefixed = (type, key, fallback, options) => {
      const prefix = Constants.localize(key, fallback);
      return options.map((option) => ({
        value: `${type}:${option.value}`,
        label: `${prefix}: ${option.label}`
      }));
    };

    return [
      {
        value: GemCheckService.TYPE_FLAT,
        label: Constants.localize("SCSockets.GemCheck.Types.Flat", "Flat d20")
      },
      ...prefixed(
        GemCheckService.TYPE_TOOL,
        "SCSockets.GemCheck.Types.Tool",
        "Tool",
        GemCheckService.listToolOptions()
      ),
      ...prefixed(
        GemCheckService.TYPE_SKILL,
        "SCSockets.GemCheck.Types.Skill",
        "Skill",
        GemCheckService.listSkillOptions()
      ),
      ...prefixed(
        GemCheckService.TYPE_ABILITY,
        "SCSockets.GemCheck.Types.Ability",
        "Ability",
        GemCheckService.listAbilityOptions()
      )
    ];
  }

  static describeCheck(check) {
    const type = String(check?.type ?? "").trim();
    const key = String(check?.key ?? "").trim();
    if (type === GemCheckService.TYPE_ABILITY) {
      return globalThis.CONFIG?.DND5E?.abilities?.[key]?.label ?? key;
    }
    if (type === GemCheckService.TYPE_SKILL) {
      return globalThis.CONFIG?.DND5E?.skills?.[key]?.label ?? key;
    }
    if (type === GemCheckService.TYPE_TOOL) {
      return GemCheckService.#toolLabel(key);
    }
    return Constants.localize("SCSockets.GemCheck.Types.Flat", "Flat d20");
  }

  static #toolLabel(key) {
    try {
      const label = globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key, { trait: "tool" });
      if (typeof label === "string" && label.length && label !== key) {
        return label;
      }
    } catch {
      // Fall through to the raw key.
    }
    return key;
  }

  // ---------------------------------------------------------------------------
  // Rarity
  // ---------------------------------------------------------------------------

  static resolveRarityKey(gem) {
    const rarity = String(gem?.system?.rarity ?? "").trim();
    return GemCheckService.RARITY_KEYS.includes(rarity) && rarity.length
      ? rarity
      : GemCheckService.RARITY_NONE;
  }

  /** 0 for a gem without rarity, 1 for common … 6 for artifact. */
  static resolveRarityTier(gem) {
    return GemCheckService.RARITY_KEYS.indexOf(GemCheckService.resolveRarityKey(gem));
  }

  static listRarityOptions() {
    return GemCheckService.RARITY_KEYS.map((value) => ({
      value,
      label: value === GemCheckService.RARITY_NONE
        ? Constants.localize("SCSockets.GemCheck.Rarity.None", "No rarity")
        : GemCheckService.#rarityLabel(value)
    }));
  }

  static #rarityLabel(key) {
    const label = globalThis.CONFIG?.DND5E?.itemRarity?.[key];
    if (typeof label === "string" && label.length) {
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return key;
  }

  static normalizeRarityDcs(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const normalized = {};
    for (const key of GemCheckService.RARITY_KEYS) {
      const value = Number(source[key]);
      normalized[key] = Number.isFinite(value)
        ? Math.max(Math.trunc(value), 0)
        : GemCheckService.DEFAULT_RARITY_DCS[key];
    }
    return normalized;
  }

  // ---------------------------------------------------------------------------
  // DC
  // ---------------------------------------------------------------------------

  static normalizeDcMode(mode) {
    const normalized = String(mode ?? "").trim().toLowerCase();
    return GemCheckService.DC_MODES.includes(normalized) ? normalized : GemCheckService.DC_MODE_FIXED;
  }

  /**
   * Resolves a DC configuration to a number. Returns null when a formula
   * cannot be resolved, so callers can decide how to report it.
   * @param {{mode?: string, value?: number, formula?: string, rarity?: object}} config
   * @param {{gem?: object|null, rollData?: object}} [context]
   */
  static resolveDc(config = {}, { gem = null, rollData = {} } = {}) {
    const mode = GemCheckService.normalizeDcMode(config?.mode);

    if (mode === GemCheckService.DC_MODE_RARITY) {
      const table = GemCheckService.normalizeRarityDcs(config?.rarity);
      return table[GemCheckService.resolveRarityKey(gem)];
    }

    if (mode === GemCheckService.DC_MODE_FORMULA) {
      return GemCheckService.resolveDcFormula(config?.formula, { gem, rollData });
    }

    const value = Number(config?.value);
    return Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : GemCheckService.DEFAULT_DC;
  }

  /**
   * Evaluates a number or a deterministic formula (e.g. "10 + 2 * @gem.rarity")
   * against the provided roll data plus the `@gem.*` values.
   */
  static resolveDcFormula(formula, { gem = null, rollData = {} } = {}) {
    const raw = String(formula ?? "").trim();
    if (!raw.length) {
      return null;
    }

    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return Math.max(Math.trunc(numeric), 0);
    }

    const data = {
      ...(rollData && typeof rollData === "object" ? rollData : {}),
      gem: { rarity: GemCheckService.resolveRarityTier(gem) }
    };

    try {
      // simplifyBonus returns 0 for invalid or random formulas, which would
      // silently disable a check. Reject those formulas instead.
      const roll = new Roll(raw, data);
      if (!roll.isDeterministic) {
        return null;
      }
      const resolved = roll.evaluateSync().total;
      return Number.isFinite(resolved) ? Math.max(Math.trunc(resolved), 0) : null;
    } catch (error) {
      if (Constants.isDebugEnabled()) {
        console.debug(`[${Constants.MODULE_ID}] could not resolve DC formula "${raw}":`, error);
      }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Roll
  // ---------------------------------------------------------------------------

  static requiresActor(check) {
    const type = String(check?.type ?? "").trim();
    return type === GemCheckService.TYPE_ABILITY
      || type === GemCheckService.TYPE_SKILL
      || type === GemCheckService.TYPE_TOOL;
  }

  /**
   * Rolls the check against the DC and posts it to chat.
   * Returns `{ ok: false, reason }` when the roll was cancelled or could not
   * be made, otherwise `{ ok: true, success, total, dc }`.
   */
  static async roll({ actor = null, check = {}, dc = GemCheckService.DEFAULT_DC, flavor = "" } = {}) {
    const type = String(check?.type ?? "").trim();
    const key = String(check?.key ?? "").trim();
    const target = Math.max(Math.trunc(Number(dc) || 0), 0);

    if (!GemCheckService.requiresActor(check)) {
      const roll = new Roll("1d20");
      await roll.evaluate();
      await roll.toMessage({
        flavor: GemCheckService.#flavorWithDc(flavor, target),
        speaker: ChatMessage.getSpeaker({ actor })
      });
      const total = Number(roll.total);
      return { ok: true, success: total >= target, total, dc: target };
    }

    if (!actor) {
      return { ok: false, reason: "no-actor" };
    }

    const message = flavor ? { data: { flavor: `${flavor} — ${GemCheckService.describeCheck(check)}` } } : {};
    let rolls = null;
    try {
      if (type === GemCheckService.TYPE_ABILITY) {
        rolls = await actor.rollAbilityCheck({ ability: key, target }, {}, message);
      } else if (type === GemCheckService.TYPE_SKILL) {
        rolls = await actor.rollSkill({ skill: key, target }, {}, message);
      } else {
        rolls = await actor.rollToolCheck({ tool: key, target }, {}, message);
      }
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] gem check roll failed:`, error);
      return { ok: false, reason: "roll-error" };
    }

    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    if (!roll) {
      return { ok: false, reason: "roll-cancelled" };
    }

    const total = Number(roll.total);
    return { ok: true, success: total >= target, total, dc: target };
  }

  static #flavorWithDc(flavor, dc) {
    const label = String(flavor ?? "").trim();
    const dcLabel = game?.i18n?.format?.("SCSockets.GemCheck.DcLabel", { dc });
    const suffix = dcLabel && dcLabel !== "SCSockets.GemCheck.DcLabel" ? dcLabel : `DC ${dc}`;
    return label.length ? `${label} (${suffix})` : suffix;
  }
}
