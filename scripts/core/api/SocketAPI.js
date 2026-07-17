import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { SocketService } from "../services/SocketService.js";
import { ItemResolver } from "../ItemResolver.js";
import { GemTagService } from "../../domain/gems/GemTagService.js";

export class SocketAPI {
  static register() {
    Hooks.once("ready", () => {
      const module = game.modules.get(Constants.MODULE_ID);
      if (!module) return;

      module.api ??= {};
      module.api.sockets ??= {};

      module.api.sockets.getItemSlots = async (itemOrUuid, options = {}) =>
        SocketAPI.getItemSlots(itemOrUuid, options);
      module.api.sockets.getItemGems = async (itemOrUuid, options = {}) =>
        SocketAPI.getItemGems(itemOrUuid, options);
      module.api.sockets.hasItemGemTag = async (itemOrUuid, tag) =>
        SocketAPI.hasItemGemTag(itemOrUuid, tag);
      module.api.sockets.removeGem = async (itemOrUuid, slotIndex, options = {}) =>
        SocketAPI.removeGem(itemOrUuid, slotIndex, options);
      module.api.sockets.removeGemKeepingItem = async (itemOrUuid, slotIndex, options = {}) =>
        SocketAPI.removeGem(itemOrUuid, slotIndex, {
          ...options,
          mode: SocketService.REMOVE_GEM_MODE_KEEP
        });

      module.api.sockets.HOOK_SOCKET_ADDED = Constants.HOOK_SOCKET_ADDED;
      module.api.sockets.HOOK_SOCKET_REMOVED = Constants.HOOK_SOCKET_REMOVED;
    });
  }

  static async getItemSlots(itemOrUuid, { includeSnapshots = false } = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return [];
    }

