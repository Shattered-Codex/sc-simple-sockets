import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";

export class InventoryService {
  static #STACK_COMPARE_EXCLUDES = new Set([
    "_id",
    "_stats",
    "sort",
    "folder",
    "ownership"
  ]);

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
    foundry.utils.setProperty(payload, "system.quantity", 1);

    const same = actor.items.find((item) => {
      if (!GemCriteria.matches(item)) {
        return false;
      }
      return InventoryService.#canStackWithPayload(item, payload);
    });
    if (same) {
      const qty = Number(same.system?.quantity ?? 1);
      await same.update({ "system.quantity": qty + 1 });
      return same;
    }

    const created = await actor.createEmbeddedDocuments("Item", [payload]);
    return created?.[0] ?? null;
  }

  static #canStackWithPayload(item, payload) {
    const getProperty = foundry?.utils?.getProperty;
    const itemSourceId = typeof getProperty === "function"
      ? getProperty(item, "flags.core.sourceId")
      : item?.flags?.core?.sourceId;
    const payloadSourceId = typeof getProperty === "function"
      ? getProperty(payload, "flags.core.sourceId")
      : payload?.flags?.core?.sourceId;

    if (itemSourceId && payloadSourceId) {
      return String(itemSourceId) === String(payloadSourceId);
    }
    if (itemSourceId || payloadSourceId) {
      return false;
    }

    const itemFingerprint = InventoryService.#buildStackFingerprint(item?.toObject?.() ?? item);
    const payloadFingerprint = InventoryService.#buildStackFingerprint(payload);
    return itemFingerprint === payloadFingerprint;
  }

  static #buildStackFingerprint(source) {
    const normalized = InventoryService.#normalizeForStack(source, []);
    return JSON.stringify(normalized);
  }

  static #normalizeForStack(value, path) {
    if (Array.isArray(value)) {
      return value.map((entry) => InventoryService.#normalizeForStack(entry, path));
    }

    if (value && typeof value === "object") {
      const output = {};
      const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
      for (const key of keys) {
        if (InventoryService.#STACK_COMPARE_EXCLUDES.has(key)) {
          continue;
        }
        if (key === "quantity" && path[path.length - 1] === "system") {
          continue;
        }

        output[key] = InventoryService.#normalizeForStack(value[key], [...path, key]);
      }
      return output;
    }

    return value;
  }
}
