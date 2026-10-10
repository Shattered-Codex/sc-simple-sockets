import { HostOperationQueue } from "../support/HostOperationQueue.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { DebugTrace } from "../support/DebugTrace.js";
import { GemBreakService } from "../../domain/gems/GemBreakService.js";

export class InventoryService {
  static #ASCENDANT_ITEMS_MODULE_ID = "sc-ascendant-items";

  static #STACK_COMPARE_EXCLUDES = new Set([
    "_id",
    "_stats",
    "sort",
    "folder",
    "ownership"
  ]);

  /**
   * Takes one unit of a gem out of its actor's inventory. Returns whether a
   * unit was taken: false when the gem is gone by now, or broken while
   * `requireIntact` is set.
   *
   * Every inventory change runs in the actor's queue and reads the gem again
   * inside it, so two operations on the same stack never both act on the
   * quantity one of them is about to change.
   */
  static async consumeOne(gemItem, options = {}, { requireIntact = false } = {}) {
    if (!gemItem?.actor) {
      return false;
    }
    return HostOperationQueue.enqueue(
      gemItem.actor,
      () => InventoryService.consumeOneLocked(gemItem, options, { requireIntact })
    );
  }

  /** `consumeOne` for a caller that already runs inside the actor's queue. */
  static async consumeOneLocked(gemItem, options = {}, { requireIntact = false } = {}) {
    const actor = gemItem?.actor;
    if (!actor) {
      return false;
    }
    const current = typeof actor.items?.get === "function" ? actor.items.get(gemItem.id) : gemItem;
    if (!current || (requireIntact && GemBreakService.isBroken(current))) {
      return false;
    }
    gemItem = current;
    DebugTrace.log("inventory.consumeOne.start", {
      gemItem: DebugTrace.describeItem(gemItem),
      actor: DebugTrace.describeActor(gemItem.actor),
      options: DebugTrace.describeOptions(options)
    });
    const qty = Number(gemItem.system?.quantity ?? 1);
    if (qty > 1) {
      await gemItem.update({ "system.quantity": qty - 1 }, options);
    } else {
      await actor.deleteEmbeddedDocuments("Item", [gemItem.id], options);
    }
    DebugTrace.log("inventory.consumeOne.done", {
      gemItem: DebugTrace.describeItem(gemItem),
      actor: DebugTrace.describeActor(gemItem.actor)
    });
    return true;
  }

  /** Puts one unit of a gem into the inventory of `hostItem`'s actor, in that actor's queue. */
  static async returnOne(hostItem, snap, options = {}) {
    if (!snap || !hostItem?.actor) {
      return;
    }
    return HostOperationQueue.enqueue(
      hostItem.actor,
      () => InventoryService.returnOneLocked(hostItem, snap, options)
    );
  }

  /** `returnOne` for a caller that already runs inside the actor's queue. */
  static async returnOneLocked(hostItem, snap, options = {}) {
    if (!snap) {
      return;
    }
    const actor = hostItem.actor;
    const payload = foundry.utils.deepClone(snap);
    if (!actor) {
      return;
    }
    DebugTrace.log("inventory.returnOne.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(actor),
      options: DebugTrace.describeOptions(options),
      gemName: payload?.name ?? null
    });
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
      await same.update({ "system.quantity": qty + 1 }, options);
      DebugTrace.log("inventory.returnOne.stack", {
        actor: DebugTrace.describeActor(actor),
        item: DebugTrace.describeItem(same)
      });
      return same;
    }

    const created = await actor.createEmbeddedDocuments("Item", [payload], options);
    DebugTrace.log("inventory.returnOne.create", {
      actor: DebugTrace.describeActor(actor),
      item: DebugTrace.describeItem(created?.[0] ?? null),
      gemName: payload?.name ?? null
    });
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

    // A broken gem shares its source with the intact one, so the source check
    // below would otherwise merge the two into a single stack.
    if (itemStackData.broken !== payloadStackData.broken) {
      return false;
    }

    // Same reasoning for an unidentified gem and its identified twin.
    if (itemStackData.unidentified !== payloadStackData.unidentified) {
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
      broken: GemBreakService.isBroken(raw),
      unidentified: raw?.system?.identified === false,
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
