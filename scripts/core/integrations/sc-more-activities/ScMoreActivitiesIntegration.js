import { Constants } from "../../Constants.js";
import { SocketAPI } from "../../api/SocketAPI.js";
import { SocketStore } from "../../SocketStore.js";
import { getSlotConfig, normalizeSlotConfig } from "../../helpers/socketSlotConfig.js";
import { ModuleSettings } from "../../settings/ModuleSettings.js";
import { SocketService } from "../../services/SocketService.js";
import { SocketSlotConfigService } from "../../services/SocketSlotConfigService.js";
import { EffectService } from "../../services/EffectService.js";
import { InventoryService } from "../../services/InventoryService.js";
import { ActivityTransferService } from "../../services/ActivityTransferService.js";
import { GemResourceService } from "../../../domain/gems/GemResourceService.js";
import { SOCKET_CONSUMPTION_SELECTOR_MODES } from "../../helpers/socketConsumptionConfig.js";
import { ItemResolver } from "../../ItemResolver.js";
import { SocketSlot } from "../../model/SocketSlot.js";
import { ScMoreActivitiesGemReloadActivity } from "./activities/gem-reload/ScMoreActivitiesGemReloadActivity.js";
import { ScMoreActivitiesGemReloadActivityData } from "./activities/gem-reload/ScMoreActivitiesGemReloadActivityData.js";
import { ScMoreActivitiesGemReloadActivitySheet } from "./activities/gem-reload/ScMoreActivitiesGemReloadActivitySheet.js";
import { ScMoreActivitiesSocketExtractionActivity } from "./activities/socket-extraction/ScMoreActivitiesSocketExtractionActivity.js";
import { ScMoreActivitiesSocketExtractionActivityData } from "./activities/socket-extraction/ScMoreActivitiesSocketExtractionActivityData.js";
import { ScMoreActivitiesSocketExtractionActivitySheet } from "./activities/socket-extraction/ScMoreActivitiesSocketExtractionActivitySheet.js";
import { ScMoreActivitiesSocketPoolRechargeActivity } from "./activities/socket-pool-recharge/ScMoreActivitiesSocketPoolRechargeActivity.js";
import { ScMoreActivitiesSocketPoolRechargeActivityData } from "./activities/socket-pool-recharge/ScMoreActivitiesSocketPoolRechargeActivityData.js";
import { ScMoreActivitiesSocketPoolRechargeActivitySheet } from "./activities/socket-pool-recharge/ScMoreActivitiesSocketPoolRechargeActivitySheet.js";
import { ScMoreActivitiesSocketRechargeActivity } from "./activities/socket-recharge/ScMoreActivitiesSocketRechargeActivity.js";
import { ScMoreActivitiesSocketRechargeActivityData } from "./activities/socket-recharge/ScMoreActivitiesSocketRechargeActivityData.js";
import { ScMoreActivitiesSocketRechargeActivitySheet } from "./activities/socket-recharge/ScMoreActivitiesSocketRechargeActivitySheet.js";
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
      bypassPermission: true
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

  static async rechargeGem(activity, slotIndex, { item = null, amount = null } = {}) {
    return ScMoreActivitiesIntegration.#dispatchRequest(
      ScMoreActivitiesIntegration.#buildRequest("recharge-gem", activity, {
        amount: amount ?? null,
        itemUuid: item?.uuid ?? null,
        slotIndex: Number(slotIndex)
      }),
      {
        hostItem: item ?? ScMoreActivitiesIntegration.getHostItem(activity),
        type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_RECHARGE
      }
    );
  }

  static async rechargePool(activity, { item = null, resourceKey = "", amount = null } = {}) {
    return ScMoreActivitiesIntegration.#dispatchRequest(
      ScMoreActivitiesIntegration.#buildRequest("recharge-pool", activity, {
        amount: amount ?? null,
        itemUuid: item?.uuid ?? null,
        resourceKey: String(resourceKey ?? "").trim()
      }),
      {
        hostItem: item ?? ScMoreActivitiesIntegration.getHostItem(activity),
        type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_POOL_RECHARGE
      }
    );
  }

  static async reloadGem(activity, { item = null, gemItem = null, slotIndex = null } = {}) {
    return ScMoreActivitiesIntegration.#dispatchRequest(
      ScMoreActivitiesIntegration.#buildRequest("reload-gem", activity, {
        gemUuid: gemItem?.uuid ?? null,
        itemUuid: item?.uuid ?? null,
        slotIndex: slotIndex === null || slotIndex === undefined ? null : slotIndex
      }),
      {
        hostItem: item ?? ScMoreActivitiesIntegration.getHostItem(activity),
        type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_RELOAD
      }
    );
  }

  static #registerActivities(activitiesApi) {
    const registrations = [
      ScMoreActivitiesIntegration.#registerSocketSlotActivity(activitiesApi),
      ScMoreActivitiesIntegration.#registerSocketExtractionActivity(activitiesApi),
      ScMoreActivitiesIntegration.#registerGemReloadActivity(activitiesApi),
      ScMoreActivitiesIntegration.#registerSocketRechargeActivity(activitiesApi),
      ScMoreActivitiesIntegration.#registerSocketPoolRechargeActivity(activitiesApi)
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

  static #registerGemReloadActivity(activitiesApi) {
    return activitiesApi.registerType({
      moduleId: Constants.MODULE_ID,
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_RELOAD,
      label: "SCSockets.Integrations.ScMoreActivities.GemReload.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.GemReload.Hint",
      icon: SC_MORE_ACTIVITIES_ICONS.GEM_RELOAD,
      documentClass: ScMoreActivitiesGemReloadActivity,
      dataModel: ScMoreActivitiesGemReloadActivityData,
      sheetClass: ScMoreActivitiesGemReloadActivitySheet,
      configurable: true,
      category: "sockets",
      ui: {
        scope: "external",
        group: "sockets",
        groupId: SC_MORE_ACTIVITIES_GROUP.id,
        groupLabel: SC_MORE_ACTIVITIES_GROUP.label,
        groupIcon: SC_MORE_ACTIVITIES_GROUP.icon,
        groupOrder: SC_MORE_ACTIVITIES_GROUP.order,
        order: 155
      },
      tags: ["sockets", "gem", "inventory", "reload"],
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
      templates: [`modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-gem-reload-effect.hbs`],
      ownership: {
        execute: "item-owner",
        hostItem: "activity-item",
        mutation: "gm-mediated"
      },
      source: Constants.MODULE_ID
    });
  }

  static #registerSocketRechargeActivity(activitiesApi) {
    return activitiesApi.registerType({
      moduleId: Constants.MODULE_ID,
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_RECHARGE,
      label: "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Hint",
      icon: SC_MORE_ACTIVITIES_ICONS.SOCKET_RECHARGE,
      documentClass: ScMoreActivitiesSocketRechargeActivity,
      dataModel: ScMoreActivitiesSocketRechargeActivityData,
      sheetClass: ScMoreActivitiesSocketRechargeActivitySheet,
      configurable: true,
      category: "sockets",
      ui: {
        scope: "external",
        group: "sockets",
        groupId: SC_MORE_ACTIVITIES_GROUP.id,
        groupLabel: SC_MORE_ACTIVITIES_GROUP.label,
        groupIcon: SC_MORE_ACTIVITIES_GROUP.icon,
        groupOrder: SC_MORE_ACTIVITIES_GROUP.order,
        order: 160
      },
      tags: ["sockets", "gem", "charges", "inventory"],
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
      templates: [`modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-recharge-effect.hbs`],
      ownership: {
        execute: "item-owner",
        hostItem: "activity-item",
        mutation: "gm-mediated"
      },
      source: Constants.MODULE_ID
    });
  }

  static #registerSocketPoolRechargeActivity(activitiesApi) {
    return activitiesApi.registerType({
      moduleId: Constants.MODULE_ID,
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_POOL_RECHARGE,
      label: "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Hint",
      icon: SC_MORE_ACTIVITIES_ICONS.SOCKET_POOL_RECHARGE,
      documentClass: ScMoreActivitiesSocketPoolRechargeActivity,
      dataModel: ScMoreActivitiesSocketPoolRechargeActivityData,
      sheetClass: ScMoreActivitiesSocketPoolRechargeActivitySheet,
      configurable: true,
      category: "sockets",
      ui: {
        scope: "external",
        group: "sockets",
        groupId: SC_MORE_ACTIVITIES_GROUP.id,
        groupLabel: SC_MORE_ACTIVITIES_GROUP.label,
        groupIcon: SC_MORE_ACTIVITIES_GROUP.icon,
        groupOrder: SC_MORE_ACTIVITIES_GROUP.order,
        order: 170
      },
      tags: ["sockets", "gem", "charges", "pool", "inventory"],
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
      templates: [`modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-pool-recharge-effect.hbs`],
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
    const requestUserId = ScMoreActivitiesIntegration.#normalizeUserId(payload.requestUserId ?? requestUser?.id ?? null);
    const user = requestUser?.id === requestUserId
      ? requestUser
      : (requestUserId ? game?.users?.get?.(requestUserId) ?? null : null);

    if (!effectiveItem) {
      return ScMoreActivitiesIntegration.#failure(
        "invalid-request",
        "SCSockets.Integrations.ScMoreActivities.Warnings.InvalidRequest",
        "The socket activity request is no longer valid."
      );
    }

    if (!requestUserId || !user) {
      return ScMoreActivitiesIntegration.#failure(
        "invalid-request-user",
        "SCSockets.Integrations.ScMoreActivities.Warnings.InvalidRequest",
        "The socket activity request is no longer valid."
      );
    }

    const canUseActivity = payload.operation === "reload-gem"
      ? ScMoreActivitiesIntegration.#canUseReloadRequest(activity, user, effectiveItem)
      : ScMoreActivitiesIntegration.#canUseActivity(activity, user, effectiveItem);
    if (!canUseActivity) {
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
    if (payload.operation === "reload-gem") {
      return ScMoreActivitiesIntegration.#executeReloadGem(effectiveItem, activity, payload, { bypassPermission });
    }
    if (payload.operation === "recharge-gem") {
      return ScMoreActivitiesIntegration.#executeRechargeGem(effectiveItem, payload, { bypassPermission });
    }
    if (payload.operation === "recharge-pool") {
      return ScMoreActivitiesIntegration.#executeRechargePool(effectiveItem, payload, { bypassPermission });
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

  static async #executeReloadGem(item, activity, payload, { bypassPermission = false } = {}) {
    const slotIndex = ScMoreActivitiesIntegration.#parseSlotIndex(payload.slotIndex);
    const gemUuid = String(payload.gemUuid ?? "").trim();
    const sourceActor = ScMoreActivitiesIntegration.#getReloadSourceActor(activity);

    if (!Number.isInteger(slotIndex)) {
      return ScMoreActivitiesIntegration.#failure(
        "invalid-slot-index",
        "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.InvalidSlot",
        "Choose a valid empty socket."
      );
    }

    if (!sourceActor) {
      return ScMoreActivitiesIntegration.#failure(
        "missing-source-actor",
        "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.NoSourceActor",
        "This activity needs an actor inventory to draw gems from."
      );
    }

    const gemItem = gemUuid.length ? await ScMoreActivitiesIntegration.#resolveItem(gemUuid) : null;
    if (!gemItem || !ItemResolver.isGem(gemItem) || !ScMoreActivitiesIntegration.#itemBelongsToActor(gemItem, sourceActor)) {
      return ScMoreActivitiesIntegration.#failure(
        "gem-not-available",
        "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.GemNotFound",
        "The selected gem is no longer available in the source actor inventory."
      );
    }

    const result = await SocketService.mutateSockets(item, async (currentItem) => {
      const slots = SocketStore.getSlots(currentItem);
      const slot = Number.isInteger(slotIndex) ? slots[slotIndex] ?? null : null;
      if (!slot) {
        return ScMoreActivitiesIntegration.#failure(
          "invalid-slot-index",
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.InvalidSlot",
          "Choose a valid empty socket."
        );
      }

      if (ScMoreActivitiesIntegration.#slotHasGem(slot)) {
        return ScMoreActivitiesIntegration.#failure(
          "slot-occupied",
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SlotOccupied",
          "The selected socket is already occupied."
        );
      }

      const currentGemItem = await ScMoreActivitiesIntegration.#resolveItem(gemUuid);
      if (!currentGemItem || !ItemResolver.isGem(currentGemItem) || !ScMoreActivitiesIntegration.#itemBelongsToActor(currentGemItem, sourceActor)) {
        return ScMoreActivitiesIntegration.#failure(
          "gem-not-available",
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.GemNotFound",
          "The selected gem is no longer available in the source actor inventory."
        );
      }

      if (!ScMoreActivitiesIntegration.#gemMatchesHostType(currentGemItem, currentItem)) {
        return ScMoreActivitiesIntegration.#failure(
          "gem-incompatible",
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SocketFailed",
          "That item is not compatible with this socket."
        );
      }

      const conditionResult = await SocketSlotConfigService.evaluateCondition({
        hostItem: currentItem,
        slot,
        slotIndex,
        gemItem: currentGemItem,
        source: currentGemItem
      });
      if (!conditionResult.allowed) {
        return ScMoreActivitiesIntegration.#failure(
          conditionResult.error ? "socket-condition-error" : "socket-condition-failed",
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SocketFailed",
          conditionResult.error
            ? "This socket condition could not be evaluated."
            : "That gem does not meet this socket's requirements."
        );
      }

      const previousSlots = foundry.utils.deepClone(slots);
      const nextSlots = foundry.utils.deepClone(slots);
      const gemSnapshot = ItemResolver.snapshotOne(currentGemItem);
      nextSlots[slotIndex] = SocketSlot.fillFromGem(nextSlots[slotIndex], currentGemItem, gemSnapshot, slotIndex);
      ItemResolver.normalizeSocketSlots(nextSlots);

      const mutationOptions = ScMoreActivitiesIntegration.#buildSocketMutationOptions({ bypassPermission });
      let consumedGem = false;

      try {
        // Inventory mutations must keep rendering enabled so open actor sheets refresh
        // immediately; render suppression only applies to the host item's chained updates.
        await InventoryService.consumeOne(currentGemItem);
        consumedGem = true;

        const effectIdMap = await EffectService.applyGemEffects(currentItem, slotIndex, currentGemItem, mutationOptions);
        await ActivityTransferService.applyFromGem(currentItem, slotIndex, currentGemItem, {
          ...mutationOptions,
          [Constants.MODULE_ID]: {
            ...(mutationOptions?.[Constants.MODULE_ID] ?? {}),
            [ActivityTransferService.UPDATE_OPTION_SKIP_REMOVE_EXISTING]: true,
            [ActivityTransferService.UPDATE_OPTION_EFFECT_ID_MAP]: effectIdMap,
            [ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA]: {
              [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: nextSlots
            }
          }
        });
      } catch (error) {
        await ScMoreActivitiesIntegration.#rollbackReloadMutation(
          currentItem,
          sourceActor,
          slotIndex,
          previousSlots,
          gemSnapshot,
          mutationOptions,
          { consumedGem }
        );
        console.error(`[${Constants.MODULE_ID}] reload-gem mutation failed:`, error);
        return ScMoreActivitiesIntegration.#failure(
          "gem-reload-failed",
          "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SocketFailed",
          "Could not socket the selected gem."
        );
      }

      const gemName = currentGemItem.name ?? "";
      return Object.freeze({
        ok: true,
        changed: true,
        reason: "gem-added",
        message: ScMoreActivitiesIntegration.#format(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Info.Reloaded",
          {
            gem: gemName,
            item: currentItem.name ?? "",
            slot: slotIndex + 1
          },
          `Socketed ${gemName || "the gem"} into ${currentItem.name ?? "the item"} (slot ${slotIndex + 1}).`
        )
      });
    }, { bypassPermission });

    if (result?.ok === true || result?.ok === false) {
      return result;
    }

    if (result?.success === true || result?.ok === true) {
      const gemName = gemItem.name ?? "";
      return Object.freeze({
        ok: true,
        changed: result?.changed !== false,
        reason: result?.reason ?? "gem-added",
        result,
        message: ScMoreActivitiesIntegration.#format(
          "SCSockets.Integrations.ScMoreActivities.GemReload.Info.Reloaded",
          {
            gem: gemName,
            item: item.name ?? "",
            slot: slotIndex + 1
          },
          `Socketed ${gemName || "the gem"} into ${item.name ?? "the item"} (slot ${slotIndex + 1}).`
        )
      });
    }

    return ScMoreActivitiesIntegration.#failure(
      result?.reason ?? "gem-reload-failed",
      "SCSockets.Integrations.ScMoreActivities.GemReload.Warnings.SocketFailed",
      result?.message ?? result?.data?.message ?? "Could not socket the selected gem.",
      {
        gem: gemItem.name ?? "",
        item: item.name ?? "",
        slot: slotIndex + 1
      },
      { result }
    );
  }

  static async #executeRechargeGem(item, payload, { bypassPermission = false } = {}) {
    return SocketService.mutateSockets(item, async (currentItem) => {
      const slotIndex = Number(payload.slotIndex);
      const slots = SocketStore.getSlots(currentItem);
      const slot = Number.isInteger(slotIndex) ? slots[slotIndex] : null;

      if (!slot || !GemResourceService.slotHasGem(slot)) {
        return ScMoreActivitiesIntegration.#failure(
          "invalid-slot-index",
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.InvalidSlot",
          "Choose a valid socketed gem."
        );
      }

      const resource = GemResourceService.getSlotResource(slot);
      const gemName = slot?.gem?.name ?? slot?._gemData?.name ?? "";
      if (!resource || resource.max <= 0) {
        return ScMoreActivitiesIntegration.#failure(
          "no-gem-resource",
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.NoResource",
          "The selected gem has no charges to recharge.",
          { gem: gemName }
        );
      }

      if (resource.value >= resource.max) {
        // The gem was already full (usually a race with another update). The roll
        // already happened client-side, so report a completed-but-unchanged use
        // instead of a retryable failure.
        return Object.freeze({
          ok: true,
          changed: false,
          reason: "already-full",
          message: ScMoreActivitiesIntegration.#format(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.AlreadyFull",
            { gem: gemName },
            "The selected gem is already fully charged."
          )
        });
      }

      const rawAmount = payload.amount;
      const amount = rawAmount === null || rawAmount === undefined
        ? null
        : Math.max(Math.trunc(Number(rawAmount) || 0), 0);
      if (amount === 0) {
        return Object.freeze({
          ok: true,
          changed: false,
          reason: "nothing-restored",
          message: ScMoreActivitiesIntegration.#format(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.NothingRestored",
            { gem: gemName },
            "The recharge roll did not restore any charges."
          )
        });
      }

      const targetValue = amount === null
        ? resource.max
        : Math.min(resource.max, resource.value + amount);
      slots[slotIndex] = GemResourceService.withSlotResourceValue(slot, targetValue);
      await SocketStore.setSlots(currentItem, slots);

      const restored = targetValue - resource.value;
      return Object.freeze({
        ok: true,
        changed: true,
        reason: "success",
        restored,
        message: ScMoreActivitiesIntegration.#format(
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Info.Recharged",
          {
            gem: gemName,
            item: currentItem.name ?? "",
            restored,
            value: targetValue,
            max: resource.max
          },
          `Restored ${restored} charges to ${gemName || "the gem"} in ${currentItem.name ?? "the item"} (${targetValue}/${resource.max}).`
        )
      });
    }, { bypassPermission });
  }

  static async #executeRechargePool(item, payload, { bypassPermission = false } = {}) {
    return SocketService.mutateSockets(item, async (currentItem) => {
      const resourceKey = String(payload.resourceKey ?? "").trim();
      if (!resourceKey.length) {
        return ScMoreActivitiesIntegration.#failure(
          "invalid-resource-key",
          "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Warnings.InvalidResourceKey",
          "No charge pool was selected."
        );
      }

      const slots = SocketStore.getSlots(currentItem);
      const pool = GemResourceService.aggregatePools(slots)
        .find((entry) => entry.key.toLowerCase() === resourceKey.toLowerCase());
      if (!pool) {
        return ScMoreActivitiesIntegration.#failure(
          "no-pool",
          "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Warnings.NoPool",
          `The target item has no socketed "${resourceKey}" charges.`,
          { key: resourceKey }
        );
      }

      const missing = pool.max - pool.value;
      if (missing <= 0) {
        return Object.freeze({
          ok: true,
          changed: false,
          reason: "already-full",
          message: ScMoreActivitiesIntegration.#format(
            "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Warnings.AlreadyFull",
            { key: pool.key },
            `The "${pool.key}" charge pool is already full.`
          )
        });
      }

      const rawAmount = payload.amount;
      const amount = rawAmount === null || rawAmount === undefined
        ? null
        : Math.max(Math.trunc(Number(rawAmount) || 0), 0);
      if (amount === 0) {
        return Object.freeze({
          ok: true,
          changed: false,
          reason: "nothing-restored",
          message: ScMoreActivitiesIntegration.#format(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.NothingRestored",
            { gem: pool.key },
            "The recharge roll did not restore any charges."
          )
        });
      }

      const restoreAmount = Math.min(amount ?? missing, missing);
      const plan = GemResourceService.planChargeConsumption(
        slots,
        { mode: SOCKET_CONSUMPTION_SELECTOR_MODES.ANY, resourceKey: pool.key },
        -restoreAmount
      );
      if (!plan.ok) {
        return ScMoreActivitiesIntegration.#failure(
          plan.reason ?? "recharge-failed",
          null,
          plan.message ?? "Could not recharge the selected charge pool."
        );
      }

      const restored = (plan.deductions ?? []).reduce((sum, deduction) => sum - deduction.amount, 0);
      if (restored <= 0) {
        return Object.freeze({
          ok: true,
          changed: false,
          reason: "nothing-restored",
          message: ScMoreActivitiesIntegration.#format(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.NothingRestored",
            { gem: pool.key },
            "The recharge roll did not restore any charges."
          )
        });
      }

      await SocketStore.setSlots(currentItem, plan.updatedSlots);

      return Object.freeze({
        ok: true,
        changed: true,
        reason: "success",
        restored,
        message: ScMoreActivitiesIntegration.#format(
          "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Info.Recharged",
          {
            key: pool.key,
            item: currentItem.name ?? "",
            restored,
            gems: (plan.deductions ?? []).length,
            value: pool.value + restored,
            max: pool.max
          },
          `Restored ${restored} "${pool.key}" charges in ${currentItem.name ?? "the item"} (${pool.value + restored}/${pool.max}).`
        )
      });
    }, { bypassPermission });
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
      result?.message ?? result?.data?.message ?? failureFallback,
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

  static async #rollbackReloadMutation(
    hostItem,
    sourceActor,
    slotIndex,
    previousSlots,
    gemSnapshot,
    options = {},
    { consumedGem = false } = {}
  ) {
    try {
      await ActivityTransferService.removeForSlot(hostItem, slotIndex, options);
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] reload-gem rollback could not remove transferred activities:`, error);
    }

    try {
      await EffectService.removeGemEffects(hostItem, slotIndex, options);
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] reload-gem rollback could not remove gem effects:`, error);
    }

    try {
      await SocketStore.setSlots(hostItem, previousSlots, options);
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] reload-gem rollback could not restore slot state:`, error);
    }

    if (!consumedGem || !gemSnapshot || !sourceActor) {
      return;
    }

    try {
      await InventoryService.returnOne({ actor: sourceActor }, gemSnapshot);
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] reload-gem rollback could not restore the consumed gem:`, error);
    }
  }

  static #buildSocketMutationOptions(options = {}) {
    return {
      ...options,
      notify: false,
      render: false,
      [Constants.MODULE_ID]: {
        ...(options?.[Constants.MODULE_ID] ?? {}),
        [ActivityTransferService.UPDATE_OPTION_SKIP_RECONCILE]: true
      }
    };
  }

  static #parseSlotIndex(value) {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (!/^\d+$/.test(normalized)) {
        return null;
      }

      const parsed = Number(normalized);
      return Number.isSafeInteger(parsed) ? parsed : null;
    }

    return null;
  }

  static #normalizeUserId(value) {
    const normalized = String(value ?? "").trim();
    return normalized.length ? normalized : null;
  }

  static #getReloadSourceActor(activity) {
    return activity?.actor ?? activity?.item?.actor ?? activity?.item?.parent ?? null;
  }

  static #itemBelongsToActor(item, actor) {
    if (!item || !actor) {
      return false;
    }

    return Boolean(
      item?.documentName === "Item"
      && item.actor
      && (item.actor === actor || item.actor?.uuid === actor?.uuid)
      && actor?.items?.get?.(item.id)
    );
  }

  static #slotHasGem(slot) {
    return Boolean(slot?.gem || slot?._gemData);
  }

  static #gemMatchesHostType(gemItem, hostItem) {
    if (!gemItem || !hostItem) {
      return false;
    }

    const allowed = typeof gemItem?.getFlag === "function"
      ? gemItem.getFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES)
      : foundry.utils?.getProperty?.(gemItem, `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_ALLOWED_TYPES}`);
    if (!Array.isArray(allowed) || !allowed.length) {
      return true;
    }

    if (allowed.includes(Constants.GEM_ALLOWED_TYPES_ALL)) {
      return true;
    }

    const hostKeys = ScMoreActivitiesIntegration.#resolveHostTypeKeys(hostItem);
    return hostKeys.some((key) => allowed.includes(key));
  }

  static #resolveHostTypeKeys(hostItem) {
    const keys = new Set();
    if (!hostItem) {
      return [];
    }

    const type = typeof hostItem.type === "string"
      ? hostItem.type
      : String(hostItem.type ?? "");
    const getProperty = globalThis?.foundry?.utils?.getProperty;
    const subtypePaths = [
      "system.type.value",
      "system.type.subtype"
    ];

    for (const path of subtypePaths) {
      const value = typeof getProperty === "function" ? getProperty(hostItem, path) : undefined;
      if (!value) {
        continue;
      }

      const normalized = typeof value === "string" ? value : String(value);
      keys.add(`${type}:${normalized}`);
    }

    if (type) {
      keys.add(type);
    }

    return Array.from(keys);
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

  static #canUseReloadRequest(activity, user, targetItem = null) {
    return Boolean(
      activity
      && ScMoreActivitiesIntegration.#canUseActivity(activity, user)
      && ScMoreActivitiesIntegration.#canUseActivity(activity, user, targetItem)
    );
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