    const slots = SocketStore.getSlots(item);
    return slots.map((slot, index) => ({
      slotIndex: index,
      hasGem: Boolean(slot?.gem),
      slot: SocketAPI.#sanitizeSlot(slot, { includeSnapshots })
    }));
  }

  static async getItemGems(itemOrUuid, { includeSnapshots = false } = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return [];
    }

    const slots = SocketStore.getSlots(item);
    const gems = [];

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      if (!slot?.gem) continue;
      gems.push({
        slotIndex,
        name: slot?.gem?.name ?? slot?.name ?? null,
        img: slot?.gem?.img ?? slot?.img ?? null,
        tags: SocketAPI.#getSlotGemTags(slot),
        uuid: null,
        sourceUuid: null,
        slot: SocketAPI.#sanitizeSlot(slot, { includeSnapshots })
      });
    }

    return gems;
  }

  static async hasItemGemTag(itemOrUuid, tag) {
    const normalizedTag = GemTagService.normalizeTag(tag);
    if (!normalizedTag.length) {
      return false;
    }

    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return false;
    }

    return SocketStore.peekSlots(item).some((slot) => (
      Boolean(slot?.gem) && SocketAPI.#getSlotGemTags(slot).includes(normalizedTag)
    ));
  }

  static async canEditSockets(itemOrUuid, { userId = null } = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    const user = userId ? game?.users?.get?.(userId) ?? null : game?.user ?? null;
    if (!item || !user) {
      return false;
    }

    return Boolean(
      user.isGM
      || (
        ModuleSettings.canAddOrRemoveSocket(user)
        && (
          item.isOwner
          || item.testUserPermission?.(user, "OWNER")
          || item.parent?.testUserPermission?.(user, "OWNER")
        )
      )
    );
  }

  static async addSlot(itemOrUuid, options = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "item-not-found" });
    }

    const beforeCount = SocketAPI.#slotCount(item);
    const result = await SocketService.addSlot(item, options);
    const currentItem = await SocketAPI.#resolveCurrentItem(item);
    const afterCount = SocketAPI.#slotCount(currentItem);
    const createdIndex = afterCount > beforeCount ? afterCount - 1 : null;

    return SocketAPI.#buildResult({
      success: afterCount > beforeCount,
      changed: afterCount > beforeCount,
      reason: afterCount > beforeCount ? "slot-added" : "slot-not-added",
      slotIndex: createdIndex,
      totalSlots: afterCount
    });
  }

  static async removeSlot(itemOrUuid, slotIndex, options = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "item-not-found" });
    }

    const idx = Number(slotIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    const beforeCount = SocketAPI.#slotCount(item);
    const result = await SocketService.removeSlot(item, idx, options);
    const currentItem = await SocketAPI.#resolveCurrentItem(item);
    const afterCount = SocketAPI.#slotCount(currentItem);

    return SocketAPI.#buildResult({
      success: afterCount < beforeCount,
      changed: afterCount < beforeCount,
      reason: afterCount < beforeCount ? "slot-removed" : "slot-not-removed",
      slotIndex: idx,
      totalSlots: afterCount
    });
  }

  static async removeSlotWithContents(itemOrUuid, slotIndex, options = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "item-not-found" });
    }

    const idx = Number(slotIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    const beforeCount = SocketAPI.#slotCount(item);
    const result = await SocketService.removeSlotWithContents(item, idx, options);
    if (result && typeof result === "object" && "success" in result && result.success !== true) {
      return SocketAPI.#buildResult(result);
    }

    const currentItem = await SocketAPI.#resolveCurrentItem(item);
    const afterCount = SocketAPI.#slotCount(currentItem);
    return SocketAPI.#buildResult({
      success: afterCount < beforeCount,
      changed: afterCount < beforeCount,
      reason: afterCount < beforeCount ? "slot-removed" : "slot-not-removed",
      slotIndex: idx,
      totalSlots: afterCount
    });
  }

  static async removeGem(itemOrUuid, slotIndex, options = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "item-not-found" });
    }

    const idx = Number(slotIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    const result = await SocketService.removeGem(item, idx, options);
    return SocketAPI.#buildResult(result);
  }

  static async updateSlotConfig(itemOrUuid, slotIndex, config = {}, options = {}) {
    const item = await SocketAPI.#resolveItem(itemOrUuid);
    if (!item) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "item-not-found" });
    }

    const idx = Number(slotIndex);
    if (!Number.isInteger(idx) || idx < 0) {
      return SocketAPI.#buildResult({ success: false, changed: false, reason: "invalid-slot-index" });
    }

    const updated = await SocketService.updateSlotConfig(item, idx, config, options);
    const currentItem = await SocketAPI.#resolveCurrentItem(item);
    return SocketAPI.#buildResult({
      success: updated === true,
      changed: updated === true,
      reason: updated === true ? "slot-config-updated" : "slot-config-not-updated",
      slotIndex: idx
    });
  }

  static #sanitizeSlot(slot, { includeSnapshots = false } = {}) {
    const cloned = foundry.utils.deepClone(slot ?? {});
    if (!includeSnapshots && cloned && typeof cloned === "object") {
      delete cloned._gemData;
    }
    return cloned;
  }

  static #getSlotGemTags(slot) {
    return GemTagService.getTags(ItemResolver.expandSnapshot(slot?._gemData));
  }

  static async #resolveItem(itemOrUuid) {
    if (itemOrUuid?.documentName === "Item") {
      return itemOrUuid;
    }

    const uuid = String(itemOrUuid ?? "").trim();
    if (!uuid.length) {
      return null;
    }

    if (typeof fromUuidSync === "function") {
      try {
        const resolved = fromUuidSync(uuid);
        if (resolved?.documentName === "Item") {
          return resolved;
        }
      } catch {
      }
    }

    if (typeof fromUuid === "function") {
      try {
        const resolved = await fromUuid(uuid);
        if (resolved?.documentName === "Item") {
          return resolved;
        }
      } catch {
      }
    }

    return null;
  }

  static async #resolveCurrentItem(item) {
    if (!item?.uuid) {
      return item ?? null;
    }
    return await SocketAPI.#resolveItem(item.uuid) ?? item;
  }

  static #slotCount(item) {
    return SocketStore.peekSlots(item).length;
  }

  static #buildResult(result = {}) {
    const {
      changed = false,
      data = undefined,
      reason = "unknown",
      success = false,
      ...rest
    } = result ?? {};

    return {
      success: success === true,
      changed: changed === true,
      reason,
      data: SocketAPI.#sanitizeResultData(data && typeof data === "object" ? data : rest)
    };
  }

  static #sanitizeResultData(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => SocketAPI.#sanitizeResultData(entry));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    if (value?.documentName || value?.constructor?.documentName) {
      return {
        documentName: value.documentName ?? value.constructor?.documentName ?? null,
        id: value.id ?? null,
        name: value.name ?? null,
        uuid: value.uuid ?? null
      };
    }

    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, SocketAPI.#sanitizeResultData(entry)])
    );
  }
}
