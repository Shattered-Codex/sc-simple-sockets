// SocketManager.js
import { Constants } from "./Constants.js";

export class SocketManager {
  static FLAGS = { sockets: "sockets" };

  static DEFAULT_SLOT = {
    gem: null,
    img: `modules/${Constants.MODULE_ID}/assets/imgs/socket-slot.webp`,
    name: "Empty"
  };

  // ---------- helpers ----------
  static async #resolveDraggedItem(data) {
    const uuid = data?.uuid ?? data?.data?.uuid;
    if (!uuid) return null;
    try { return await fromUuid(uuid); } catch { return null; }
  }

  static #isGem(itemDoc) {
    if (!itemDoc || itemDoc.documentName !== "Item") return false;
    if (itemDoc.type !== Constants.ITEM_TYPE_LOOT) return false;
    const subtype = foundry.utils.getProperty(itemDoc, "system.type.value");
    return String(subtype ?? "").toLowerCase() === Constants.ITEM_SUBTYPE_GEM;
  }

  static get(item) {
    return foundry.utils.duplicate(
      item.getFlag(Constants.MODULE_ID, Constants.FLAGS.sockets) ?? []
    );
  }

  static async set(item, sockets) {
    return item.setFlag(Constants.MODULE_ID, Constants.FLAGS.sockets, sockets);
  }

  static async add(item) {
    const sockets = this.get(item);
    sockets.push(foundry.utils.duplicate(this.DEFAULT_SLOT));
    return this.set(item, sockets);
  }

  static async remove(item, idx) {
    const sockets = this.get(item);
    if (idx >= 0 && idx < sockets.length) {
      sockets.splice(idx, 1);
      return this.set(item, sockets);
    }
  }

  // ---------- efeitos (copiar da gem para o item) ----------
  // Dentro do SocketManager
  static async #applyGemEffects(hostItem, slotIndex, gemItem) {
    const src = gemItem.effects?.contents ?? [];
    if (!src.length) return;

    const toCreate = src.map(eff => {
      // Clona os dados do efeito original no formato certo
      const data = eff.toObject();  // já vem com name/icon/changes/etc.
      delete data._id;              // nunca reutilize _id

      // Garantias e ajustes
      data.name = data.name ?? eff.name ?? gemItem.name ?? "Gem Effect";
      data.img = data.img ?? eff.img ?? gemItem.img;
      data.disabled = false;
      data.transfer = true;  
      data.origin = hostItem.uuid;
      

      // Marca a origem p/ futura remoção pelo slot
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


  // (opcional) remover efeitos desse slot/gema se precisar sobrescrever
  static async #removeGemEffects(hostItem, slotIndex) {
    const list = hostItem.effects?.contents ?? [];
    const ids = list
      .filter(e => e?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM]?.slot === slotIndex)
      .map(e => e.id);
    if (ids.length) await hostItem.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  // ---------- operação principal chamada pelo drop ----------

  static async removeGem(hostItem, idx) {
    const sockets = this.get(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= sockets.length) return;

    // limpa efeitos desse slot
    await this.#removeGemEffects(hostItem, idx);

    // reseta slot
    sockets[idx] = foundry.utils.duplicate(this.DEFAULT_SLOT);
    await this.set(hostItem, sockets);
  }


  /**
   * @param {Item} hostItem  - item que possui sockets
   * @param {number} idx     - índice do socket alvo
   * @param {object|string|Item} source - payload do drop (uuid/objeto/Item)
   */
  static async addGem(hostItem, idx, source) {
    const sockets = this.get(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= sockets.length) {
      ui.notifications?.warn?.("Invalid socket index.");
      return;
    }

    // normalizar para Item (gem)
    let gemItem = null;
    if (typeof source === "string") {
      try { gemItem = await fromUuid(source); } catch { /* ignore */ }
    } else if (source?.documentName === "Item") {
      gemItem = source;
    } else {
      gemItem = await this.#resolveDraggedItem(source);
    }

    if (!gemItem) {
      ui.notifications?.warn?.("Cannot resolve dropped item.");
      return;
    }

    if (!this.#isGem(gemItem)) {
      ui.notifications?.warn?.("Only gems can be socketed.");
      return;
    }

    // (opcional) se quiser substituir, remova efeitos anteriores desse slot
    await this.#removeGemEffects(hostItem, idx);

    // persistir no flag dos sockets (img e name mostram no template)
    sockets[idx] = {
      ...(sockets[idx] ?? foundry.utils.duplicate(this.DEFAULT_SLOT)),
      gem: { uuid: gemItem.uuid, name: gemItem.name, img: gemItem.img },
      name: gemItem.name,
      img: gemItem.img
    };
    await this.set(hostItem, sockets);

    // copiar efeitos da gem para o item host, marcando a origem
    await this.#applyGemEffects(hostItem, idx, gemItem);
  }
}
