import { Constants } from "../core/Constants.js";

export class EffectHandler {

  /** Guarda os efeitos atuais em uma flag do item (sem _id) */
  static async stash(item) {
    if (!item?.effects?.size) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_STASH);
      return;
    }
    const payload = item.effects.map(e => {
      const data = e.toObject();
      delete data._id;                  // sempre deixar o Foundry gerar novos ids
      data.disabled = !!data.disabled;  // normaliza
      return data;
    });
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_STASH, payload);
  }

  /** Remove todos os efeitos atuais do item */
  static async removeAll(item) {
    const ids = item.effects.map(e => e.id);
    if (ids.length) {
      await item.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
  }

  /** Restaura os efeitos guardados na flag */
  static async restore(item, { clearAfter = true } = {}) {
    const payload = item.getFlag(Constants.MODULE_ID, Constants.FLAG_STASH);
    if (!Array.isArray(payload) || !payload.length) return;

    // evita duplicar — limpa se ainda houver efeitos ativos
    if (item.effects.size) {
      await this.removeAll(item);
    }

    await item.createEmbeddedDocuments("ActiveEffect", payload);
    if (clearAfter) {
      await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_STASH);
    }
  }
}
