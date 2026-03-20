import { Constants } from "../Constants.js";

export class ActivityTransferService {
  static UPDATE_OPTION_SKIP_RECONCILE = "skipActivityReconcile";

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

    const nextActivities = ActivityTransferService.#primeActivitySource(hostItem);
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
      createData.flags ??= {};
      createData.flags[Constants.MODULE_ID] ??= {};
      createData.flags[Constants.MODULE_ID][Constants.FLAG_SOURCE_GEM] = {
        uuid: gemItem.uuid,
        slot: slotIndex,
        sourceId: activity.id
      };

      const doc = new ActivityClass({ type, ...createData }, { parent: hostItem });
      if (doc._preCreate(createData) === false) {
        continue;
      }

      const payload = doc.toObject();
      const newId = doc.id;
      if (!newId || !ActivityTransferService.#isValidActivity(payload)) {
        continue;
      }
      nextActivities[newId] = payload;
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
    await hostItem.update({
      "system.activities": nextActivities,
      [flagPath]: flagPayload
    });
    ActivityTransferService.#primeActivitySource(hostItem);
  }

  static async removeForSlot(hostItem, slotIndex) {
    if (!hostItem || !ActivityTransferService.#hasActivitiesField(hostItem)) {
      return;
    }

    const flag = hostItem.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES);
    const slotData = flag?.[slotIndex];
    const ids = new Set(Array.isArray(slotData?.activityIds) ? slotData.activityIds : []);
    const meta = slotData?.activityMeta ?? {};

    const activitySource = hostItem.toObject().system?.activities ?? {};
    for (const [activityId, activity] of Object.entries(activitySource)) {
      const sourceGem = activity?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM];
      if (Number(sourceGem?.slot) === Number(slotIndex)) {
        ids.add(activityId);
      }
    }

    if (!ids.size) return;

    const nextActivities = ActivityTransferService.#primeActivitySource(hostItem);
    const collection = hostItem.system?.activities;
    let activitiesChanged = false;
    const updates = { [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.${slotIndex}`]: null };
    for (const id of ids) {
      const hasActivity = Object.prototype.hasOwnProperty.call(nextActivities, id);
      if (!hasActivity && !collection?.has?.(id)) {
        delete meta[id];
        continue;
      }

      if (hasActivity) {
        delete nextActivities[id];
        activitiesChanged = true;
      }
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

    if (activitiesChanged) {
      await ActivityTransferService.#replaceActivities(hostItem, nextActivities);
    }

    await hostItem.update(updates);
  }

  static async reconcileDerivedActivities(hostItem, _changes = {}, options = {}) {
    if (!hostItem || !ActivityTransferService.#hasActivitiesField(hostItem)) {
      return;
    }
    if (options?.[Constants.MODULE_ID]?.[ActivityTransferService.UPDATE_OPTION_SKIP_RECONCILE]) {
      return;
    }
    if (!ActivityTransferService.#shouldReconcile(_changes)) {
      return;
    }

    const source = hostItem.toObject();
    const moduleFlags = source.flags?.[Constants.MODULE_ID] ?? {};
    const storedSocketActivities = moduleFlags[Constants.FLAG_SOCKET_ACTIVITIES];
    const sockets = Array.isArray(moduleFlags[Constants.FLAGS.sockets]) ? moduleFlags[Constants.FLAGS.sockets] : [];
    const activities = ActivityTransferService.#getActivityMap(source);

    if (!Object.keys(activities).length && (!storedSocketActivities || typeof storedSocketActivities !== "object")) {
      return;
    }

    const rebuiltSocketActivities = ActivityTransferService.#buildSocketActivityFlag(
      activities,
      storedSocketActivities,
      sockets,
      hostItem.name
    );
    const flagsChanged = ActivityTransferService.#stableStringify(rebuiltSocketActivities)
      !== ActivityTransferService.#stableStringify(storedSocketActivities ?? {});

    if (!flagsChanged) {
      return;
    }

    await hostItem.update({
      [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`]: rebuiltSocketActivities
    }, {
      [Constants.MODULE_ID]: {
        ...(options?.[Constants.MODULE_ID] ?? {}),
        [ActivityTransferService.UPDATE_OPTION_SKIP_RECONCILE]: true
      }
    });
  }

  static #makeActivityId() {
    return foundry.utils.randomID();
  }

  static #getActivityMap(item) {
    const source = item?.toObject?.() ?? item ?? {};
    const activities = source.system?.activities;
    if (!activities || typeof activities !== "object" || Array.isArray(activities)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(foundry.utils.deepClone(activities))
        .filter(([, activity]) => ActivityTransferService.#isValidActivity(activity))
    );
  }

  static #primeActivitySource(item) {
    const activities = ActivityTransferService.#getActivityMap(item);
    if (item?.updateSource) {
      item.updateSource({ "system.activities": activities });
    }
    return activities;
  }

  static async #replaceActivities(item, activities) {
    const systemData = foundry.utils.deepClone(item?.toObject?.().system ?? {});
    systemData.activities = foundry.utils.deepClone(activities ?? {});
    await item.update({ system: systemData }, { diff: false, recursive: false });
    ActivityTransferService.#primeActivitySource(item);
  }

  static #isValidActivity(activity) {
    return Boolean(
      activity
      && typeof activity === "object"
      && typeof activity.type === "string"
      && activity.type.length
    );
  }

  static #hasActivitiesField(item) {
    return item?.system && Object.prototype.hasOwnProperty.call(item.system, "activities");
  }

  static #shouldReconcile(changes) {
    if (!changes || typeof changes !== "object") {
      return false;
    }

    const getProperty = foundry?.utils?.getProperty;
    if (typeof getProperty === "function") {
      if (getProperty(changes, "system.activities")) return true;
      if (getProperty(changes, `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`)) return true;
      if (getProperty(changes, `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`)) return true;
    }

    return Object.keys(changes).some((key) => (
      key === "system.activities"
      || key.startsWith("system.activities.")
      || key === `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`
      || key.startsWith(`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.`)
      || key === `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`
      || key.startsWith(`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}.`)
    ));
  }

  static #buildSocketActivityFlag(activities, existingFlag, sockets, fallbackName) {
    const rebuilt = {};

    for (const [activityId, activity] of Object.entries(activities ?? {})) {
      const sourceGem = activity?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM];
      const slotIndex = Number(sourceGem?.slot);
      if (!Number.isInteger(slotIndex) || slotIndex < 0) continue;

      const slotKey = String(slotIndex);
      const previous = existingFlag?.[slotKey] ?? {};
      const previousMeta = previous.activityMeta?.[activityId] ?? {};
      const slot = Array.isArray(sockets) ? sockets[slotIndex] : sockets?.[slotKey];

      rebuilt[slotKey] ??= {
        gemUuid: previous.gemUuid ?? sourceGem?.uuid ?? slot?.gem?.uuid ?? null,
        gemName: previous.gemName ?? slot?.gem?.name ?? slot?.name ?? fallbackName,
        gemImg: previous.gemImg ?? slot?.gem?.img ?? slot?.img ?? Constants.SOCKET_SLOT_IMG,
        activityIds: [],
        activityMeta: {}
      };

      rebuilt[slotKey].activityIds.push(activityId);
      rebuilt[slotKey].activityMeta[activityId] = {
        sourceId: previousMeta.sourceId ?? sourceGem?.sourceId ?? null,
        hostActivityId: activityId,
        slot: slotIndex,
        gemImg: previousMeta.gemImg ?? rebuilt[slotKey].gemImg,
        gemName: previousMeta.gemName ?? rebuilt[slotKey].gemName,
        gemUuid: previousMeta.gemUuid ?? rebuilt[slotKey].gemUuid,
        activityName: previousMeta.activityName ?? activity?.name ?? null
      };
    }

    for (const [slotKey, payload] of Object.entries(existingFlag ?? {})) {
      const slotIndex = Number(slotKey);
      if (!Number.isInteger(slotIndex) || slotIndex < 0) continue;

      for (const activityId of Array.isArray(payload?.activityIds) ? payload.activityIds : []) {
        if (!activities?.[activityId]) continue;
        if (rebuilt[slotKey]?.activityMeta?.[activityId]) continue;

        const previousMeta = payload?.activityMeta?.[activityId] ?? {};
        const slot = Array.isArray(sockets) ? sockets[slotIndex] : sockets?.[slotKey];
        rebuilt[slotKey] ??= {
          gemUuid: payload?.gemUuid ?? slot?.gem?.uuid ?? null,
          gemName: payload?.gemName ?? slot?.gem?.name ?? slot?.name ?? fallbackName,
          gemImg: payload?.gemImg ?? slot?.gem?.img ?? slot?.img ?? Constants.SOCKET_SLOT_IMG,
          activityIds: [],
          activityMeta: {}
        };

        rebuilt[slotKey].activityIds.push(activityId);
        rebuilt[slotKey].activityMeta[activityId] = {
          sourceId: previousMeta.sourceId ?? null,
          hostActivityId: activityId,
          slot: slotIndex,
          gemImg: previousMeta.gemImg ?? rebuilt[slotKey].gemImg,
          gemName: previousMeta.gemName ?? rebuilt[slotKey].gemName,
          gemUuid: previousMeta.gemUuid ?? rebuilt[slotKey].gemUuid,
          activityName: previousMeta.activityName ?? activities[activityId]?.name ?? null
        };
      }
    }

    for (const payload of Object.values(rebuilt)) {
      payload.activityIds.sort((left, right) => String(left).localeCompare(String(right)));
    }

    return rebuilt;
  }

  static #stableStringify(value) {
    try {
      return JSON.stringify(ActivityTransferService.#sortValue(value ?? {}));
    } catch {
      return "";
    }
  }

  static #sortValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => ActivityTransferService.#sortValue(entry));
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, ActivityTransferService.#sortValue(entry)])
    );
  }
}
