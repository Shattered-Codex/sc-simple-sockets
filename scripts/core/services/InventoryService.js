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
    InventoryService.#sanitizePayload(payload);
    const payloadStackData = InventoryService.#prepareStackData(payload);

    const same = actor.items.find((item) => {
      if (!GemCriteria.matches(item)) {
        return false;
      }
      return InventoryService.#canStackWithPayload(item, payloadStackData);
    });
    if (same) {
      const qty = Number(same.system?.quantity ?? 1);
      await same.update({ "system.quantity": qty + 1 });
      return same;
    }

    const created = await actor.createEmbeddedDocuments("Item", [payload]);
    return created?.[0] ?? null;
  }

  /**
   * Ensures required schema fields are present when re-creating a gem from an older snapshot.
   * Snapshots captured before LootActivitiesExtension was applied may lack `activities` and
   * `uses`, which are required (non-nullable) by the LootWithActivities DataModel schema.
   * Setting them to empty objects lets the schema apply its own defaults.
   */
  static #sanitizePayload(payload) {
    const system = payload?.system;
    if (!system) return;
    if (system.activities === undefined) {
      system.activities = {};
    }
    if (system.uses === undefined) {
      system.uses = { spent: 0, max: "", recovery: [] };
    }
  }

  static #canStackWithPayload(item, payloadStackData) {
    if (!payloadStackData || payloadStackData.hasAscendantState) {
      return false;
    }

    const itemStackData = InventoryService.#prepareStackData(item);
    if (itemStackData.hasAscendantState) {
      return false;
    }

    if (itemStackData.type !== payloadStackData.type) {
      return false;
    }

    if (itemStackData.name !== payloadStackData.name) {
      return false;
    }

    if (itemStackData.img !== payloadStackData.img) {
      return false;
    }

    if (itemStackData.subtype !== payloadStackData.subtype) {
      return false;
    }

    if (itemStackData.sourceId && payloadStackData.sourceId) {
      return itemStackData.sourceId === payloadStackData.sourceId;
    }
    if (itemStackData.sourceId || payloadStackData.sourceId) {
      return false;
    }

    return itemStackData.fingerprint === payloadStackData.fingerprint;
  }

  static #buildStackFingerprint(source) {
    const normalized = InventoryService.#normalizeForStack(source, []);
    return JSON.stringify(normalized);
  }

  static #prepareStackData(source) {
    const getProperty = foundry?.utils?.getProperty;
    const raw = source?.toObject?.() ?? source ?? {};
    const type = String(raw?.type ?? "").trim().toLowerCase();
    const name = String(raw?.name ?? "").trim();
    const img = String(raw?.img ?? "").trim();
    const subtype = String(
      (typeof getProperty === "function"
        ? getProperty(raw, "system.type.value") ?? getProperty(raw, "system.type.subtype")
        : raw?.system?.type?.value ?? raw?.system?.type?.subtype)
      ?? ""
    ).trim().toLowerCase();
    const sourceId = String(
      (typeof getProperty === "function"
        ? getProperty(raw, "flags.core.sourceId")
        : raw?.flags?.core?.sourceId)
      ?? ""
    ).trim();

    return {
      raw,
      type,
      name,
      img,
      subtype,
      sourceId,
      hasAscendantState: InventoryService.#hasAscendantItemState(raw),
      fingerprint: sourceId ? "" : InventoryService.#buildStackFingerprint(raw)
    };
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
