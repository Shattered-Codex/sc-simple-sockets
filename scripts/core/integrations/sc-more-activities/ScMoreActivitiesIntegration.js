import { Constants } from "../../Constants.js";
import { SocketAPI } from "../../api/SocketAPI.js";
import { getSlotConfig, normalizeSlotConfig } from "../../helpers/socketSlotConfig.js";
import { ModuleSettings } from "../../settings/ModuleSettings.js";
import { SocketService } from "../../services/SocketService.js";
import { SocketSlotConfigService } from "../../services/SocketSlotConfigService.js";
import { ScMoreActivitiesSocketExtractionActivity } from "./activities/socket-extraction/ScMoreActivitiesSocketExtractionActivity.js";
import { ScMoreActivitiesSocketExtractionActivityData } from "./activities/socket-extraction/ScMoreActivitiesSocketExtractionActivityData.js";
import { ScMoreActivitiesSocketExtractionActivitySheet } from "./activities/socket-extraction/ScMoreActivitiesSocketExtractionActivitySheet.js";
import { ScMoreActivitiesSocketSlotActivity } from "./activities/socket-slot/ScMoreActivitiesSocketSlotActivity.js";
import { ScMoreActivitiesSocketSlotActivityData } from "./activities/socket-slot/ScMoreActivitiesSocketSlotActivityData.js";
import { ScMoreActivitiesSocketSlotActivitySheet } from "./activities/socket-slot/ScMoreActivitiesSocketSlotActivitySheet.js";
import {
  SC_MORE_ACTIVITIES_ACTIVITY_TYPES,
  SC_MORE_ACTIVITIES_GROUP,
  SC_MORE_ACTIVITIES_ICONS,
  SC_MORE_ACTIVITIES_MODULE_ID,
  SC_MORE_ACTIVITIES_QUERY_ID,
  SC_MORE_ACTIVITIES_QUERY_TIMEOUT,
  SC_MORE_ACTIVITIES_REGISTER_HOOK
} from "./ScMoreActivitiesConstants.js";

export class ScMoreActivitiesIntegration {
  static register() {
    Hooks.on(SC_MORE_ACTIVITIES_REGISTER_HOOK, (activitiesApi) => {
      if (!ScMoreActivitiesIntegration.#isDnd5eSystem()) {
        return;
      }

      ScMoreActivitiesIntegration.#registerActivities(activitiesApi);
    });

    Hooks.once("init", () => {
      if (!ScMoreActivitiesIntegration.#isDnd5eSystem()) {
        return;
      }

      ScMoreActivitiesIntegration.registerQueries();
    });
  }

  static registerQueries() {
    if (!globalThis.CONFIG?.queries) {
      return false;
    }

    CONFIG.queries[SC_MORE_ACTIVITIES_QUERY_ID] = ScMoreActivitiesIntegration.handleQuery;
    return true;
  }

  static handleQuery = async (payload = {}) => {
    if (!game?.user?.isGM) {
      return ScMoreActivitiesIntegration.#failure(
        "gm-required",
        "SCSockets.Integrations.ScMoreActivities.Warnings.NoActiveGm",
        "An active GM is required for socket activities."
      );
    }

