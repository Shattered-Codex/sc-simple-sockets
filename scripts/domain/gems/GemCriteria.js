import { Constants } from "../../core/Constants.js";
import { ModuleSettings } from "../../core/settings/ModuleSettings.js";

export class GemCriteria {
  static #SUBTYPE_PATH = "system.type.value";

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

    const subtype = foundry?.utils?.getProperty?.(item, GemCriteria.#SUBTYPE_PATH);
    const normalized = String(subtype ?? "").trim().toLowerCase();
    if (!normalized.length) {
      return false;
    }

    return ModuleSettings.getGemLootSubtypes()
      .map((value) => String(value ?? "").trim().toLowerCase())
      .includes(normalized);
  }

  static hasTypeUpdate(changes) {
    if (!changes) return false;
    if (Object.prototype.hasOwnProperty.call(changes, "type")) return true;
    if (foundry?.utils?.hasProperty?.(changes, GemCriteria.#SUBTYPE_PATH)) return true;
    if (foundry?.utils?.hasProperty?.(changes, "system.type.subtype")) return true; 
    return false;
  }
}
