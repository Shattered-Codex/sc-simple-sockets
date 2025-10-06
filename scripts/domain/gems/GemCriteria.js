import { Constants } from "../../core/Constants.js";

export class GemCriteria {
  static #SUBTYPE_PATH = "system.type.value";

  static #definition = Object.freeze({
    types: Constants.ITEM_TYPE_LOOT,
    subtype: Constants.ITEM_SUBTYPE_GEM
  });

  static get definition() {
    return GemCriteria.#definition;
  }

  static get matcher() {
    return GemCriteria.matches;
  }

  static matches(item) {
    if (!item) return false;
    if (item.documentName && item.documentName !== "Item") return false;

    if (item.type !== Constants.ITEM_TYPE_LOOT) return false;

    const subtype = foundry?.utils?.getProperty?.(item, GemCriteria.#SUBTYPE_PATH);
    return String(subtype ?? "").toLowerCase() === String(Constants.ITEM_SUBTYPE_GEM).toLowerCase();
  }

  static hasTypeUpdate(changes) {
    if (!changes) return false;
    if (Object.prototype.hasOwnProperty.call(changes, "type")) return true;
    if (foundry?.utils?.hasProperty?.(changes, GemCriteria.#SUBTYPE_PATH)) return true;
    if (foundry?.utils?.hasProperty?.(changes, "system.type.subtype")) return true; 
    return false;
  }
}
