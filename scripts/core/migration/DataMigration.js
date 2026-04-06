import { Constants } from "../Constants.js";
import { ItemResolver } from "../ItemResolver.js";

/**
 * Handles one-time data migrations for the module.
 *
 * How versioning works:
 *  - CURRENT_VERSION is a string that must be bumped every time a new migration
 *    is added. The value is stored in a world setting after all migrations run.
 *  - On each `ready`, only the GM checks whether the stored version differs from
 *    CURRENT_VERSION. If it does, every migration function runs in order.
 *  - Migrations must be idempotent (safe to run on already-migrated data).
 */
export class DataMigration {
  static SETTING_MIGRATION_VERSION = "migrationVersion";

  /**
   * Bump this string whenever a new migration is added.
   * Format: "<module-version>-<short-description>"
   */
  static #CURRENT_VERSION = "1.1.17-slot-item-ref-keys";

  /** Entry point — call once from the `ready` hook (GM only). */
  static async run() {
    if (!game.user?.isGM) return;

    const stored = DataMigration.#getStoredVersion();
    if (stored === DataMigration.#CURRENT_VERSION) return;

    console.log(`[${Constants.MODULE_ID}] | Running data migrations (${stored || "none"} → ${DataMigration.#CURRENT_VERSION})...`);

    try {
      await DataMigration.#migrateLootActivityFields();
      await DataMigration.#migrateSocketGemSnapshots();
    } catch (e) {
      console.error(`[${Constants.MODULE_ID}] | Migration failed, will retry on next load:`, e);
      return;
    }

    try {
      await game.settings.set(
        Constants.MODULE_ID,
        DataMigration.SETTING_MIGRATION_VERSION,
        DataMigration.#CURRENT_VERSION
      );
    } catch (e) {
      console.warn(`[${Constants.MODULE_ID}] | Could not save migration version:`, e);
    }

    console.log(`[${Constants.MODULE_ID}] | Data migrations complete.`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  static #getStoredVersion() {
    try {
      return game.settings.get(Constants.MODULE_ID, DataMigration.SETTING_MIGRATION_VERSION) ?? "";
    } catch {
      return "";
    }
  }

  // ---------------------------------------------------------------------------
  // Migration 1 — loot-activity-fields
  // ---------------------------------------------------------------------------
  /**
   * Ensures every loot item in the world has `system.activities` and
   * `system.uses` present in its stored source data.
   *
   * Items created before `LootActivitiesExtension` was applied lack these
   * fields, which causes `DataModelValidationError` whenever the owning actor
   * resets its embedded collection (e.g. when effects are added or removed).
   * Setting them to `{}` lets the DataModel schema fill in its own defaults.
   */
  static async #migrateLootActivityFields() {
    const needsMigration = (item) => {
      const src = item?.toObject?.()?.system ?? {};
      return src.activities === undefined || src.uses === undefined;
    };

    const allLoot = DataMigration.#collectAllLootItems();
    const toMigrate = allLoot.filter(needsMigration);

    if (!toMigrate.length) {
      console.log(`[${Constants.MODULE_ID}] | No loot items need migration.`);
      return;
    }

    console.log(`[${Constants.MODULE_ID}] | Migrating ${toMigrate.length} loot item(s) with missing activity fields...`);

    // Group actor-owned items by their parent actor for bulk updates.
    const byActor = new Map();
    const standalone = [];

    for (const item of toMigrate) {
      if (item.actor) {
        if (!byActor.has(item.actor)) byActor.set(item.actor, []);
        byActor.get(item.actor).push(item);
      } else {
        standalone.push(item);
      }
    }

    // Bulk-update per actor (one request per actor instead of one per item).
    for (const [actor, items] of byActor) {
      const updates = items.map((item) => {
        const src = item.toObject().system ?? {};
        const patch = { _id: item.id };
        if (src.activities === undefined) patch["system.activities"] = {};
        if (src.uses === undefined) patch["system.uses"] = {};
        return patch;
      });

      try {
        await actor.updateEmbeddedDocuments("Item", updates);
      } catch (e) {
        console.warn(`[${Constants.MODULE_ID}] | Failed to migrate items on actor "${actor.name}":`, e);
      }
    }

    // Update world (non-actor) items individually.
    for (const item of standalone) {
      const src = item.toObject().system ?? {};
      const patch = {};
      if (src.activities === undefined) patch["system.activities"] = {};
      if (src.uses === undefined) patch["system.uses"] = {};

      try {
        await item.update(patch);
      } catch (e) {
        console.warn(`[${Constants.MODULE_ID}] | Failed to migrate "${item.name}" (${item.uuid}):`, e);
      }
    }
  }

  /**
   * Normalizes stored gem snapshots inside socket flags.
   *
   * Older snapshots could store the full gem source object directly in `_gemData`.
   * On newer Foundry/dnd5e versions that can cause `Item.update()` to interpret
   * nested item-like data as embedded documents during socket updates.
   *
   * Compacting the snapshot keeps the UI/runtime behavior the same while avoiding
   * invalid embedded-document payloads on later updates.
   */
  static async #migrateSocketGemSnapshots() {
    const allItems = DataMigration.#collectAllItemsWithSockets();
    const toMigrate = [];

    for (const item of allItems) {
      const slots = item.getFlag(Constants.MODULE_ID, Constants.FLAGS.sockets);
      if (!Array.isArray(slots) || !slots.some((slot) => slot?._gemData)) {
        continue;
      }

      const normalized = foundry.utils.deepClone(slots);
      ItemResolver.normalizeSocketSlots(normalized);

      if (JSON.stringify(normalized) === JSON.stringify(slots)) {
        continue;
      }

      toMigrate.push({ item, slots: normalized });
    }

    if (!toMigrate.length) {
      console.log(`[${Constants.MODULE_ID}] | No socket gem snapshots need migration.`);
      return;
    }

    console.log(`[${Constants.MODULE_ID}] | Migrating ${toMigrate.length} item(s) with legacy socket gem snapshots...`);

    const byActor = new Map();
    const standalone = [];

    for (const entry of toMigrate) {
      if (entry.item.actor) {
        if (!byActor.has(entry.item.actor)) byActor.set(entry.item.actor, []);
        byActor.get(entry.item.actor).push(entry);
      } else {
        standalone.push(entry);
      }
    }

    for (const [actor, entries] of byActor) {
      const updates = entries.map(({ item, slots }) => ({
        _id: item.id,
        [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: slots
      }));

      try {
        await actor.updateEmbeddedDocuments("Item", updates);
      } catch (e) {
        console.warn(`[${Constants.MODULE_ID}] | Failed to migrate socket snapshots on actor "${actor.name}":`, e);
      }
    }

    for (const { item, slots } of standalone) {
      try {
        await item.update({
          [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: slots
        });
      } catch (e) {
        console.warn(`[${Constants.MODULE_ID}] | Failed to migrate socket snapshots for "${item.name}" (${item.uuid}):`, e);
      }
    }
  }

  static #collectAllLootItems() {
    const type = Constants.ITEM_TYPE_LOOT;
    const worldItems = [...(game.items ?? [])].filter((i) => i?.type === type);
    const actorItems = [...(game.actors ?? [])]
      .flatMap((a) => [...(a?.items ?? [])])
      .filter((i) => i?.type === type);
    return [...worldItems, ...actorItems];
  }

  static #collectAllItemsWithSockets() {
    const worldItems = [...(game.items ?? [])];
    const actorItems = [...(game.actors ?? [])]
      .flatMap((actor) => [...(actor?.items ?? [])]);
    return [...worldItems, ...actorItems];
  }
}
