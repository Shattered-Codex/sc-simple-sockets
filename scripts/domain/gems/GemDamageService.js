import { Constants } from "../../core/Constants.js";
import { SocketStore } from "../../core/SocketStore.js";
import { GemDetailsBuilder } from "./GemDetailsBuilder.js";

export class GemDamageService {
  static #handler = null;
  static META_KEY = "gemDamage";

  static activate() {
    if (GemDamageService.#handler) {
      return;
    }

    GemDamageService.#handler = (config) => GemDamageService.#onPreRollDamage(config);
    Hooks.on("dnd5e.preRollDamageV2", GemDamageService.#handler);
  }

  static deactivate() {
    if (!GemDamageService.#handler) {
      return;
    }
    Hooks.off("dnd5e.preRollDamageV2", GemDamageService.#handler);
    GemDamageService.#handler = null;
  }

  static #onPreRollDamage(config) {
    try {
      GemDamageService.#applyGemDamage(config);
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] apply gem damage failed:`, error);
    }
  }

  static #applyGemDamage(config) {
    const item = GemDamageService.extractItem(config);
    if (!item || item.type !== "weapon") {
      return;
    }

    const rolls = Array.isArray(config?.rolls) ? config.rolls : [];
    if (!rolls.length) {
      return;
    }

    const baseRoll = rolls[0];
    const entries = GemDamageService.collectGemDamage(item);
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

  static collectGemDamage(item) {
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

      const detailType = GemDamageService.readFlag(gem, Constants.FLAG_GEM_DETAIL_TYPE);
      if (detailType !== "weapons") {
        continue;
      }

      const normalized = GemDetailsBuilder.getNormalizedDamageEntries(gem);
      for (const entry of normalized) {
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
      gemUuid: source.uuid
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
}
