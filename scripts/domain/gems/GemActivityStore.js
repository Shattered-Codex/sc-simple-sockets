import { Constants } from "../../core/Constants.js";

/**
 * Persists activities for gem items so they can be restored when the subtype changes back to gem.
 */
export class GemActivityStore {
  static #RESET_USES = Object.freeze({
    spent: 0,
    max: "",
    recovery: []
  });

  static async stash(item) {
    if (!item) return;
    const { activities, uses } = item.system ?? {};
    if (!GemActivityStore.#hasEntries(activities)) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH);
      return;
    }

    const source = item.toObject();
    const payload = {
      activities: foundry.utils.deepClone(source.system?.activities ?? {}),
      uses: foundry.utils.deepClone(source.system?.uses ?? {})
    };
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH, payload);
  }

  static async removeAll(item) {
    if (!item) return;
    const payload = item.getFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH);
    if (!GemActivityStore.#hasEntries(item.system?.activities)) {
      return;
    }

    const update = { "system.activities": {} };
    if (payload?.uses) {
      update["system.uses"] = GemActivityStore.#RESET_USES;
    }
    await item.update(update);
  }

  static async restore(item, { clearAfter = true } = {}) {
    if (!item) return;
    const payload = item.getFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH);
    if (!payload) return;

    const update = {};
    if (GemActivityStore.#hasEntries(payload.activities)) {
      update["system.activities"] = payload.activities;
    }
    if (payload.uses) {
      update["system.uses"] = payload.uses;
    }

    if (Object.keys(update).length) {
      await item.update(update);
    }

    if (clearAfter) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH);
    }
  }

  static #hasEntries(collection) {
    if (!collection) return false;
    if (typeof collection.size === "number") return collection.size > 0;
    if (Array.isArray(collection)) return collection.length > 0;
    if (typeof collection === "object") return Object.keys(collection).length > 0;
    return false;
  }
}
