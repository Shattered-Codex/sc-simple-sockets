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


  static async #returnGemToInventory(hostItem, slot) {
    // slot._gemData foi salvo no addGem (snapshot de 1 unidade, sem _id)
    const data = slot?._gemData;
    if (!data) return; // nada pra devolver

    // Sem ator (ex.: item em compendium) — cria item solto
    const actor = hostItem.actor;
    const payload = foundry.utils.duplicate(data);

    if (!actor) {
      await Item.create(payload);
      return;
    }

    // Tenta empilhar em item existente (mesmo nome e mesmo subtipo "gem")
    const isGem = (i) =>
      i.type === Constants.ITEM_TYPE_LOOT &&
      String(i.system?.type?.value ?? "").toLowerCase() === Constants.ITEM_SUBTYPE_GEM;

    const same = actor.items.find(
      (i) => isGem(i) && i.name === payload.name
    );

    if (same) {
      const qty = Number(same.system?.quantity ?? 1);
      await same.update({ "system.quantity": qty + 1 });
    } else {
      await actor.createEmbeddedDocuments("Item", [payload]);
    }
  }

  static async removeGem(hostItem, idx) {
    const sockets = this.get(hostItem);
    if (!Number.isInteger(idx) || idx < 0 || idx >= sockets.length) return;

    const slot = sockets[idx] ?? {};

    // 1) devolve a gema (tenta empilhar se possível)
    try {
      await this.#returnGemToInventory(hostItem, slot);
    } catch (e) {
      console.warn("Failed to return gem to inventory:", e);
      // mesmo se falhar, seguimos limpando efeitos/slot pra evitar estado inconsistente
    }

    // 2) remove efeitos aplicados por este slot
    await this.#removeGemEffects(hostItem, idx);

    // 3) reseta slot
    sockets[idx] = foundry.utils.duplicate(this.DEFAULT_SLOT);
    await this.set(hostItem, sockets);

    ui.notifications?.info?.("Gem unsocketed.");
  }


  static #snapshotGemData(gemItem) {
    // snapshot limpo para recriar 1 unidade depois (sem _id, qty=1)
    const snap = gemItem.toObject();
    delete snap._id;
    foundry.utils.setProperty(snap, "system.quantity", 1);
    return snap;
  }

  static async #consumeOneFromInventory(gemItem) {
    // se a gema estiver no inventário de alguém, consome 1 unid; senão, ignora
    if (!gemItem?.actor) return;
    const qty = Number(gemItem.system?.quantity ?? 1);
    if (qty > 1) {
      await gemItem.update({ "system.quantity": qty - 1 });
    } else {
      await gemItem.actor.deleteEmbeddedDocuments("Item", [gemItem.id]);
    }
  }

  static #fillSocketRecord(prevSlot, gemItem, gemSnap, slotIndex) {
    // monta o registro do slot com dados úteis pro template e para o "unsocket"
    return {
      ...(prevSlot ?? foundry.utils.duplicate(this.DEFAULT_SLOT)),
      gem: { uuid: gemItem.uuid, name: gemItem.name, img: gemItem.img },
      name: gemItem.name,
      img: gemItem.img,
      _srcGemId: gemItem.id,  // rastreamento (opcional p/ logs/diagnóstico)
      _gemData: gemSnap,      // snapshot para devolver depois ao remover
      _slot: slotIndex        // útil para debug
    };
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

    // normalizar "source" para Item (gem)
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

    // se o slot já tinha algo, remove os efeitos anteriores antes de substituir
    await this.#removeGemEffects(hostItem, idx);

    // snapshot p/ devolver depois, independentemente do item original existir
    const gemSnap = this.#snapshotGemData(gemItem);

    // grava o slot (já deixando pronto p/ "unsocket" recriar a gema)
    sockets[idx] = this.#fillSocketRecord(sockets[idx], gemItem, gemSnap, idx);
    await this.set(hostItem, sockets);

    // aplica efeitos da gema no item host (marcados com FLAG_SOURCE_GEM/slot)
    await this.#applyGemEffects(hostItem, idx, gemItem);

    // por fim, consome 1 unidade da gema do inventário (se houver)
    await this.#consumeOneFromInventory(gemItem);
  }

}
