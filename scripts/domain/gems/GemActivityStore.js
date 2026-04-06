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
    const source = item.toObject();
    const activities = GemActivityStore.#sanitizeActivities(source.system?.activities);
    if (!GemActivityStore.#hasEntries(activities)) {
      const existing = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH);
      if (existing) {
        await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH);
      }
      return;
    }

    const payload = {
      activities,
      uses: foundry.utils.deepClone(source.system?.uses ?? {})
    };
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH, payload);
  }

  static async removeAll(item) {
    if (!item) return;
    const ids = GemActivityStore.#extractActivityIds(item);
    if (!ids.length) {
      return;
    }

    // stash() is always called before removeAll() and preserves original uses.
    const update = { "system.uses": GemActivityStore.#RESET_USES };
    for (const id of ids) {
      update[`system.activities.-=${id}`] = null;
    }
    await item.update(update);
  }

  static async restore(item, { clearAfter = true } = {}) {
    if (!item) return;
    const payload = item.getFlag(Constants.MODULE_ID, Constants.FLAG_ACTIVITY_STASH);
    if (!payload) return;

    const update = {};
    const activities = GemActivityStore.#sanitizeActivities(payload.activities);
    if (GemActivityStore.#hasEntries(activities)) {
      update["system.activities"] = activities;
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

  static #sanitizeActivities(activities) {
    if (!activities || typeof activities !== "object" || Array.isArray(activities)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(activities).filter(([, activity]) => (
        activity
        && typeof activity === "object"
        && typeof activity.type === "string"
        && activity.type.length
      ))
    );
  }

  static #extractActivityIds(item) {
    const sourceActivities = item?.toObject?.()?.system?.activities;
    if (sourceActivities && typeof sourceActivities === "object" && !Array.isArray(sourceActivities)) {
      const sanitized = GemActivityStore.#sanitizeActivities(sourceActivities);
      return Object.keys(sanitized).filter((id) => typeof id === "string" && id.length);
    }

    const collection = item?.system?.activities;
    if (typeof collection?.map === "function") {
      return collection
        .map((activity) => activity?.id ?? activity?._id ?? null)
        .filter((id) => typeof id === "string" && id.length);
    }

    return [];
  }
}
