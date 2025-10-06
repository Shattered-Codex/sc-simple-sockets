import { GemCriteria } from "../domain/gems/GemCriteria.js";

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
    return GemCriteria.matches(itemDoc);
  }

  static snapshotOne(gemItem) {
    const snap = gemItem.toObject();
    delete snap._id;
    foundry.utils.setProperty(snap, "system.quantity", 1);
    return snap;
  }
}
