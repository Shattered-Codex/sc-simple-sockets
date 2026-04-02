import { Constants } from "../Constants.js";
import { getSlotConfig, normalizeSlotConfig } from "../helpers/socketSlotConfig.js";

export class SocketSlot {
  
  static makeDefault(config = {}) {
    const slotConfig = normalizeSlotConfig(config);
    const name = slotConfig.name || Constants.localize("SCSockets.SocketEmptyName", "Empty");
    return {
      gem: null,
      img: Constants.SOCKET_SLOT_IMG,
      name,
      slotConfig
    };
  }

  static fillFromGem(prev, gemItem, gemSnap, slotIndex) {
    const sourceUuid =
      gemItem?.flags?.core?.sourceId ??
      globalThis?.foundry?.utils?.getProperty(gemSnap, "flags.core.sourceId") ??
      null;

    const slotConfig = getSlotConfig(prev);

    return {
      ...(prev ?? this.makeDefault()),
      slotConfig,
      gem: {
        uuid: gemItem.uuid,
        sourceUuid,
        name: gemItem.name,
        img: gemItem.img
      },
      name: slotConfig.name || gemItem.name,
      img: gemItem.img,
      _srcGemId: gemItem.id,
      _gemData: gemSnap,
      _slot: slotIndex
    };
  }

  static clearGem(prev, slotIndex) {
    const config = getSlotConfig(prev);
    const base = this.makeDefault(config);
    return {
      ...base,
      slotConfig: config,
      _slot: Number.isInteger(slotIndex) ? slotIndex : prev?._slot ?? null
    };
  }

  static applyConfig(prev, config, slotIndex) {
    const slotConfig = normalizeSlotConfig(config);
    const hasGem = Boolean(prev?.gem);
    const fallbackName = hasGem
      ? (prev?.gem?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty"))
      : Constants.localize("SCSockets.SocketEmptyName", "Empty");

    return {
      ...(prev ?? this.makeDefault()),
      slotConfig,
      name: slotConfig.name || fallbackName,
      _slot: Number.isInteger(slotIndex) ? slotIndex : prev?._slot ?? null
    };
  }
}
