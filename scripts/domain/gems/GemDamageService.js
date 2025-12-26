import { Constants } from "../../core/Constants.js";
import { SocketStore } from "../../core/SocketStore.js";
import { GemDetailsBuilder } from "./GemDetailsBuilder.js";

export class GemDamageService {
  static #damageHandler = null;
  static #attackHandler = null;
  static META_KEY = "gemDamage";

  static activate() {
    if (!GemDamageService.#damageHandler) {
      GemDamageService.#damageHandler = (config) => GemDamageService.#onPreRollDamage(config);
      Hooks.on("dnd5e.preRollDamageV2", GemDamageService.#damageHandler);
    }

    if (!GemDamageService.#attackHandler) {
      GemDamageService.#attackHandler = (config) => GemDamageService.#onPreRollAttack(config);
      Hooks.on("dnd5e.preRollAttackV2", GemDamageService.#attackHandler);
    }
  }

  static deactivate() {
    if (GemDamageService.#damageHandler) {
      Hooks.off("dnd5e.preRollDamageV2", GemDamageService.#damageHandler);
      GemDamageService.#damageHandler = null;
    }
    if (GemDamageService.#attackHandler) {
      Hooks.off("dnd5e.preRollAttackV2", GemDamageService.#attackHandler);
      GemDamageService.#attackHandler = null;
    }
  }

  static #onPreRollDamage(config) {
    try {
      GemDamageService.#applyCritMultiplier(config);
      GemDamageService.#applyGemDamage(config);
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] apply gem damage failed:`, error);
    }
  }

  static #onPreRollAttack(config) {
    try {
      GemDamageService.#applyAttackBonus(config);
      GemDamageService.#applyCritThreshold(config);
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] apply crit threshold failed:`, error);
    }
  }

  static #applyGemDamage(config) {
    const item = GemDamageService.extractItem(config);
    if (!item || item.type !== "weapon") {
      return;
    }
    const activityType = GemDamageService.#extractActivityType(config);

    const rolls = Array.isArray(config?.rolls) ? config.rolls : [];
    if (!rolls.length) {
      return;
    }

    const baseRoll = rolls[0];
    const entries = GemDamageService.collectGemDamage(item, { activityType });
    if (!entries.length) {
      return;
    }

    for (const entry of entries) {
      const baseOptions = baseRoll.options ?? {};
      const properties = Array.isArray(baseOptions.properties)
        ? [...baseOptions.properties]
        : [];
      const types = entry.type
        ? [entry.type]
        : Array.isArray(baseOptions.types)
          ? [...baseOptions.types]
          : [];

      const options = {
        ...baseOptions,
        properties,
        type: entry.type ?? baseOptions.type,
        types
      };
      GemDamageService.addMetadata(options, entry);

      rolls.push({
        data: baseRoll.data,
        parts: [entry.formula],
        options
      });
    }
  }

  static collectGemDamage(item, { flag = Constants.FLAG_GEM_DAMAGE, activityType } = {}) {
    const slots = SocketStore.peekSlots(item);
    if (!Array.isArray(slots) || !slots.length) {
      return [];
    }

    const entries = [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      const gem = GemDamageService.resolveGemSource(slot);
      if (!gem) {
        continue;
      }

      const normalized = GemDetailsBuilder.getNormalizedDamageEntries(gem, { flag });
      for (const entry of normalized) {
        if (!GemDamageService.#matchesActivity(entry, activityType)) {
          continue;
        }
        const formula = GemDamageService.buildFormula(entry);
        if (!formula) {
          continue;
        }
        entries.push({
          ...entry,
          formula,
          source: {
            name: gem.name ?? slot?.name,
            img: gem.img ?? slot?.img,
            slot: slot?._slot ?? slotIndex,
            uuid: gem.uuid ?? slot?.gem?.uuid ?? slot?._gemData?.uuid
          }
        });
      }
    }
    return entries;
  }

