import { Constants } from "../core/Constants.js";

export class EffectHandler {

  static async stash(item) {
    if (!item?.effects?.size) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_STASH);
      return;
    }
    const payload = item.effects.map(e => {
      const data = e.toObject();
      delete data._id;                  
      data.disabled = !!data.disabled;  
      return data;
    });
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_STASH, payload);
  }

  static async removeAll(item) {
    const ids = item.effects.map(e => e.id);
    if (ids.length) {
      await item.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
  }

  static async restore(item, { clearAfter = true } = {}) {
    const payload = item.getFlag(Constants.MODULE_ID, Constants.FLAG_STASH);
    if (!Array.isArray(payload) || !payload.length) return;

    if (item.effects.size) {
      await this.removeAll(item);
    }

    await item.createEmbeddedDocuments("ActiveEffect", payload);
    if (clearAfter) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_STASH);
    }
  }
}
