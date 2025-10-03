import { Constants } from "../core/Constants.js";
import { GemstoneItemSheet } from "../sheets/GemstoneItemSheet.js";

export class SocketsController {
  static getSockets(item, { includeHidden = true } = {}) {
    const data = item.getFlag(Constants.MODULE_ID, Constants.FLAG_SOCKETS) ?? [];
    return includeHidden ? data : data.filter(s => !s.hidden);
  }

  static async saveSockets(item, sockets) {
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_SOCKETS, sockets);
  }

  static findFirstEmptySlot(sockets) {
    for (let i = 0; i < sockets.length; i++) {
      if (!sockets[i]?.gem) return i;
    }
    return -1;
  }

  static ensureArray(arr) {
    return Array.isArray(arr) ? arr : [];
  }

  static duplicateEffectFromGem(effect, gemId) {
    const data = foundry.utils.duplicate(effect);
    data.disabled = false;
    foundry.utils.setProperty(data, `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOURCE_GEM}`, gemId);
    delete data._id; // deixa o Foundry gerar novo id
    return data;
  }

  static async transferGemEffectsToItem(gem, item) {
    if (!gem?.effects?.size) return;
    const effects = gem.effects.map(e => this.duplicateEffectFromGem(e, gem.id));
    await item.createEmbeddedDocuments("ActiveEffect", effects);
  }

  static async removeGemEffectsFromItem(gem, item) {
    const toRemove = item.effects
      .filter(e => e.getFlag(Constants.MODULE_ID, Constants.FLAG_SOURCE_GEM) === gem.id)
      .map(e => e.id);
    if (toRemove.length) {
      await item.deleteEmbeddedDocuments("ActiveEffect", toRemove);
    }
  }

  static isGemDocument(doc) {
    return GemstoneItemSheet.qualifies(doc); // já checa loot→gem
  }

  /**
   * Socket a gem no item.
   * - se slot === null, usa primeiro vazio.
   * - se gem veio do ator e quantity>1, decrementa, senão remove do ator.
   */
  static async socketGem(item, gem, { slot = null } = {}) {
    if (!this.isGemDocument(gem)) {
      ui.notifications?.warn("Isso não é uma gema válida.");
      return false;
    }

    const sockets = this.ensureArray(this.getSockets(item));
    if (!sockets.length) {
      ui.notifications?.warn("Não há slots disponíveis.");
      return false;
    }

    let target = slot ?? this.findFirstEmptySlot(sockets);
    if (target < 0) {
      ui.notifications?.warn("Não há slots vazios.");
      return false;
    }

    if (sockets[target]?.gem) {
      ui.notifications?.warn("Esse slot já está ocupado.");
      return false;
    }

    // clona a gema para “embedar” no slot (sem _id e com quantity=1)
    const gemData = gem.toObject();
    delete gemData._id;
    foundry.utils.setProperty(gemData, "system.quantity", 1);

    sockets[target] = foundry.utils.mergeObject(sockets[target] ?? {}, { gem: gemData });
    await this.saveSockets(item, sockets);

    // transfere efeitos
    await this.transferGemEffectsToItem(gem, item);

    // consome a gema da origem (se existir)
    if (gem.actor) {
      if ((gem.system?.quantity ?? 1) > 1) {
        await gem.update({ "system.quantity": gem.system.quantity - 1 });
      } else {
        await gem.actor.deleteEmbeddedDocuments("Item", [gem.id]);
      }
    }

    return true;
  }

  static async removeGem(item, slotIndex) {
    const sockets = this.ensureArray(this.getSockets(item));
    const slot = sockets[slotIndex];
    if (!slot || !slot.gem) return false;

    // tenta devolver a gema ao ator (se houver)
    const gemData = foundry.utils.duplicate(slot.gem);
    try {
      if (item.actor) await item.actor.createEmbeddedDocuments("Item", [gemData]);
      else await Item.create(gemData);
    } catch(_e) {
      // falhou devolver? ainda assim prossegue removendo do slot
    }

    // remove efeitos da gema daquele item
    // OBS: aqui precisamos de um "gem id" — como slot.gem é clonado sem _id,
    // usamos uma heurística: removemos todos efeitos marcados como da "mesma" gema
    // -> melhor: marcar o ID original antes de clonar
  }

  /**
   * Melhoria: para conseguir remover efeitos com precisão, salvamos o _id original da gema no slot.
   */
  static async socketGemWithSourceId(item, gem, { slot = null } = {}) {
    if (!this.isGemDocument(gem)) {
      ui.notifications?.warn("Isso não é uma gema válida.");
      return false;
    }

    const sockets = this.ensureArray(this.getSockets(item));
    if (!sockets.length) {
      ui.notifications?.warn("Não há slots disponíveis.");
      return false;
    }

    let target = slot ?? this.findFirstEmptySlot(sockets);
    if (target < 0) {
      ui.notifications?.warn("Não há slots vazios.");
      return false;
    }

    if (sockets[target]?.gem) {
      ui.notifications?.warn("Esse slot já está ocupado.");
      return false;
    }

    const originalId = gem.id;
    const gemData = gem.toObject();
    delete gemData._id;
    foundry.utils.setProperty(gemData, "system.quantity", 1);

    sockets[target] = foundry.utils.mergeObject(sockets[target] ?? {}, {
      gem: gemData,
      _srcGemId: originalId, // <<< guarda o id original para remoção dos efeitos
    });
    await this.saveSockets(item, sockets);

    await this.transferGemEffectsToItem(gem, item);

    if (gem.actor) {
      if ((gem.system?.quantity ?? 1) > 1) await gem.update({ "system.quantity": gem.system.quantity - 1 });
      else await gem.actor.deleteEmbeddedDocuments("Item", [gem.id]);
    }

    return true;
  }

  static async removeGemWithSourceId(item, slotIndex) {
    const sockets = this.ensureArray(this.getSockets(item));
    const slot = sockets[slotIndex];
    if (!slot || !slot.gem) return false;

    // devolve a gema
    const gemData = foundry.utils.duplicate(slot.gem);
    try {
      if (item.actor) await item.actor.createEmbeddedDocuments("Item", [gemData]);
      else await Item.create(gemData);
    } catch(_e) {}

    // remove efeitos
    if (slot._srcGemId) {
      // a gema original ainda existe? (pode já ter sido consumida)
      const maybeGem = game.items.get(slot._srcGemId) || item.actor?.items?.get?.(slot._srcGemId);
      if (maybeGem) {
        await this.removeGemEffectsFromItem(maybeGem, item);
      } else {
        // fallback: remove efeitos marcados com o source id
        const toRemove = item.effects
          .filter(e => e.getFlag(Constants.MODULE_ID, Constants.FLAG_SOURCE_GEM) === slot._srcGemId)
          .map(e => e.id);
        if (toRemove.length) await item.deleteEmbeddedDocuments("ActiveEffect", toRemove);
      }
    }

    // limpa o slot
    delete slot.gem;
    delete slot._srcGemId;
    sockets[slotIndex] = slot;
    await this.saveSockets(item, sockets);

    return true;
  }

  static async addSlot(item, { hidden = false } = {}) {
    const sockets = this.ensureArray(this.getSockets(item, { includeHidden: true }));
    sockets.push({ gem: null, hidden: !!hidden });
    await this.saveSockets(item, sockets);
  }

  static async deleteSlot(item, slotIndex) {
    const sockets = this.ensureArray(this.getSockets(item, { includeHidden: true }));
    sockets.splice(slotIndex, 1);
    await this.saveSockets(item, sockets);
  }

  static async toggleHidden(item, slotIndex) {
    const sockets = this.ensureArray(this.getSockets(item, { includeHidden: true }));
    sockets[slotIndex].hidden = !sockets[slotIndex].hidden;
    await this.saveSockets(item, sockets);
  }
}