  static #matchesActivity(entry, activityType) {
    if (!entry || !entry.activity || entry.activity === "any") {
      return true;
    }
    if (!activityType) {
      return entry.activity === "any";
    }
    return entry.activity === activityType;
  }

  static resolveGemSource(slot) {
    if (!slot) {
      return null;
    }
    if (slot._gemData) {
      return slot._gemData;
    }

    const uuid = slot.gem?.uuid ?? slot.gem?.sourceUuid;
    if (uuid && typeof fromUuidSync === "function") {
      try {
        return fromUuidSync(uuid);
      } catch (error) {
        console.warn(`[${Constants.MODULE_ID}] Unable to resolve gem from uuid ${uuid}:`, error);
      }
    }
    return null;
  }

  static readFlag(source, key) {
    if (!source) {
      return null;
    }
    if (typeof source.getFlag === "function") {
      return source.getFlag(Constants.MODULE_ID, key);
    }
    return source?.flags?.[Constants.MODULE_ID]?.[key] ?? null;
  }

  static buildFormula(entry) {
    const number = Math.max(0, Number(entry?.number ?? 0));
    const die = typeof entry?.die === "string" ? entry.die.toLowerCase() : "";
    const bonus = Number(entry?.bonus ?? 0);

    const parts = [];
    if (number > 0 && die) {
      parts.push(`${number}${die}`);
    }
    if (bonus) {
      parts.push(bonus);
    }
    if (!parts.length) {
      return null;
    }

    const formula = parts.join(" + ");
    if (typeof Roll?.validate === "function") {
      return Roll.validate(formula) ? formula : null;
    }
    return formula;
  }

  static addMetadata(options, entry) {
    if (!entry) return options;
    const source = entry.source ?? {};
    const meta = {
      gemName: source.name ?? Constants.localize("SCSockets.GemDetails.ExtraDamage.Label", "Gem"),
      gemImg: source.img ?? Constants.SOCKET_SLOT_IMG,
      formula: entry.formula,
      type: entry.type,
      slot: source.slot,
      gemUuid: source.uuid,
      criticalOnly: entry.criticalOnly === true
    };

    const opts = options ?? {};
    opts[Constants.MODULE_ID] ??= {};
    if (!Array.isArray(opts[Constants.MODULE_ID][GemDamageService.META_KEY])) {
      opts[Constants.MODULE_ID][GemDamageService.META_KEY] = [];
    }
    opts[Constants.MODULE_ID][GemDamageService.META_KEY].push(meta);
    return opts;
  }

  static extractItem(config) {
    return config?.subject?.item ?? config?.item ?? null;
  }

  static #extractActivityType(config) {
    const activityType = config?.subject?.type
      ?? config?.item?.system?.type
      ?? config?.action
      ?? config?.options?.action
      ?? config?.item?.system?.actionType;
    return typeof activityType === "string"
      ? activityType.toLowerCase()
      : null;
  }

  static #applyCritMultiplier(config) {
    const item = GemDamageService.extractItem(config);
    if (!item || item.type !== "weapon") {
      return;
    }
    const multiplier = GemDamageService.#collectCritMultiplier(item);
    if (!multiplier) {
      return;
    }

    const rolls = Array.isArray(config?.rolls) ? config.rolls : [];
    for (const roll of rolls) {
      const isCrit = GemDamageService.#isCriticalAction(config, roll, { strict: true });
      if (!isCrit) {
        continue;
      }
      // Ensure the roll is treated as critical so the multiplier applies to base damage.
      roll.options ??= {};
      roll.options.isCritical = true;
      roll.options.critical ??= {};
      roll.options.critical.multiplier = Math.max(
        Number.isFinite(roll.options.critical.multiplier) ? roll.options.critical.multiplier : 2,
        multiplier
      );
    }

    // Also update the shared config so downstream merges see the multiplier.
    config.isCritical ||= GemDamageService.#isCriticalAction(config, rolls[0], { strict: true });
    config.options ??= {};
    config.options.isCritical ??= config.isCritical;
    config.critical ??= {};
    config.critical.multiplier = Math.max(
      Number.isFinite(config.critical.multiplier) ? config.critical.multiplier : 2,
      multiplier
    );
    config.options.critical ??= {};
    config.options.critical.multiplier = Math.max(
      Number.isFinite(config.options.critical.multiplier) ? config.options.critical.multiplier : 2,
      multiplier
    );
  }

  static #applyCritThreshold(config) {
    const item = GemDamageService.extractItem(config);
    if (!item || item.type !== "weapon") {
      return;
    }

    const threshold = GemDamageService.#collectCritThreshold(item);
    if (!threshold) {
      return;
    }

    const rolls = Array.isArray(config?.rolls) ? config.rolls : [];
    for (const roll of rolls) {
      roll.options ??= {};
      const current = Number.isFinite(roll.options.criticalSuccess)
        ? roll.options.criticalSuccess
        : 20;
      roll.options.criticalSuccess = Math.min(current, threshold);
      if (roll.options.criticalSuccess < 1) {
        roll.options.criticalSuccess = 1;
      }
    }

    if (config?.options) {
      const current = Number.isFinite(config.options.criticalSuccess)
        ? config.options.criticalSuccess
        : 20;
      config.options.criticalSuccess = Math.min(current, threshold);
      if (config.options.criticalSuccess < 1) {
        config.options.criticalSuccess = 1;
      }
    }
  }

  static #collectCritThreshold(item) {
    const slots = SocketStore.peekSlots(item);
    if (!Array.isArray(slots) || !slots.length) {
      return null;
    }
    let best = null;

    for (const slot of slots) {
      const gem = GemDamageService.resolveGemSource(slot);
      if (!gem) continue;

      const raw = GemDamageService.readFlag(gem, Constants.FLAG_GEM_CRIT_THRESHOLD);
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      const clamped = Math.min(Math.max(Math.floor(value), 1), 20);
      best = best === null ? clamped : Math.min(best, clamped);
    }

    return best;
  }

  static #isCriticalAction(config, baseRoll, { strict = false } = {}) {
    const action = config?.action ?? config?.options?.action;
    if (action === "normal") return false;
    if (action === "critical") return true;
    if (strict) return false;
    if (config?.isCritical === true) return true;
    if (config?.options?.isCritical === true) return true;
    if (baseRoll?.options?.isCritical === true) return true;
    return false;
  }

  static #collectCritMultiplier(item) {
    const slots = SocketStore.peekSlots(item);
    if (!Array.isArray(slots) || !slots.length) {
      return null;
    }
    let best = null;

    for (const slot of slots) {
      const gem = GemDamageService.resolveGemSource(slot);
      if (!gem) continue;

      const raw = GemDamageService.readFlag(gem, Constants.FLAG_GEM_CRIT_MULTIPLIER);
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const normalized = Math.max(Math.floor(value), 1);
      best = best === null ? normalized : Math.max(best, normalized);
    }

    return best;
  }

  static #applyAttackBonus(config) {
    const item = GemDamageService.extractItem(config);
    if (!item || item.type !== "weapon") {
      return;
    }
    const total = GemDamageService.#collectAttackBonus(item);
    if (!total) {
      return;
    }

    const rolls = Array.isArray(config?.rolls) ? config.rolls : [];
    for (const roll of rolls) {
      roll.parts ??= [];
      roll.parts.push(total);
    }
  }

  static #collectAttackBonus(item) {
    const slots = SocketStore.peekSlots(item);
    if (!Array.isArray(slots) || !slots.length) {
      return 0;
    }
    let sum = 0;

    for (const slot of slots) {
      const gem = GemDamageService.resolveGemSource(slot);
      if (!gem) continue;

      const raw = GemDamageService.readFlag(gem, Constants.FLAG_GEM_ATTACK_BONUS);
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      sum += Math.floor(value);
    }

    return sum;
  }
}