    return ScMoreActivitiesIntegration.#executeRequest(payload, {
      bypassPermission: true,
      requestUser: game.user
    });
  };

  static isTypeEnabled(type) {
    const isEnabled = game?.modules?.get?.(SC_MORE_ACTIVITIES_MODULE_ID)?.api?.activities?.isTypeEnabled;
    if (typeof isEnabled !== "function") {
      return true;
    }

    return isEnabled(type) !== false;
  }

  static isTypeAvailableForItem(type, item) {
    return ScMoreActivitiesIntegration.isTypeEnabled(type)
      && ModuleSettings.isItemSocketableByType(item);
  }

  static canUseType(type, labelKey = type) {
    if (ScMoreActivitiesIntegration.isTypeEnabled(type)) {
      return true;
    }

    ui.notifications?.warn?.(
      ScMoreActivitiesIntegration.#format(
        "SCSockets.Integrations.ScMoreActivities.Warnings.ActivityDisabled",
        { activity: Constants.localize(labelKey, type) },
        `${Constants.localize(labelKey, type)} is currently disabled by the GM.`
      )
    );
    return false;
  }

  static getHostItem(activity) {
    return activity?.item ?? null;
  }

  static async listSlots(activity, { state = "all" } = {}) {
    return ScMoreActivitiesIntegration.listItemSlots(
      ScMoreActivitiesIntegration.getHostItem(activity),
      { state }
    );
  }

  static async listItemSlots(item, { state = "all" } = {}) {
    if (!item?.uuid) {
      return [];
    }

    const slots = await SocketAPI.getItemSlots(item.uuid, { includeSnapshots: true });
    return (Array.isArray(slots) ? slots : [])
      .filter((entry) => {
        if (state === "empty") {
          return entry?.hasGem !== true;
        }
        if (state === "filled") {
          return entry?.hasGem === true;
        }
        return true;
      })
      .map((entry) => ScMoreActivitiesIntegration.#toSlotSummary(entry))
      .sort((left, right) => left.slotIndex - right.slotIndex);
  }

  static toSlotSummary(entry = {}) {
    return ScMoreActivitiesIntegration.#toSlotSummary(entry);
  }

  static async addConfiguredSlot(activity, slotConfig = {}) {
    const normalizedConfig = normalizeSlotConfig(slotConfig);
    const validation = SocketSlotConfigService.validateCondition(normalizedConfig.condition);
    if (!validation.valid) {
      return ScMoreActivitiesIntegration.#failure(
        "invalid-condition",
        "SCSockets.SocketSlotConfig.Validation.InvalidCondition",
        "The slot condition has invalid code."
      );
    }

    return ScMoreActivitiesIntegration.#dispatchRequest(
      ScMoreActivitiesIntegration.#buildRequest("add-slot", activity, { slotConfig: normalizedConfig }),
      {
        hostItem: ScMoreActivitiesIntegration.getHostItem(activity),
        type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_SLOT
      }
    );
  }

  static async removeEmptySlot(activity, slotIndex) {
    return ScMoreActivitiesIntegration.#dispatchRequest(
      ScMoreActivitiesIntegration.#buildRequest("remove-slot", activity, {
        slotIndex: Number(slotIndex)
      }),
      {
        hostItem: ScMoreActivitiesIntegration.getHostItem(activity),
        type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_SLOT
      }
    );
  }

  static async extractGem(activity, slotIndex, { item = null, mode = "keep" } = {}) {
    return ScMoreActivitiesIntegration.#dispatchRequest(
      ScMoreActivitiesIntegration.#buildRequest("extract-gem", activity, {
        itemUuid: item?.uuid ?? null,
        mode: mode === "delete" ? "delete" : "keep",
        slotIndex: Number(slotIndex)
      }),
      {
        hostItem: item ?? ScMoreActivitiesIntegration.getHostItem(activity),
        type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_EXTRACTION
      }
    );
  }

  static #registerActivities(activitiesApi) {
    const registrations = [
      ScMoreActivitiesIntegration.#registerSocketSlotActivity(activitiesApi),
      ScMoreActivitiesIntegration.#registerSocketExtractionActivity(activitiesApi)
    ];

    for (const result of registrations) {
      if (!result?.ok) {
        console.warn(`[${Constants.MODULE_ID}] sc-more-activities registration failed`, result);
      }
    }
  }

  static #registerSocketSlotActivity(activitiesApi) {
    return activitiesApi.registerType({
      moduleId: Constants.MODULE_ID,
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_SLOT,
      label: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Hint",
      icon: SC_MORE_ACTIVITIES_ICONS.SOCKET_SLOT,
      documentClass: ScMoreActivitiesSocketSlotActivity,
      dataModel: ScMoreActivitiesSocketSlotActivityData,
      sheetClass: ScMoreActivitiesSocketSlotActivitySheet,
      configurable: true,
      category: "sockets",
      ui: {
        scope: "external",
        group: "sockets",
        groupId: SC_MORE_ACTIVITIES_GROUP.id,
        groupLabel: SC_MORE_ACTIVITIES_GROUP.label,
        groupIcon: SC_MORE_ACTIVITIES_GROUP.icon,
        groupOrder: SC_MORE_ACTIVITIES_GROUP.order,
        order: 140
      },
      tags: ["sockets", "slot", "inventory"],
      compatibility: {
        dnd5e: "5.x",
        scMoreActivities: {
          moduleId: SC_MORE_ACTIVITIES_MODULE_ID,
          required: true
        },
        scSimpleSockets: {
          moduleId: Constants.MODULE_ID,
          required: true
        }
      },
      templates: [`modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-slot-effect.hbs`],
      ownership: {
        execute: "item-owner",
        hostItem: "activity-item",
        mutation: "gm-mediated"
      },
      source: Constants.MODULE_ID
    });
  }

  static #registerSocketExtractionActivity(activitiesApi) {
    return activitiesApi.registerType({
      moduleId: Constants.MODULE_ID,
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_EXTRACTION,
      label: "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Hint",
      icon: SC_MORE_ACTIVITIES_ICONS.SOCKET_EXTRACTION,
      documentClass: ScMoreActivitiesSocketExtractionActivity,
      dataModel: ScMoreActivitiesSocketExtractionActivityData,
      sheetClass: ScMoreActivitiesSocketExtractionActivitySheet,
      configurable: true,
      category: "sockets",
      ui: {
        scope: "external",
        group: "sockets",
        groupId: SC_MORE_ACTIVITIES_GROUP.id,
        groupLabel: SC_MORE_ACTIVITIES_GROUP.label,
        groupIcon: SC_MORE_ACTIVITIES_GROUP.icon,
        groupOrder: SC_MORE_ACTIVITIES_GROUP.order,
        order: 150
      },
      tags: ["sockets", "gem", "inventory"],
      compatibility: {
        dnd5e: "5.x",
        scMoreActivities: {
          moduleId: SC_MORE_ACTIVITIES_MODULE_ID,
          required: true
        },
        scSimpleSockets: {
          moduleId: Constants.MODULE_ID,
          required: true
        }
      },
      templates: [`modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-extraction-effect.hbs`],
      ownership: {
        execute: "item-owner",
        hostItem: "activity-item",
        mutation: "gm-mediated"
      },
      source: Constants.MODULE_ID
    });
  }

  static #buildRequest(operation, activity, data = {}) {
    const payload = data && typeof data === "object" ? { ...data } : {};
    const itemUuid = payload.itemUuid ?? ScMoreActivitiesIntegration.getHostItem(activity)?.uuid ?? null;
    delete payload.itemUuid;
    return {
      ...payload,
      activityUuid: activity?.uuid ?? null,
      itemUuid,
      operation,
      requestUserId: game?.user?.id ?? null
    };
  }

  static async #dispatchRequest(request, { hostItem = null, type = null } = {}) {
    if (type && !ScMoreActivitiesIntegration.isTypeEnabled(type)) {
      return ScMoreActivitiesIntegration.#failure(
        "activity-disabled",
        "SCSockets.Integrations.ScMoreActivities.Warnings.ActivityDisabled",
        "This socket activity is currently disabled by the GM.",
        { activity: type }
      );
    }

    if (game?.user?.isGM || await ScMoreActivitiesIntegration.#canEditSockets(hostItem)) {
      return ScMoreActivitiesIntegration.#executeRequest(request, {
        bypassPermission: game?.user?.isGM === true,
        requestUser: game?.user ?? null
      });
    }

    const gm = ScMoreActivitiesIntegration.#activeGmUser();
    if (!gm || typeof gm.query !== "function" || !globalThis.CONFIG?.queries?.[SC_MORE_ACTIVITIES_QUERY_ID]) {
      return ScMoreActivitiesIntegration.#failure(
        "no-active-gm",
        "SCSockets.Integrations.ScMoreActivities.Warnings.NoActiveGm",
        "An active GM is required for socket activities."
      );
    }

    try {
      return await gm.query(SC_MORE_ACTIVITIES_QUERY_ID, request, {
        timeout: SC_MORE_ACTIVITIES_QUERY_TIMEOUT
      });
    } catch (error) {
      return ScMoreActivitiesIntegration.#failure(
        "gm-request-failed",
        "SCSockets.Integrations.ScMoreActivities.Warnings.RequestFailed",
        `Could not request a GM-mediated socket operation: ${error?.message ?? String(error)}`,
        { error: error?.message ?? String(error) }
      );
    }
  }

  static async #executeRequest(payload = {}, { bypassPermission = false, requestUser = null } = {}) {
    const activity = payload.activityUuid ? await ScMoreActivitiesIntegration.#fromUuid(payload.activityUuid) : null;
    const hostItem = payload.itemUuid ? await ScMoreActivitiesIntegration.#resolveItem(payload.itemUuid) : null;
    const effectiveItem = hostItem ?? ScMoreActivitiesIntegration.getHostItem(activity);
    const user = requestUser ?? game?.users?.get?.(payload.requestUserId) ?? game?.user ?? null;

    if (!effectiveItem) {
      return ScMoreActivitiesIntegration.#failure(
        "invalid-request",
        "SCSockets.Integrations.ScMoreActivities.Warnings.InvalidRequest",
        "The socket activity request is no longer valid."
      );
    }

    if (payload.requestUserId && !ScMoreActivitiesIntegration.#canUseActivity(activity, user, effectiveItem)) {
      return ScMoreActivitiesIntegration.#failure(
        "activity-permission",
        "SCSockets.Integrations.ScMoreActivities.Warnings.ActivityPermission",
        "You do not have permission to use this activity."
      );
    }

    if (payload.operation === "add-slot") {
      return ScMoreActivitiesIntegration.#executeAddSlot(effectiveItem, payload, { bypassPermission });
    }
    if (payload.operation === "remove-slot") {
      return ScMoreActivitiesIntegration.#executeRemoveSlot(effectiveItem, payload, { bypassPermission });
    }
    if (payload.operation === "extract-gem") {
      return ScMoreActivitiesIntegration.#executeExtractGem(effectiveItem, payload, { bypassPermission });
    }

    return ScMoreActivitiesIntegration.#failure(
      "invalid-request",
      "SCSockets.Integrations.ScMoreActivities.Warnings.InvalidRequest",
      "The socket activity request is no longer valid."
    );
  }

  static async #executeAddSlot(item, payload, { bypassPermission = false } = {}) {
    const slotConfig = normalizeSlotConfig(payload.slotConfig);
    const result = await SocketAPI.addSlot(item.uuid, {
      bypassPermission,
      notify: false,
      render: false,
      slotConfig
    });

    return ScMoreActivitiesIntegration.#normalizeMutationResult(result, {
      failureFallback: "Could not add a socket to this item.",
      failureKey: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.AddFailed",
      successFallback: `Added a socket to ${item.name ?? "the item"}.`,
      successKey: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Info.Added",
      templateData: { item: item.name ?? "" }
    });
  }

  static async #executeRemoveSlot(item, payload, { bypassPermission = false } = {}) {
    const slotIndex = Number(payload.slotIndex);
    const slots = await SocketAPI.getItemSlots(item.uuid, { includeSnapshots: true });
    const slot = (Array.isArray(slots) ? slots : []).find((entry) => entry?.slotIndex === slotIndex);

    if (!slot) {
      return ScMoreActivitiesIntegration.#failure(
        "invalid-slot-index",
        "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.InvalidSlot",
        "Choose a valid empty slot."
      );
    }

    if (slot.hasGem === true) {
      return ScMoreActivitiesIntegration.#failure(
        "slot-not-empty",
        "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.SlotNotEmpty",
        "Only empty slots can be removed with this activity."
      );
    }

    const result = await SocketAPI.removeSlot(item.uuid, slotIndex, {
      bypassPermission,
      notify: false,
      render: false
    });

    return ScMoreActivitiesIntegration.#normalizeMutationResult(result, {
      failureFallback: "Could not remove the selected empty slot.",
      failureKey: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.RemoveFailed",
      successFallback: `Removed an empty slot from ${item.name ?? "the item"}.`,
      successKey: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Info.Removed",
      templateData: { item: item.name ?? "" }
    });
  }

  static async #executeExtractGem(item, payload, { bypassPermission = false } = {}) {
    const slotIndex = Number(payload.slotIndex);
    const mode = payload.mode === "delete" ? "delete" : "keep";
    const slots = await SocketAPI.getItemSlots(item.uuid, { includeSnapshots: true });
    const slot = (Array.isArray(slots) ? slots : []).find((entry) => entry?.slotIndex === slotIndex);

    if (!slot) {
      return ScMoreActivitiesIntegration.#failure(
        "invalid-slot-index",
        "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Warnings.InvalidSlot",
        "Choose a valid socketed gem."
      );
    }

    if (slot.hasGem !== true) {
      return ScMoreActivitiesIntegration.#failure(
        "empty-slot",
        "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Warnings.EmptySlot",
        "The selected slot does not contain a gem."
      );
    }

    const result = await SocketAPI.removeGem(item.uuid, slotIndex, {
      bypassPermission,
      mode: mode === "delete" ? SocketService.REMOVE_GEM_MODE_DELETE : SocketService.REMOVE_GEM_MODE_KEEP,
      notify: false,
      render: false
    });

    return ScMoreActivitiesIntegration.#normalizeMutationResult(result, {
      failureFallback: "Could not extract the selected gem.",
      failureKey: "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Warnings.ExtractionFailed",
      successFallback: mode === "delete"
        ? `Removed and destroyed a socketed gem from ${item.name ?? "the item"}.`
        : `Extracted a socketed gem from ${item.name ?? "the item"}.`,
      successKey: mode === "delete"
        ? "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Info.Deleted"
        : "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Info.Extracted",
      templateData: { item: item.name ?? "" }
    });
  }

  static #normalizeMutationResult(result, {
    failureFallback,
    failureKey,
    successFallback,
    successKey,
    templateData = {}
  }) {
    if (result?.success === true || result?.ok === true) {
      return Object.freeze({
        ok: true,
        changed: result?.changed !== false,
        message: ScMoreActivitiesIntegration.#format(successKey, templateData, successFallback),
        reason: result?.reason ?? "success",
        result
      });
    }

    return ScMoreActivitiesIntegration.#failure(
      result?.reason ?? "operation-failed",
      failureKey,
      result?.message ?? failureFallback,
      templateData,
      { result }
    );
  }

  static #toSlotSummary(entry = {}) {
    const slot = entry?.slot ?? {};
    const slotConfig = getSlotConfig(slot);
    const gem = slot?.gem ?? {};
    const slotNumber = Number(entry?.slotIndex ?? 0) + 1;
    const tintColor = slotConfig.color ?? "";
    const slotName = slot?.name ?? slotConfig.name ?? gem?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty");
    const gemName = gem?.name ?? slot?._gemData?.name ?? "";
    const slotSummary = gemName && gemName !== slotName ? gemName : "";
    const slotAriaLabel = slotSummary ? `${slotName}: ${slotSummary}` : slotName;

    return {
      color: slotConfig.color,
      colorStyle: slotConfig.color ? `background:${slotConfig.color};` : "",
      description: ScMoreActivitiesIntegration.#toPlainText(slotConfig.description),
      gemImg: gem?.img ?? slot?._gemData?.img ?? "",
      gemName,
      hasGem: entry?.hasGem === true,
      hasSlotTint: Boolean(tintColor),
      name: slotName,
      slotIndex: Number(entry?.slotIndex ?? 0),
      slotAriaLabel,
      slotFrameImg: Constants.SOCKET_SLOT_IMG,
      slotLabel: ScMoreActivitiesIntegration.#format(
        "SCSockets.Integrations.ScMoreActivities.Common.SlotLabel",
        { slot: slotNumber },
        `Slot ${slotNumber}`
      ),
      slotMaskStyle: tintColor ? `--sc-sockets-slot-color:${tintColor};` : "",
      slotName,
      slotSummary
    };
  }

  static #toPlainText(value) {
    return String(value ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static async #canEditSockets(item) {
    if (!item?.uuid) {
      return false;
    }

    try {
      return await SocketAPI.canEditSockets(item.uuid, {
        userId: game?.user?.id ?? null
      });
    } catch {
      return false;
    }
  }

  static #activeGmUser() {
    return game?.users?.find?.((user) => user.active && user.isGM) ?? null;
  }

  static #canUseActivity(activity, user, targetItem = null) {
    const activityItem = ScMoreActivitiesIntegration.getHostItem(activity);
    const item = targetItem ?? activityItem;
    const actor = item?.actor ?? activity?.actor ?? activityItem?.actor ?? null;

    return Boolean(
      user?.isGM
      || item?.testUserPermission?.(user, "OWNER")
      || actor?.testUserPermission?.(user, "OWNER")
    );
  }

  static async #fromUuid(uuid) {
    if (!uuid || typeof globalThis.fromUuid !== "function") {
      return null;
    }

    try {
      return await globalThis.fromUuid(uuid);
    } catch {
      return null;
    }
  }

  static async #resolveItem(uuid) {
    const document = await ScMoreActivitiesIntegration.#fromUuid(uuid);
    return document?.documentName === "Item" ? document : null;
  }

  static #failure(reason, key, fallback, data = {}, extra = {}) {
    return Object.freeze({
      ok: false,
      changed: false,
      reason,
      message: key ? ScMoreActivitiesIntegration.#format(key, data, fallback) : fallback,
      ...extra
    });
  }

  static #format(key, data = {}, fallback = key) {
    const i18n = game?.i18n;
    const hasTranslation = typeof i18n?.has === "function" ? i18n.has(key, { strict: true }) : false;
    if (hasTranslation && typeof i18n?.format === "function") {
      return i18n.format(key, data);
    }

    return fallback;
  }

  static #isDnd5eSystem() {
    return game?.system?.id === "dnd5e";
  }
}
