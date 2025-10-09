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

    const updates = {};
    const createdIds = [];
    const activityMeta = {};
    for (const activity of sourceActivities) {
      const data = activity.toObject();
      const newId = ActivityTransferService.#makeActivityId();
      data._id = newId;
      updates[`system.activities.${newId}`] = data;
      createdIds.push(newId);
      activityMeta[newId] = {
        sourceId: activity.id,
        slot: slotIndex,
        gemImg: gemItem.img,
        gemName: gemItem.name,
        activityName: activity.name
      };
    }

    if (!Object.keys(updates).length) {
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
    await hostItem.update({
      ...updates,
      [flagPath]: flagPayload
    });
  }

  static async removeForSlot(hostItem, slotIndex) {
    if (!hostItem || !ActivityTransferService.#hasActivitiesField(hostItem)) {
      return;
    }

    const flag = hostItem.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES);
    const slotData = flag?.[slotIndex];
    const ids = Array.isArray(slotData?.activityIds) ? slotData.activityIds : [];
    if (!ids.length) {
      return;
    }

    const updates = {};
    for (const id of ids) {
      updates[`system.activities.-=${id}`] = null;
    }
    await hostItem.update(updates);

    const clone = foundry.utils.duplicate(flag ?? {});
    if (slotData) {
      const next = foundry.utils.duplicate(slotData);
      delete next.activityIds;
      delete next.activityMeta;
      delete next.gemUuid;
      delete next.gemName;
      delete next.gemImg;

      if (Object.keys(next).length) {
        clone[slotIndex] = next;
      } else {
        delete clone[slotIndex];
      }
    }
    const flagUpdate = Object.keys(clone).length
      ? { [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`]: clone }
      : { [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`]: null };
    await hostItem.update(flagUpdate);
  }

  static #makeActivityId() {
    return foundry.utils.randomID();
  }

  static #hasActivitiesField(item) {
    return item?.system && Object.prototype.hasOwnProperty.call(item.system, "activities");
  }

  static async #updateFlag(item, slotIndex, data) {
    const flag = foundry.utils.duplicate(
      item.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES) ?? {}
    );
    flag[slotIndex] = data;
    await item.update({
      [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`]: flag
    });
  }
}
