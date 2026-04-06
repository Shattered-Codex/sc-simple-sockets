import { Constants } from "./Constants.js";
import { GemCriteria } from "../domain/gems/GemCriteria.js";
import { normalizeSlotConfig } from "./helpers/socketSlotConfig.js";

export class ItemResolver {
  static async resolveDraggedItem(data) {
    const uuid = data?.uuid ?? data?.data?.uuid;
    if (!uuid) {
      return null;
    }
    try {
      return await fromUuid(uuid);
    } catch (error) {
      if (Constants.isDebugEnabled()) {
        console.debug(`[${Constants.MODULE_ID}] Could not resolve dragged item from uuid "${uuid}":`, error);
      }
      return null;
    }
  }

  static isGem(itemDoc) {
    return GemCriteria.matches(itemDoc);
  }

  static snapshotOne(gemItem) {
    const full = gemItem.toObject();
    delete full._id;
    foundry.utils.setProperty(full, "system.quantity", 1);
    return ItemResolver.compactSnapshot(full);
  }

  static normalizeSocketSlots(slots) {
    if (!Array.isArray(slots)) {
      return slots;
    }

    for (let index = 0; index < slots.length; index += 1) {
      slots[index] = ItemResolver.sanitizeSocketSlot(slots[index], { slotIndex: index });
    }

    return slots;
  }

  static sanitizeSocketSlot(slot, { slotIndex = null } = {}) {
    const snapshotMeta = ItemResolver.getSnapshotMeta(slot?._gemData);
    const gem = slot?.gem || snapshotMeta?.name
      ? {
        name: slot?.gem?.name ?? snapshotMeta?.name ?? null,
        img: slot?.gem?.img ?? snapshotMeta?.img ?? null
      }
      : null;
    const img = gem?.img ?? slot?.img ?? Constants.SOCKET_SLOT_IMG;
    const defaultName = gem?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty");

    return {
      gem,
      img,
      name: typeof slot?.name === "string" && slot.name.length ? slot.name : defaultName,
      slotConfig: normalizeSlotConfig(slot?.slotConfig),
      _gemData: slot?._gemData ? ItemResolver.compactSnapshot(slot._gemData) : null,
      _slot: Number.isInteger(slotIndex) ? slotIndex : (Number.isInteger(slot?._slot) ? slot._slot : null)
    };
  }

  static expandSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return null;
    }

    const encodedData = typeof snapshot.data === "string" ? snapshot.data : null;
    if (encodedData?.length) {
      try {
        return JSON.parse(encodedData);
      } catch (error) {
        console.warn(`[${Constants.MODULE_ID}] failed to decode stored gem snapshot`, error);
      }
    }

    const encoded = snapshot._source;
    if (typeof encoded === "string" && encoded.length) {
      try {
        return JSON.parse(encoded);
      } catch (error) {
        console.warn(`[${Constants.MODULE_ID}] failed to decode stored gem snapshot`, error);
      }
    }

    return foundry.utils.deepClone(snapshot);
  }

  static getSnapshotMeta(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return null;
    }

    const getProperty = foundry?.utils?.getProperty;
    const read = (path, fallback = null) => (
      typeof getProperty === "function"
        ? getProperty(snapshot, path) ?? fallback
        : fallback
    );

    return {
      name: snapshot.name ?? null,
      img: snapshot.img ?? null,
      description: snapshot.description
        ?? read("system.description.value", "")
        ?? "",
      socketDescription: snapshot.socketDescription
        ?? read(`flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_DESCRIPTION}`, "")
        ?? ""
    };
  }

  static getSlotGemMeta(slot) {
    const snapshotMeta = ItemResolver.getSnapshotMeta(slot?._gemData);
    return {
      name: slot?.gem?.name ?? snapshotMeta?.name ?? null,
      img: slot?.gem?.img ?? snapshotMeta?.img ?? null
    };
  }

  static compactSnapshot(snapshot) {
    const source = snapshot?.toObject?.() ?? snapshot;
    if (!source || typeof source !== "object") {
      return null;
    }

    if (ItemResolver.#isEnvelopeSnapshot(source)) {
      return {
        name: source.name ?? "",
        img: source.img ?? "",
        description: source.description ?? "",
        socketDescription: source.socketDescription ?? "",
        data: typeof source.data === "string" ? source.data : ""
      };
    }

    const full = foundry.utils.deepClone(source);
    delete full._id;
    foundry.utils.setProperty(full, "system.quantity", 1);

    const encodedSource = ItemResolver.#getEncodedSnapshotSource(source, full);
    const meta = ItemResolver.getSnapshotMeta(full);

    return {
      name: full.name ?? "",
      img: full.img ?? "",
      description: meta?.description ?? "",
      socketDescription: meta?.socketDescription ?? "",
      data: encodedSource
    };
  }

  static #getEncodedSnapshotSource(source, full) {
    if (typeof source.data === "string" && source.data.length) {
      return source.data;
    }
    if (typeof source._source === "string" && source._source.length) {
      return source._source;
    }
    return JSON.stringify(full);
  }

  static #isEnvelopeSnapshot(snapshot) {
    return Boolean(
      snapshot
      && typeof snapshot === "object"
      && typeof snapshot.data === "string"
      && !Object.prototype.hasOwnProperty.call(snapshot, "system")
      && !Object.prototype.hasOwnProperty.call(snapshot, "flags")
    );
  }
}
