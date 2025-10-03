import { Constants } from "../Constants.js";

export class EffectService {
  
  static async applyGemEffects(hostItem, slotIndex, gemItem) {
    const src = gemItem.effects?.contents ?? [];
    if (!src.length) {
      return;
    }
    const toCreate = src.map(eff => {
      const data = eff.toObject();
      delete data._id;
      data.name ??= eff.name ?? gemItem.name ?? "Gem Effect";
      data.img ??= eff.img ?? gemItem.img;
      data.disabled = false;
      data.transfer = true;
      data.origin = hostItem.uuid;
      data.flags ??= {};
      data.flags[Constants.MODULE_ID] ??= {};
      data.flags[Constants.MODULE_ID][Constants.FLAG_SOURCE_GEM] = {
        uuid: gemItem.uuid,
        slot: slotIndex
      };
      return data;
    });
    await hostItem.createEmbeddedDocuments("ActiveEffect", toCreate);
  }

  static async removeGemEffects(hostItem, slotIndex) {
    const list = hostItem.effects?.contents ?? [];
    const ids = list
      .filter(e => e?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM]?.slot === slotIndex)
      .map(e => e.id);
    if (ids.length) {
      await hostItem.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
  }
}
