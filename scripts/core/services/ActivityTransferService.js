import { Constants } from "../Constants.js";
import { HostItemUpdateService } from "../support/HostItemUpdateService.js";
import { ItemSheetSync } from "../support/ItemSheetSync.js";

export class ActivityTransferService {
  static UPDATE_OPTION_SKIP_RECONCILE = "skipActivityReconcile";
  static UPDATE_OPTION_SKIP_REMOVE_EXISTING = "skipRemoveExisting";
  static UPDATE_OPTION_EXTRA_UPDATE_DATA = "extraUpdateData";
  static UPDATE_OPTION_EFFECT_ID_MAP = "effectIdMap";

  static async applyFromGem(hostItem, slotIndex, gemItem, options = {}) {
    hostItem = ItemSheetSync.resolve(hostItem);
    if (!hostItem || !gemItem) return;
    if (!ActivityTransferService.#hasActivitiesField(hostItem)) {
      return;
    }

    const { extraUpdateData, updateOptions, effectIdMap } = ActivityTransferService.#splitUpdateOptions(options);

    if (!options?.[Constants.MODULE_ID]?.[ActivityTransferService.UPDATE_OPTION_SKIP_REMOVE_EXISTING]) {
      await ActivityTransferService.removeForSlot(hostItem, slotIndex, options);
    }

    const sourceActivities = gemItem.system?.activities?.contents ?? [];
    if (!sourceActivities.length) {
      if (Object.keys(extraUpdateData).length) {
        await ActivityTransferService.#updateHostItem(hostItem, extraUpdateData, updateOptions, {
          reason: "extraUpdateData-only"
        });
      }
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
      if (typeof ActivityClass?.availableForItem === "function"
        && ActivityClass.availableForItem(hostItem) === false) {
        if (Constants.isDebugEnabled()) {
          console.warn(
            `[${Constants.MODULE_ID}] skipping incompatible activity type "${type}" for host item type "${hostItem?.type ?? "unknown"}"`
          );
        }
        continue;
      }

      const createData = foundry.utils.deepClone(original);
      delete createData._id;
      ActivityTransferService.#remapActivityEffectReferences(createData, effectIdMap);
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
      ActivityTransferService.#sanitizeTransferredActivityPayload(payload, hostItem);

