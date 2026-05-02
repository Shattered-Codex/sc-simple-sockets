import { Constants } from "../Constants.js";

export class EffectService {
  
  static async applyGemEffects(hostItem, slotIndex, gemItem, options = {}) {
    const src = gemItem.effects?.contents ?? [];
    if (!src.length) {
      return new Map();
    }
    const activityEffectIds = EffectService.#getActivityEffectIds(gemItem);
    const sourceEffectIds = src.map(eff => eff.id);
    const toCreate = src.map(eff => {
      const data = eff.toObject();
      delete data._id;
      data.name ??= eff.name ?? gemItem.name ??
        Constants.localize("SCSockets.Effects.DefaultName", "Gem Effect");
      data.img ??= eff.img ?? gemItem.img;
      data.disabled = false;
      if (EffectService.#isEnchantmentEffect(data)) {
        data.transfer = false;
        data.origin = EffectService.#getAppliedEnchantmentOrigin(data, eff, gemItem, hostItem);
        data.flags ??= {};
        data.flags.dnd5e ??= {};
        data.flags.dnd5e.enchantmentProfile ??= eff.id;
      } else {
        data.transfer = !activityEffectIds.has(eff.id);
        data.origin = hostItem.uuid;
      }
      data.flags ??= {};
      data.flags[Constants.MODULE_ID] ??= {};
      data.flags[Constants.MODULE_ID][Constants.FLAG_SOURCE_GEM] = {
        slot: slotIndex,
        sourceId: eff.id,
        type: data.type ?? "base"
      };
      return data;
    });
    const createdEffects = await hostItem.createEmbeddedDocuments("ActiveEffect", toCreate, options);
    return EffectService.#buildCreatedEffectIdMap(sourceEffectIds, createdEffects);
  }

  static async removeGemEffects(hostItem, slotIndex, options = {}) {
    const list = hostItem.effects?.contents ?? [];
    const ids = list
      .filter(e => e?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM]?.slot === slotIndex)
      .map(e => e.id);
    if (ids.length) {
      await hostItem.deleteEmbeddedDocuments("ActiveEffect", ids, options);
    }
  }

  static #isEnchantmentEffect(effectData) {
    return effectData?.type === "enchantment" || effectData?.flags?.dnd5e?.type === "enchantment";
  }

  static #getActivityEffectIds(item) {
    const ids = new Set();
    for (const activity of item?.system?.activities?.contents ?? []) {
      const effects = activity?.toObject?.()?.effects;
      if (!Array.isArray(effects)) continue;
      for (const effect of effects) {
        const id = String(effect?._id ?? "").trim();
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  static #buildCreatedEffectIdMap(sourceEffectIds, createdEffects) {
    const map = new Map();
    for (const [index, sourceId] of sourceEffectIds.entries()) {
      const createdId = createdEffects?.[index]?.id ?? createdEffects?.[index]?._id ?? null;
      if (sourceId && createdId) {
        map.set(sourceId, createdId);
      }
    }
    return map;
  }

  static #getAppliedEnchantmentOrigin(effectData, effect, gemItem, hostItem) {
    const origin = effectData?.origin;
    if (origin && origin !== hostItem?.uuid) {
      return origin;
    }
    return effect?.uuid ?? gemItem?.uuid ?? origin;
  }
}
