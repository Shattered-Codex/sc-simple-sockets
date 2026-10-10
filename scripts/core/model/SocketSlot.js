import { Constants } from "../Constants.js";
import { ItemResolver } from "../ItemResolver.js";
import { getSlotConfig, normalizeSlotConfig, resolveSlotFrameImg } from "../helpers/socketSlotConfig.js";

export class SocketSlot {
  
  static makeDefault(config = {}) {
    const slotConfig = normalizeSlotConfig(config);
    const name = slotConfig.name || Constants.localize("SCSockets.SocketEmptyName", "Empty");
    return {
      gem: null,
      img: resolveSlotFrameImg({ slotConfig }),
      name,
      slotConfig
    };
  }

  static fillFromGem(prev, gemItem, gemSnap, slotIndex) {
    const slotConfig = getSlotConfig(prev);
    // dnd5e's prepared document name may be the unidentified alias, even for a
    // GM. The snapshot comes from source data and retains the real identity.
    const source = ItemResolver.getSnapshotMeta(gemSnap);
    const identity = ItemResolver.getSourceMeta(gemItem);
    const name = source?.name || identity.name;
    const img = source?.img || identity.img;

    return {
      ...(prev ?? this.makeDefault()),
      slotConfig,
      gem: {
        name,
        img
      },
      name: slotConfig.name || name,
      img,
      _srcGemId: gemItem.id,
      _gemData: gemSnap,
      // Persistent per-socketing identity: deferred writes (recovery rolls,
      // inspected-gem sheets) validate against it so replacing or reordering
      // same-named gems cannot make them hit another instance.
      _gemInstanceId: foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

    const next = {
      ...(prev ?? this.makeDefault()),
      slotConfig,
      name: slotConfig.name || fallbackName,
      _slot: Number.isInteger(slotIndex) ? slotIndex : prev?._slot ?? null
    };

    // An empty slot displays its configured artwork, so a new frame image has
    // to reach the stored icon as well. A filled slot keeps the gem icon.
    if (!hasGem) {
      next.img = resolveSlotFrameImg({ slotConfig });
    }

    return next;
  }
}