      const createdActivity = await ActivityTransferService.#createTransferredActivity(
        hostItem,
        type,
        payload,
        activity.id
      );
      hostItem = ItemSheetSync.resolve(hostItem);

      const newId = createdActivity?.id ?? createdActivity?._id ?? null;
      if (!newId) {
        continue;
      }
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
      if (Object.keys(extraUpdateData).length) {
        await ActivityTransferService.#updateHostItem(hostItem, extraUpdateData, updateOptions, {
          reason: "applyFromGem-no-created-activities"
        });
      }
      return;
    }

    const flagPayload = {
      gemUuid: gemItem.uuid,
      gemName: gemItem.name,
      gemImg: gemItem.img,
      activityIds: createdIds,
      activityMeta
    };

    const updateData = {
      ...extraUpdateData
    };
    const flagPath = `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.${slotIndex}`;
    updateData[flagPath] = flagPayload;
    await ActivityTransferService.#updateHostItem(hostItem, updateData, updateOptions, {
      reason: "applyFromGem"
    });
  }

  static async removeForSlot(hostItem, slotIndex, options = {}) {
    hostItem = ItemSheetSync.resolve(hostItem);
    if (!hostItem || !ActivityTransferService.#hasActivitiesField(hostItem)) {
      return;
    }

    const { extraUpdateData, updateOptions } = ActivityTransferService.#splitUpdateOptions(options);
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

    if (!ids.size) {
      if (Object.keys(extraUpdateData).length) {
        await ActivityTransferService.#updateHostItem(hostItem, extraUpdateData, updateOptions, {
          reason: "removeForSlot-extraUpdateData-only"
        });
      }
      return;
    }

    const collection = hostItem.system?.activities;
    const updateData = {
      [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}.${slotIndex}`]: null
    };

    const idsToDelete = [];
    for (const id of ids) {
      const hasActivity = Object.prototype.hasOwnProperty.call(activitySource, id);
      if (!hasActivity && !collection?.has?.(id)) {
        continue;
      }
      idsToDelete.push(id);
      const source = meta[id]?.sourceId;
      if (source) {
        const activity = collection?.get?.(id);
        if (activity && !activity.cachedSpell) {
          const cached = activity.toObject();
          if (cached.spell?.uuid && foundry.utils.getType(cached.spell.uuid) === "string") {
            updateData[`flags.${Constants.MODULE_ID}.cachedSpells`] ??= {};
            updateData[`flags.${Constants.MODULE_ID}.cachedSpells`][cached.spell.uuid] = true;
          }
        }
      }
    }

    for (const id of idsToDelete) {
      hostItem = ItemSheetSync.resolve(hostItem);
      if (typeof hostItem?.deleteActivity === "function" && hostItem.system?.activities?.has?.(id)) {
        await hostItem.deleteActivity(id);
      }
    }

    await ActivityTransferService.#updateHostItem(hostItem, {
      ...updateData,
      ...extraUpdateData
    }, updateOptions, {
      reason: "removeForSlot"
    });
  }

  static async reconcileDerivedActivities(hostItem, _changes = {}, options = {}) {
    hostItem = ItemSheetSync.resolve(hostItem);
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

    const reconcileOpts = {
      [Constants.MODULE_ID]: {
        ...(options?.[Constants.MODULE_ID] ?? {}),
        [ActivityTransferService.UPDATE_OPTION_SKIP_RECONCILE]: true
      }
    };
    if (options?.render === false) reconcileOpts.render = false;
    await ActivityTransferService.#updateHostItem(hostItem, {
      [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`]: rebuiltSocketActivities
    }, reconcileOpts, {
      reason: "reconcileDerivedActivities"
    });
  }

  static #getActivityMap(item) {
    const source = item?.toObject?.() ?? item ?? {};
    const activities = source.system?.activities;
    if (!activities || typeof activities !== "object" || Array.isArray(activities)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(activities)
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

      const prevGemImg1 = previous.gemImg !== Constants.SOCKET_SLOT_IMG ? previous.gemImg : null;
      rebuilt[slotKey] ??= {
        gemUuid: previous.gemUuid ?? sourceGem?.uuid ?? slot?.gem?.uuid ?? null,
        gemName: previous.gemName ?? slot?.gem?.name ?? slot?.name ?? fallbackName,
        gemImg: prevGemImg1 ?? slot?.gem?.img ?? Constants.SOCKET_SLOT_IMG,
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
        const prevGemImg2 = payload?.gemImg !== Constants.SOCKET_SLOT_IMG ? payload?.gemImg : null;
        rebuilt[slotKey] ??= {
          gemUuid: payload?.gemUuid ?? slot?.gem?.uuid ?? null,
          gemName: payload?.gemName ?? slot?.gem?.name ?? slot?.name ?? fallbackName,
          gemImg: prevGemImg2 ?? slot?.gem?.img ?? Constants.SOCKET_SLOT_IMG,
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

  static #splitUpdateOptions(options = {}) {
    const moduleOptions = options?.[Constants.MODULE_ID];
    const extraUpdateData = (moduleOptions && typeof moduleOptions === "object")
      ? foundry.utils.deepClone(moduleOptions[ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA] ?? {})
      : {};
    const effectIdMap = ActivityTransferService.#normalizeEffectIdMap(
      moduleOptions?.[ActivityTransferService.UPDATE_OPTION_EFFECT_ID_MAP]
    );

    const updateOptions = { ...options };
    if (moduleOptions && typeof moduleOptions === "object") {
      const nextModuleOptions = { ...moduleOptions };
      delete nextModuleOptions[ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA];
      delete nextModuleOptions[ActivityTransferService.UPDATE_OPTION_SKIP_REMOVE_EXISTING];
      delete nextModuleOptions[ActivityTransferService.UPDATE_OPTION_EFFECT_ID_MAP];
      if (Object.keys(nextModuleOptions).length) {
        updateOptions[Constants.MODULE_ID] = nextModuleOptions;
      } else {
        delete updateOptions[Constants.MODULE_ID];
      }
    }

    return { extraUpdateData, updateOptions, effectIdMap };
  }

  static #normalizeEffectIdMap(value) {
    if (value instanceof Map) {
      return value;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return new Map();
    }
    return new Map(
      Object.entries(value)
        .map(([sourceId, createdId]) => [String(sourceId), String(createdId)])
        .filter(([sourceId, createdId]) => sourceId && createdId)
    );
  }

  static #remapActivityEffectReferences(activityData, effectIdMap) {
    if (!effectIdMap?.size || !Array.isArray(activityData?.effects)) {
      return;
    }
    activityData.effects = activityData.effects.map((effectRef) => {
      if (!effectRef || typeof effectRef !== "object") {
        return effectRef;
      }
      const sourceId = String(effectRef._id ?? "").trim();
      const createdId = effectIdMap.get(sourceId);
      if (!createdId) {
        return effectRef;
      }
      return {
        ...foundry.utils.deepClone(effectRef),
        _id: createdId
      };
    });
  }

  static #sanitizeTransferredActivityPayload(payload, hostItem) {
    if (!payload || typeof payload !== "object") {
      return payload;
    }

    // Sidebar/world items reject nested Item document payloads inside activity data.
    // Actor-owned items tolerate this better because their parent can embed Items,
    // but transferred activities should still resolve their owning item from parent.
    delete payload.item;
    delete payload.parent;

    if (!hostItem?.actor && payload.consumption && typeof payload.consumption === "object") {
      const targets = Array.isArray(payload.consumption.targets) ? payload.consumption.targets : [];
      payload.consumption.targets = targets.map((target) => {
        if (!target || typeof target !== "object") {
          return target;
        }

        const nextTarget = foundry.utils.deepClone(target);
        if (nextTarget.type === "itemUses") {
          delete nextTarget.target;
        }
        return nextTarget;
      });
    }

    return payload;
  }

  static async #createTransferredActivity(hostItem, type, payload, sourceId) {
    const currentHost = ItemSheetSync.resolve(hostItem);
    if (!currentHost || typeof currentHost.createActivity !== "function") {
      return null;
    }

    const beforeIds = new Set(
      Array.from(currentHost.system?.activities ?? []).map((activity) => activity.id)
    );

    await currentHost.createActivity(type, payload, { renderSheet: false });

    const refreshedHost = ItemSheetSync.resolve(currentHost);
    const created = Array.from(refreshedHost?.system?.activities ?? []).find((activity) => {
      if (!activity?.id || beforeIds.has(activity.id)) {
        return false;
      }
      const sourceGem = activity.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM];
      return sourceGem?.sourceId === sourceId;
    });

    return created ?? null;
  }

  static async #updateHostItem(hostItem, updateData, updateOptions, context = {}) {
    try {
      return await HostItemUpdateService.update(hostItem, updateData, updateOptions);
    } catch (error) {
      if (Constants.isDebugEnabled()) {
        const flattenObject = foundry?.utils?.flattenObject;
        const flattened = typeof flattenObject === "function" ? flattenObject(updateData) : {};
        const activityPaths = Object.keys(flattened).filter((key) => key.startsWith("system.activities."));
        const resolved = HostItemUpdateService.resolve(hostItem);
        console.error(`[${Constants.MODULE_ID}] host item update failed`, {
          error,
          reason: context.reason ?? "unknown",
          hostItemUuid: hostItem?.uuid ?? null,
          hostItemId: hostItem?.id ?? null,
          hostItemName: hostItem?.name ?? null,
          hostItemParentDocumentName: hostItem?.parent?.documentName ?? null,
          hostItemParentUuid: hostItem?.parent?.uuid ?? null,
          resolvedWorldItemMatches: Boolean(hostItem?.id && game?.items?.get?.(hostItem.id) === hostItem),
          resolvedHostItemUuid: resolved?.uuid ?? null,
          resolvedHostItemParentDocumentName: resolved?.parent?.documentName ?? null,
          resolvedHostItemParentUuid: resolved?.parent?.uuid ?? null,
          updateKeys: Object.keys(updateData ?? {}),
          activityPaths,
          activityPathSamples: activityPaths.slice(0, 10).map((path) => ({
            path,
            keys: updateData[path] && typeof updateData[path] === "object" ? Object.keys(updateData[path]) : null
          }))
        });
      }
      throw error;
    }
  }
}
