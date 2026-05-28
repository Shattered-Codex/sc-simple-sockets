import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { EffectService } from "./EffectService.js";
import { ActivityTransferService } from "./ActivityTransferService.js";
import { InventoryService } from "./InventoryService.js";
import { ItemResolver } from "../ItemResolver.js";
import { SocketSlot } from "../model/SocketSlot.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { SocketSlotConfigService } from "./SocketSlotConfigService.js";
import { ItemSheetSync } from "../support/ItemSheetSync.js";
import { DebugTrace } from "../support/DebugTrace.js";
import { HostItemUpdateService } from "../support/HostItemUpdateService.js";

export class SocketService {
  static #operationQueues = new Map();
  static REMOVE_GEM_MODE_DEFAULT = "default";
  static REMOVE_GEM_MODE_KEEP = "keep";
  static REMOVE_GEM_MODE_DELETE = "delete";

  static async addGem(hostItem, idx, source, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#addGem(currentHostItem, idx, source, options)
    );
  }

  static async removeGem(hostItem, idx, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#removeGem(currentHostItem, idx, options)
    );
  }

  static async removeSlotWithContents(hostItem, idx, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#removeSlotWithContents(currentHostItem, idx, options)
    );
  }

  static async addSlot(hostItem, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#addSlot(currentHostItem, options)
    );
  }

  static async removeSlot(hostItem, idx, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#removeSlot(currentHostItem, idx, options)
    );
  }

  static getSlots(hostItem) {
    return SocketStore.peekSlots(SocketService.#resolveHostItem(hostItem));
  }

  static async updateSlotConfig(hostItem, idx, config) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketSlotConfigService.updateConfig(currentHostItem, idx, config)
    );
  }

  static async #addGem(hostItem, idx, source, options = {}) {
    DebugTrace.log("socket-service.addGem.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      slotIndex: idx,
      sourceUuid: typeof source === "string" ? source : source?.uuid ?? null,
      options: DebugTrace.describeOptions(options)
    });
    if (!SocketService.#canUseSocketsOnHost(hostItem)) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "host-not-socketable",
        Constants.localize(
          "SCSockets.Notifications.HostNotSocketable",
          "This item type cannot receive sockets."
        )
      );
    }

    if (!SocketService.#canMutateSockets(options)) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "permission-denied",
        Constants.localize(
          "SCSockets.Notifications.EditPermissionDenied",
          "You do not have permission to modify sockets on this item."
        )
      );
    }

    const slots = SocketStore.getSlots(hostItem);

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "invalid-slot-index",
        Constants.localize("SCSockets.Notifications.InvalidSocketIndex", "Invalid socket index.")
      );
    }

    let gemItem = null;
    if (typeof source === "string") {
      try {
        gemItem = await fromUuid(source);
      } catch (error) {
        if (Constants.isDebugEnabled()) {
          console.debug(`[${Constants.MODULE_ID}] Could not resolve gem UUID "${source}":`, error);
        }
      }
    } else if (source?.documentName === "Item") {
      gemItem = source;
    } else {
      gemItem = await ItemResolver.resolveDraggedItem(source);
    }

    if (!gemItem) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "cannot-resolve-item",
        Constants.localize("SCSockets.Notifications.CannotResolveItem", "Cannot resolve dropped item.")
      );
    }

    if (!ItemResolver.isGem(gemItem)) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "not-a-gem",
        Constants.localize(
          "SCSockets.Notifications.OnlyGems",
          "Only socket-compatible items can be inserted."
        )
      );
    }

    if (!SocketService.#gemMatchesHostType(gemItem, hostItem)) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "gem-incompatible",
        Constants.localize(
          "SCSockets.Notifications.GemIncompatible",
          "That item is not compatible with this socket."
        )
      );
    }

    const conditionResult = await SocketSlotConfigService.evaluateCondition({
      hostItem,
      slot: slots[idx],
      slotIndex: idx,
      gemItem,
      source
    });
    if (!conditionResult.allowed) {
      const key = conditionResult.error
        ? "SCSockets.Notifications.SocketConditionError"
        : "SCSockets.Notifications.SocketConditionFailed";
      const fallback = conditionResult.error
        ? "This socket condition could not be evaluated."
        : "That gem does not meet this socket's requirements.";
      return SocketService.#warnAndReturnResult(
        "warn",
        conditionResult.error ? "socket-condition-error" : "socket-condition-failed",
        Constants.localize(key, fallback)
      );
    }

    const previousSlot = slots[idx] ?? {};
    const shouldDeleteReplacedGem = SocketService.#shouldDeleteGemOnRemoval(previousSlot);
    const shouldReturnReplacedGem = Boolean(previousSlot?.gem || previousSlot?._gemData) && !shouldDeleteReplacedGem;
    const replacedGemSnapshot = shouldReturnReplacedGem
      ? ItemResolver.expandSnapshot(previousSlot?._gemData ?? null)
      : null;

    const noRender = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.addGem.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx,
      options: DebugTrace.describeOptions(noRender)
    });

    const hostState = SocketService.#captureHostState(hostItem);
    const incomingGemSnapshot = ItemResolver.snapshotOne(gemItem);
    let consumedIncomingGem = false;

    try {
      await InventoryService.consumeOne(gemItem, noRender);
      consumedIncomingGem = Boolean(gemItem?.actor);

      try {
        await EffectService.removeGemEffects(hostItem, idx, noRender);
      } catch (e) {
        console.error(`[${Constants.MODULE_ID}] removeGemEffects failed:`, e);
      }

      await ActivityTransferService.removeForSlot(hostItem, idx, noRender);

      slots[idx] = SocketSlot.fillFromGem(slots[idx], gemItem, incomingGemSnapshot, idx);
      ItemResolver.normalizeSocketSlots(slots);

      const effectIdMap = await EffectService.applyGemEffects(hostItem, idx, gemItem, noRender);
      await ActivityTransferService.applyFromGem(hostItem, idx, gemItem, {
        ...noRender,
        [Constants.MODULE_ID]: {
          ...(noRender?.[Constants.MODULE_ID] ?? {}),
          [ActivityTransferService.UPDATE_OPTION_SKIP_REMOVE_EXISTING]: true,
          [ActivityTransferService.UPDATE_OPTION_EFFECT_ID_MAP]: effectIdMap,
          [ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA]: {
            [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: slots
          }
        }
      });

      if (shouldReturnReplacedGem) {
        await InventoryService.returnOne(hostItem, replacedGemSnapshot, noRender);
      }
    } catch (error) {
      await SocketService.#rollbackHostOperation(hostItem, hostState, noRender, {
        consumedIncomingGem,
        consumedIncomingSnapshot: incomingGemSnapshot
      });
      throw error;
    }

    DebugTrace.log("socket-service.addGem.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx
    });
    return SocketService.#buildResult({ success: true, changed: true, reason: "gem-added" });
  }

  static async #removeGem(hostItem, idx, options = {}) {
    DebugTrace.log("socket-service.removeGem.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      slotIndex: idx,
      options: DebugTrace.describeOptions(options)
    });
    const slots = SocketStore.getSlots(hostItem);

    if (!SocketService.#canMutateSockets(options)) {
      return SocketService.#warnAndReturnResult(
        "warn",
        "permission-denied",
        Constants.localize(
          "SCSockets.Notifications.EditPermissionDenied",
          "You do not have permission to modify sockets on this item."
        )
      );
    }

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    const slot = slots[idx] ?? {};
    if (!slot?.gem && !slot?._gemData) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "empty-slot" });
    }
    const removalMode = SocketService.#normalizeRemoveGemMode(options?.mode);
    const shouldDeleteGem = SocketService.#shouldDeleteGemOnRemoval(slot, { mode: removalMode });
    const gemSnapshot = ItemResolver.expandSnapshot(slot?._gemData ?? null);

    const noRender = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.removeGem.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx,
      options: DebugTrace.describeOptions(noRender)
    });

    const hostState = SocketService.#captureHostState(hostItem);
    let returnedGemItem = null;

    try {
      try {
        await EffectService.removeGemEffects(hostItem, idx, noRender);
      } catch (e) {
        console.error(`[${Constants.MODULE_ID}] removeGemEffects failed:`, e);
      }

      slots[idx] = SocketSlot.clearGem(slot, idx);
      ItemResolver.normalizeSocketSlots(slots);
      await ActivityTransferService.removeForSlot(hostItem, idx, {
        ...noRender,
        [Constants.MODULE_ID]: {
          ...(noRender?.[Constants.MODULE_ID] ?? {}),
          [ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA]: {
            [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: slots
          }
        }
      });

      if (!shouldDeleteGem && gemSnapshot) {
        returnedGemItem = await InventoryService.returnOne(hostItem, gemSnapshot, noRender);
      }
    } catch (error) {
      await SocketService.#rollbackHostOperation(hostItem, hostState, noRender, {
        returnedGemItem
      });
      throw error;
    }

    if (options?.notify !== false) {
      ui.notifications?.info?.(
        Constants.localize("SCSockets.Notifications.GemUnsocketed", "Gem unsocketed.")
      );
    }

    DebugTrace.log("socket-service.removeGem.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx
    });
    return SocketService.#buildResult({
      success: true,
      changed: true,
      reason: "gem-removed",
      returnedGemItem
    });
  }

  static async #addSlot(hostItem, options = {}) {
    DebugTrace.log("socket-service.addSlot.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      options: DebugTrace.describeOptions(options)
    });
    const { bypassPermission = false, slotConfig = {} } = options;

    if (!SocketService.#isHostTypeSocketable(hostItem)) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Notifications.HostNotSocketable",
          "This item type cannot receive sockets."
        )
      );
      return;
    }

    if (!bypassPermission && !ModuleSettings.canAddOrRemoveSocket()) {
      return;
    }
    const currentSlots = SocketStore.peekSlots(hostItem);
    const maxSlots = ModuleSettings.getMaxSockets();
    if (currentSlots.length >= maxSlots) {
      ui.notifications?.warn?.(
        Constants.localize("SCSockets.Notifications.MaxReached", "Maximum number of sockets reached.")
      );
      return;
    }
    const slot = SocketSlot.makeDefault(slotConfig);
    const createdIndex = currentSlots.length;
    const updateOptions = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.addSlot.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      options: DebugTrace.describeOptions(updateOptions)
    });
    const result = await SocketStore.addSlot(hostItem, slot, updateOptions);
    SocketService.#emitSocketAdded(hostItem, {
      slotIndex: createdIndex,
      slot,
      totalSlots: createdIndex + 1
    });
    DebugTrace.log("socket-service.addSlot.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: createdIndex
    });
    return result;
  }

  static async #removeSlot(hostItem, idx, options = {}) {
    DebugTrace.log("socket-service.removeSlot.start", {
      hostItem: DebugTrace.describeItem(hostItem),
      actor: DebugTrace.describeActor(hostItem?.actor ?? hostItem?.parent),
      slotIndex: idx,
      options: DebugTrace.describeOptions(options)
    });
    if (!ModuleSettings.canAddOrRemoveSocket()) {
      return;
    }
    const currentSlots = SocketStore.peekSlots(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= currentSlots.length) {
      return;
    }

    const removedSlot = foundry.utils.deepClone(currentSlots[idx] ?? null);
    const updateOptions = SocketService.#buildInternalUpdateOptions({ render: false }, options);
    DebugTrace.log("socket-service.removeSlot.noRender", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx,
      options: DebugTrace.describeOptions(updateOptions)
    });
    const result = await SocketStore.removeSlot(hostItem, idx, updateOptions);
    SocketService.#emitSocketRemoved(hostItem, {
      slotIndex: idx,
      slot: removedSlot,
      totalSlots: Math.max(currentSlots.length - 1, 0)
    });
    DebugTrace.log("socket-service.removeSlot.done", {
      hostItem: DebugTrace.describeItem(hostItem),
      slotIndex: idx
    });
    return result;
  }

  static async #removeSlotWithContents(hostItem, idx, options = {}) {
    hostItem = SocketService.#resolveHostItem(hostItem);
    const currentSlots = SocketStore.peekSlots(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= currentSlots.length) {
      return SocketService.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    const hostState = SocketService.#captureHostState(hostItem);
    let removeGemResult = null;

    try {
      if (currentSlots[idx]?.gem || currentSlots[idx]?._gemData) {
        removeGemResult = await SocketService.#removeGem(hostItem, idx, options);
        if (!removeGemResult?.success) {
          return removeGemResult;
        }
      } else {
        await SocketService.#removeDerivedSlotData(hostItem, idx, options);
      }

      hostItem = SocketService.#resolveHostItem(hostItem);
      return await SocketService.#removeSlot(hostItem, idx, options);
    } catch (error) {
      await SocketService.#rollbackHostOperation(hostItem, hostState, options, {
        returnedGemItem: removeGemResult?.returnedGemItem ?? removeGemResult?.data?.returnedGemItem ?? null
      });
      throw error;
    }
  }

  static async #removeDerivedSlotData(hostItem, idx, options = {}) {
    const noRender = SocketService.#buildInternalUpdateOptions({ render: false }, options);

    try {
      await EffectService.removeGemEffects(hostItem, idx, noRender);
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] removeGemEffects failed during slot cleanup:`, error);
    }

    await ActivityTransferService.removeForSlot(hostItem, idx, noRender);
  }

  static #gemMatchesHostType(gemItem, hostItem) {
    if (!gemItem || !hostItem) {
      return false;
    }

    const allowed = gemItem.getFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES);
    if (!Array.isArray(allowed) || !allowed.length) {
      return true;
    }

    if (allowed.includes(Constants.GEM_ALLOWED_TYPES_ALL)) {
      return true;
    }

    const hostKeys = SocketService.#resolveHostTypeKeys(hostItem);
    return hostKeys.some((key) => allowed.includes(key));
  }

  static #resolveHostTypeKeys(hostItem) {
    const keys = new Set();
    if (!hostItem) {
      return Array.from(keys);
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
      if (value) {
        const normalized = typeof value === "string" ? value : String(value);
        keys.add(`${type}:${normalized}`);
      }
    }

    if (type) {
      keys.add(type);
    }

    return Array.from(keys);
  }

  static #canUseSocketsOnHost(hostItem) {
    return ModuleSettings.isItemSocketable(hostItem);
  }

  static #isHostTypeSocketable(hostItem) {
    return ModuleSettings.isItemSocketableByType(hostItem);
  }

  static #normalizeRemoveGemMode(mode) {
    const normalized = String(mode ?? SocketService.REMOVE_GEM_MODE_DEFAULT).trim().toLowerCase();
    if (normalized === SocketService.REMOVE_GEM_MODE_KEEP || normalized === SocketService.REMOVE_GEM_MODE_DELETE) {
      return normalized;
    }
    return SocketService.REMOVE_GEM_MODE_DEFAULT;
  }

  static #shouldDeleteGemOnRemoval(slot, { mode = SocketService.REMOVE_GEM_MODE_DEFAULT } = {}) {
    if (mode === SocketService.REMOVE_GEM_MODE_KEEP) {
      return false;
    }

    if (mode === SocketService.REMOVE_GEM_MODE_DELETE) {
      return true;
    }

    const slotDeleteOverride = SocketSlotConfigService.getConfig(slot).deleteGemOnRemoval;
    return slotDeleteOverride || ModuleSettings.shouldDeleteGemOnRemoval();
  }

  static #buildInternalUpdateOptions(base = {}, options = {}) {
    return {
      ...base,
      [Constants.MODULE_ID]: {
        ...(base?.[Constants.MODULE_ID] ?? {}),
        ...(options?.[Constants.MODULE_ID] ?? {}),
        [ActivityTransferService.UPDATE_OPTION_SKIP_RECONCILE]: true
      }
    };
  }

  static async #enqueueHostOperation(hostItem, operation) {
    const currentHostItem = SocketService.#resolveHostItem(hostItem);
    const key = SocketService.#hostOperationKey(currentHostItem);
    if (!key) {
      return operation(currentHostItem);
    }

    const previous = SocketService.#operationQueues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => operation(SocketService.#resolveHostItem(currentHostItem)));

    SocketService.#operationQueues.set(key, next);

    try {
      return await next;
    } finally {
      if (SocketService.#operationQueues.get(key) === next) {
        SocketService.#operationQueues.delete(key);
      }
    }
  }

  static #resolveHostItem(hostItem) {
    return ItemSheetSync.resolve(hostItem);
  }

  static #canMutateSockets(options = {}) {
    return Boolean(options?.bypassPermission) || ModuleSettings.canAddOrRemoveSocket();
  }

  static #buildResult({ success = false, changed = false, reason = "unknown", ...data } = {}) {
    return {
      success,
      changed,
      reason,
      data
    };
  }

  static #warnAndReturnResult(level, reason, message) {
    ui.notifications?.[level]?.(message);
    return SocketService.#buildResult({
      success: false,
      changed: false,
      reason,
      message
    });
  }

  static #captureHostState(hostItem) {
    const currentHostItem = SocketService.#resolveHostItem(hostItem);
    const source = currentHostItem?.toObject?.() ?? {};

    return {
      sockets: foundry.utils.deepClone(SocketStore.peekSlots(currentHostItem)),
      socketActivities: foundry.utils.deepClone(
        currentHostItem?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_SOCKET_ACTIVITIES) ?? null
      ),
      activities: foundry.utils.deepClone(source.system?.activities ?? {}),
      effects: (currentHostItem?.effects?.contents ?? []).map((effect) => {
        const data = effect.toObject();
        delete data._id;
        return data;
      })
    };
  }

  static async #rollbackHostOperation(hostItem, hostState, options = {}, {
    consumedIncomingGem = false,
    consumedIncomingSnapshot = null,
    returnedGemItem = null
  } = {}) {
    try {
      await SocketService.#restoreHostState(hostItem, hostState, options);
    } catch (restoreError) {
      console.error(`[${Constants.MODULE_ID}] failed to restore host item after socket error:`, restoreError);
    }

    if (returnedGemItem) {
      try {
        await InventoryService.consumeOne(returnedGemItem, options);
      } catch (inventoryError) {
        console.warn(`[${Constants.MODULE_ID}] failed to revert returned gem after socket error:`, inventoryError);
      }
    }

    if (consumedIncomingGem && consumedIncomingSnapshot) {
      try {
        await InventoryService.returnOne(SocketService.#resolveHostItem(hostItem), consumedIncomingSnapshot, options);
      } catch (inventoryError) {
        console.warn(`[${Constants.MODULE_ID}] failed to restore consumed gem after socket error:`, inventoryError);
      }
    }
  }

  static async #restoreHostState(hostItem, hostState, options = {}) {
    let currentHostItem = SocketService.#resolveHostItem(hostItem);
    if (!currentHostItem || !hostState) {
      return currentHostItem ?? null;
    }

    currentHostItem = await HostItemUpdateService.update(currentHostItem, {
      "system.activities": foundry.utils.deepClone(hostState.activities ?? {}),
      [`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_ACTIVITIES}`]:
        foundry.utils.deepClone(hostState.socketActivities ?? {}),
      [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]:
        foundry.utils.deepClone(hostState.sockets ?? [])
    }, options);

    const effectIds = (currentHostItem?.effects?.contents ?? [])
      .map((effect) => effect?.id)
      .filter((id) => typeof id === "string" && id.length);
    if (effectIds.length) {
      await currentHostItem.deleteEmbeddedDocuments("ActiveEffect", effectIds, options);
    }

    if (Array.isArray(hostState.effects) && hostState.effects.length) {
      await currentHostItem.createEmbeddedDocuments(
        "ActiveEffect",
        hostState.effects.map((effect) => foundry.utils.deepClone(effect)),
        options
      );
    }

    return SocketService.#resolveHostItem(currentHostItem);
  }

  static #hostOperationKey(hostItem) {
    if (!hostItem) {
      return null;
    }

    const parentUuid = hostItem.parent?.uuid ?? "world";
    const itemId = hostItem.id ?? hostItem.uuid ?? null;
    if (!itemId) {
      return null;
    }

    return `${parentUuid}:${itemId}`;
  }

  static #emitSocketAdded(hostItem, { slotIndex, slot, totalSlots }) {
    Hooks.callAll(Constants.HOOK_SOCKET_ADDED, {
      item: hostItem ?? null,
      itemId: hostItem?.id ?? null,
      itemUuid: hostItem?.uuid ?? null,
      actor: hostItem?.actor ?? null,
      actorId: hostItem?.actor?.id ?? null,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      slot: foundry.utils.deepClone(slot ?? null),
      totalSlots: Number.isInteger(totalSlots) ? totalSlots : null,
      userId: game.userId ?? game.user?.id ?? null
    });
  }

  static #emitSocketRemoved(hostItem, { slotIndex, slot, totalSlots }) {
    Hooks.callAll(Constants.HOOK_SOCKET_REMOVED, {
      item: hostItem ?? null,
      itemId: hostItem?.id ?? null,
      itemUuid: hostItem?.uuid ?? null,
      actor: hostItem?.actor ?? null,
      actorId: hostItem?.actor?.id ?? null,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      slot: foundry.utils.deepClone(slot ?? null),
      totalSlots: Number.isInteger(totalSlots) ? totalSlots : null,
      userId: game.userId ?? game.user?.id ?? null
    });
  }

}
