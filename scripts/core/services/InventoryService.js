import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";

export class InventoryService {

  static async consumeOne(gemItem) {
    if (!gemItem?.actor) {
      return;
    }
    const qty = Number(gemItem.system?.quantity ?? 1);
    if (qty > 1) {
      await gemItem.update({ "system.quantity": qty - 1 });
    } else {
      await gemItem.actor.deleteEmbeddedDocuments("Item", [gemItem.id]);
    }
  }

  static async returnOne(hostItem, snap) {
    if (!snap) {
      return;
    }
    const actor = hostItem.actor;
    const payload = foundry.utils.duplicate(snap);
    if (!actor) {
      return;
    }

    const same = actor.items.find(i => GemCriteria.matches(i) && i.name === payload.name);
    if (same) {
      const qty = Number(same.system?.quantity ?? 1);
      await same.update({ "system.quantity": qty + 1 });
      return same;
    }

    const created = await actor.createEmbeddedDocuments("Item", [payload]);
    return created?.[0] ?? null;
  }
}
