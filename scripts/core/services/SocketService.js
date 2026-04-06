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

export class SocketService {
  static #operationQueues = new Map();

  static async addGem(hostItem, idx, source) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#addGem(currentHostItem, idx, source)
    );
  }

  static async removeGem(hostItem, idx) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#removeGem(currentHostItem, idx)
    );
  }

  static async addSlot(hostItem, options = {}) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#addSlot(currentHostItem, options)
    );
  }

  static async removeSlot(hostItem, idx) {
    return SocketService.#enqueueHostOperation(
      hostItem,
      (currentHostItem) => SocketService.#removeSlot(currentHostItem, idx)
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

  static async #addGem(hostItem, idx, source) {
    if (!SocketService.#canUseSocketsOnHost(hostItem)) {
      return ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Notifications.HostNotSocketable",
          "This item type cannot receive sockets."
        )
      );
    }

    const slots = SocketStore.getSlots(hostItem);

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return ui.notifications?.warn?.(
        Constants.localize("SCSockets.Notifications.InvalidSocketIndex", "Invalid socket index.")
      );
    }

    let gemItem = null;
    if (typeof source === "string") {
      try {
        gemItem = await fromUuid(source);
      } catch (error) {
        console.debug(`[${Constants.MODULE_ID}] Could not resolve gem UUID "${source}":`, error);
      }
    } else if (source?.documentName === "Item") {
      gemItem = source;
    } else {
      gemItem = await ItemResolver.resolveDraggedItem(source);
    }

    if (!gemItem) {
      return ui.notifications?.warn?.(
        Constants.localize("SCSockets.Notifications.CannotResolveItem", "Cannot resolve dropped item.")
      );
    }

    if (!ItemResolver.isGem(gemItem)) {
      return ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Notifications.OnlyGems",
          "Only socket-compatible items can be inserted."
        )
      );
    }

    if (!SocketService.#gemMatchesHostType(gemItem, hostItem)) {
      return ui.notifications?.warn?.(
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
      return ui.notifications?.warn?.(Constants.localize(key, fallback));
    }

    const previousSlot = slots[idx] ?? {};
    const shouldReturnReplacedGem = Boolean(previousSlot?.gem) && !ModuleSettings.shouldDeleteGemOnRemoval();
    const replacedGemSnapshot = shouldReturnReplacedGem
      ? ItemResolver.expandSnapshot(previousSlot?._gemData ?? null)
      : null;

    const noRender = SocketService.#buildInternalUpdateOptions({ render: false });

    try {
      await EffectService.removeGemEffects(hostItem, idx, noRender);
    } catch (e) {
      console.error(`[${Constants.MODULE_ID}] removeGemEffects failed:`, e);
    }

    await ActivityTransferService.removeForSlot(hostItem, idx, noRender);

    const snap = ItemResolver.snapshotOne(gemItem);
    slots[idx] = SocketSlot.fillFromGem(slots[idx], gemItem, snap, idx);
    ItemResolver.normalizeSocketSlots(slots);

    await EffectService.applyGemEffects(hostItem, idx, gemItem, noRender);
    await ActivityTransferService.applyFromGem(hostItem, idx, gemItem, {
      ...noRender,
      [Constants.MODULE_ID]: {
        ...(noRender?.[Constants.MODULE_ID] ?? {}),
        [ActivityTransferService.UPDATE_OPTION_SKIP_REMOVE_EXISTING]: true,
        [ActivityTransferService.UPDATE_OPTION_EXTRA_UPDATE_DATA]: {
          [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: slots
        }
      }
    });
    await InventoryService.consumeOne(gemItem);

    if (shouldReturnReplacedGem) {
      try {
        await InventoryService.returnOne(hostItem, replacedGemSnapshot);
      } catch (error) {
        console.warn(`[${Constants.MODULE_ID}] failed to return replaced gem to inventory:`, error);
      }
    }
  }

  static async #removeGem(hostItem, idx) {
    const slots = SocketStore.getSlots(hostItem);

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return;
    }

    const slot = slots[idx] ?? {};

    if (!ModuleSettings.shouldDeleteGemOnRemoval()) {
      try {
        await InventoryService.returnOne(hostItem, ItemResolver.expandSnapshot(slot._gemData));
      } catch (e) {
        console.warn("return inventory failed:", e);
      }
    }

    const noRender = SocketService.#buildInternalUpdateOptions({ render: false });

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
    ui.notifications?.info?.(
      Constants.localize("SCSockets.Notifications.GemUnsocketed", "Gem unsocketed.")
    );
  }

  static async #addSlot(hostItem, options = {}) {
    const { bypassPermission = false } = options;

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
    const slot = SocketSlot.makeDefault();
    const createdIndex = currentSlots.length;
    const result = await SocketStore.addSlot(hostItem, slot);
    SocketService.#emitSocketAdded(hostItem, {
      slotIndex: createdIndex,
      slot,
      totalSlots: createdIndex + 1
    });
    return result;
  }

  static async #removeSlot(hostItem, idx) {
    if (!ModuleSettings.canAddOrRemoveSocket()) {
      return;
    }
    const currentSlots = SocketStore.peekSlots(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= currentSlots.length) {
      return;
    }

    const removedSlot = foundry.utils.deepClone(currentSlots[idx] ?? null);
    const result = await SocketStore.removeSlot(hostItem, idx);
    SocketService.#emitSocketRemoved(hostItem, {
      slotIndex: idx,
      slot: removedSlot,
      totalSlots: Math.max(currentSlots.length - 1, 0)
    });
    return result;
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

  static #buildInternalUpdateOptions(base = {}) {
    return {
      ...base,
      [Constants.MODULE_ID]: {
        ...(base?.[Constants.MODULE_ID] ?? {}),
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
