import { Constants } from "../Constants.js";
import { getSlotConfig, normalizeSlotConfig } from "../helpers/socketSlotConfig.js";

export class SocketSlot {
  
  static makeDefault() {
    const name = Constants.localize("SCSockets.SocketEmptyName", "Empty");
    return {
      gem: null,
      img: Constants.SOCKET_SLOT_IMG,
      name,
      slotConfig: normalizeSlotConfig()
    };
  }

  static fillFromGem(prev, gemItem, gemSnap, slotIndex) {
    const sourceUuid =
      gemItem?.flags?.core?.sourceId ??
      globalThis?.foundry?.utils?.getProperty(gemSnap, "flags.core.sourceId") ??
      null;

    return {
      ...(prev ?? this.makeDefault()),
      slotConfig: getSlotConfig(prev),
      gem: {
        uuid: gemItem.uuid,
        sourceUuid,
        name: gemItem.name,
        img: gemItem.img
      },
      name: gemItem.name,
      img: gemItem.img,
      _srcGemId: gemItem.id,
      _gemData: gemSnap,
      _slot: slotIndex
    };
  }

  static clearGem(prev, slotIndex) {
    const base = this.makeDefault();
    return {
      ...base,
      slotConfig: getSlotConfig(prev),
      _slot: Number.isInteger(slotIndex) ? slotIndex : prev?._slot ?? null
    };
  }

  static applyConfig(prev, config, slotIndex) {
    return {
      ...(prev ?? this.makeDefault()),
      slotConfig: normalizeSlotConfig(config),
      _slot: Number.isInteger(slotIndex) ? slotIndex : prev?._slot ?? null
    };
  }
}
