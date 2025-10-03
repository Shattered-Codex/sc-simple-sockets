import { Constants } from "./Constants.js";

export class ItemResolver {
  static async resolveDraggedItem(data) {
    const uuid = data?.uuid ?? data?.data?.uuid;
    if (!uuid) {
      return null;
    }
    try {
      return await fromUuid(uuid);
    } catch {
      return null;
    }
  }

  static isGem(itemDoc) {
    if (!itemDoc || itemDoc.documentName !== "Item") {
      return false;
    }
    if (itemDoc.type !== Constants.ITEM_TYPE_LOOT) {
      return false;
    }
    const subtype = foundry.utils.getProperty(itemDoc, "system.type.value");
    return String(subtype ?? "").toLowerCase() === Constants.ITEM_SUBTYPE_GEM;
  }

  static snapshotOne(gemItem) {
    const snap = gemItem.toObject();
    delete snap._id;
    foundry.utils.setProperty(snap, "system.quantity", 1);
    return snap;
  }
}
