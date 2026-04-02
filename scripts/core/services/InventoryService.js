import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";

export class InventoryService {
  static #ASCENDANT_ITEMS_MODULE_ID = "sc-ascendant-items";

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
    const payload = foundry.utils.deepClone(snap);
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
    if (InventoryService.#hasAscendantItemState(item) || InventoryService.#hasAscendantItemState(payload)) {
      return false;
    }

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

  static #hasAscendantItemState(source) {
    const getProperty = foundry?.utils?.getProperty;
    const moduleId = InventoryService.#ASCENDANT_ITEMS_MODULE_ID;
    const explicitEnabled = typeof getProperty === "function"
      ? getProperty(source, `flags.${moduleId}.enabled`)
      : source?.flags?.[moduleId]?.enabled;
    const storedData = typeof getProperty === "function"
      ? getProperty(source, `flags.${moduleId}.data`)
      : source?.flags?.[moduleId]?.data;

    if (typeof explicitEnabled === "boolean") {
      return true;
    }

    return Boolean(storedData && typeof storedData === "object" && Object.keys(storedData).length);
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
