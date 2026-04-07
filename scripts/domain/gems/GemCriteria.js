import { Constants } from "../../core/Constants.js";
import { ModuleSettings } from "../../core/settings/ModuleSettings.js";

export class GemCriteria {
  static #SUBTYPE_PATHS = Object.freeze([
    "system.type.value",
    "system.type.subtype"
  ]);

  static get definition() {
    return {
      types: Constants.ITEM_TYPE_LOOT,
      subtype: ModuleSettings.getGemLootSubtypes()
    };
  }

  static get matcher() {
    return GemCriteria.matches;
  }

  static matches(item) {
    if (!item) return false;
    if (item.documentName && item.documentName !== "Item") return false;

    if (item.type !== Constants.ITEM_TYPE_LOOT) return false;

    return Boolean(GemCriteria.resolveGemSubtype(item));
  }

  static hasTypeUpdate(changes) {
    if (!changes) return false;
    if (Object.prototype.hasOwnProperty.call(changes, "type")) {
      return true;
    }
    return GemCriteria.#SUBTYPE_PATHS.some((path) => foundry?.utils?.hasProperty?.(changes, path));
  }

  static resolveGemSubtype(item) {
    const fromType = GemCriteria.resolveGemSubtypeFromType(item);
    if (fromType) {
      return fromType;
    }

    const stored = foundry?.utils?.getProperty?.(item, `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_SUBTYPE}`);
    return GemCriteria.#matchConfiguredSubtype(stored);
  }

  static resolveGemSubtypeFromType(item) {
    for (const path of GemCriteria.#SUBTYPE_PATHS) {
      const subtype = foundry?.utils?.getProperty?.(item, path);
      const match = GemCriteria.#matchConfiguredSubtype(subtype);
      if (match) {
        return match;
      }
    }

    return null;
  }

  static #matchConfiguredSubtype(candidate) {
    const normalized = String(candidate ?? "").trim().toLowerCase();
    if (!normalized.length) return null;

    const configured = ModuleSettings.getGemLootSubtypes();
    const match = configured.find((value) => String(value ?? "").trim().toLowerCase() === normalized);
    return match != null ? String(match).trim() : null;
  }
}
