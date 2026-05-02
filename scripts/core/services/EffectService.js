import { Constants } from "../Constants.js";

export class EffectService {
  
  static async applyGemEffects(hostItem, slotIndex, gemItem, options = {}) {
    const src = gemItem.effects?.contents ?? [];
    if (!src.length) {
      return;
    }
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
        data.transfer = true;
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
    await hostItem.createEmbeddedDocuments("ActiveEffect", toCreate, options);
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

  static #getAppliedEnchantmentOrigin(effectData, effect, gemItem, hostItem) {
    const origin = effectData?.origin;
    if (origin && origin !== hostItem?.uuid) {
      return origin;
    }
    return effect?.uuid ?? gemItem?.uuid ?? origin;
  }
}
