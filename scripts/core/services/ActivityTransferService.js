import { Constants } from "../Constants.js";

export class ActivityTransferService {
  static async applyFromGem(hostItem, slotIndex, gemItem) {
    if (!hostItem || !gemItem) return;
    if (!ActivityTransferService.#hasActivitiesField(hostItem)) {
      return;
    }

    await ActivityTransferService.removeForSlot(hostItem, slotIndex);

    const sourceActivities = gemItem.system?.activities?.contents ?? [];
    if (!sourceActivities.length) {
      return;
    }

    const createdIds = [];
    const activityMeta = {};
    for (const activity of sourceActivities) {
      const original = activity.toObject();
      const type = original.type;
      const config = CONFIG.DND5E.activityTypes[type];
      if (!config) continue;
      const ActivityClass = config.documentClass;

      const createData = foundry.utils.deepClone(original);
      delete createData._id;

      const doc = new ActivityClass({ type, ...createData }, { parent: hostItem });
      if (doc._preCreate(createData) === false) {
        continue;
      }

      const payload = doc.toObject();
      const newId = doc.id;
      await hostItem.update({ [`system.activities.${newId}`]: payload });
      createdIds.push(newId);
      activityMeta[newId] = {
        sourceId: activity.id,
        hostActivityId: newId,
        slot: slotIndex,
        gemImg: gemItem.img,
        gemName: gemItem.name,
        gemUuid: gemItem.uuid,
        activityName: original.name
      };
    }

    if (!createdIds.length) {
      return;
    }

    const flagPayload = {
      gemUuid: gemItem.uuid,
      gemName: gemItem.name,
      gemImg: gemItem.img,
      activityIds: createdIds,
      activityMeta
    };

    const flagPath = `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.${slotIndex}`;
    await hostItem.update({ [flagPath]: flagPayload });
  }

  static async removeForSlot(hostItem, slotIndex) {
    if (!hostItem || !ActivityTransferService.#hasActivitiesField(hostItem)) {
      return;
    }

    const flag = hostItem.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES);
    const slotData = flag?.[slotIndex];
    const ids = Array.isArray(slotData?.activityIds) ? slotData.activityIds : [];
    const meta = slotData?.activityMeta ?? {};
    if (!ids.length) {
      return;
    }

    const updates = { [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.${slotIndex}`]: null };
    const collection = hostItem.system?.activities;
    for (const id of ids) {
      if (!collection?.has?.(id)) {
        delete meta[id];
        continue;
      }
      updates[`system.activities.-=${id}`] = null;
      const source = meta[id]?.sourceId;
      if (source) {
        const activity = collection.get?.(source);
        if (activity && !activity.cachedSpell) {
          const cached = activity.toObject();
          if (cached.spell?.uuid && foundry.utils.getType(cached.spell.uuid) === "string") {
            updates[`flags.${Constants.MODULE_ID}.cachedSpells`] ??= {};
            updates[`flags.${Constants.MODULE_ID}.cachedSpells`][cached.spell.uuid] = true;
          }
        }
      }
    }
    await hostItem.update(updates);
  }

  static #makeActivityId() {
    return foundry.utils.randomID();
  }

  static #hasActivitiesField(item) {
    return item?.system && Object.prototype.hasOwnProperty.call(item.system, "activities");
  }
}
