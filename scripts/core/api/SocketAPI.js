import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";

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
        uuid: slot?.gem?.uuid ?? slot?._gemData?.uuid ?? null,
        sourceUuid: slot?.gem?.sourceUuid ?? null,
        slot: SocketAPI.#sanitizeSlot(slot, { includeSnapshots })
      });
    }

    return gems;
  }

  static #sanitizeSlot(slot, { includeSnapshots = false } = {}) {
    const cloned = foundry.utils.deepClone(slot ?? {});
    if (!includeSnapshots && cloned && typeof cloned === "object") {
      delete cloned._gemData;
    }
    return cloned;
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
}
