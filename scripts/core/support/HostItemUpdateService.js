import { ItemSheetSync } from "./ItemSheetSync.js";

export class HostItemUpdateService {
  static resolve(hostItem) {
    const item = ItemSheetSync.resolve(hostItem);
    if (!item?.id) {
      return item ?? null;
    }

    const actorItem = item.actor?.items?.get?.(item.id);
    if (actorItem) {
      return actorItem;
    }

    const worldItem = game?.items?.get?.(item.id);
    if (worldItem) {
      return worldItem;
    }

    return item;
  }

  static async update(hostItem, data, options = {}) {
    const item = HostItemUpdateService.resolve(hostItem);
    if (!item) {
      return null;
    }

    if (item.actor) {
      const [updated] = await item.actor.updateEmbeddedDocuments("Item", [{
        _id: item.id,
        ...data
      }], options);
      return updated ?? item.actor.items.get(item.id) ?? item;
    }

    const operation = {
      ...options,
      parent: null,
      parentUuid: null
    };
    if (item.pack) {
      operation.pack = item.pack;
    }

    try {
      const [updated] = await item.constructor.updateDocuments([{
        _id: item.id,
        ...data
      }], operation);
      return updated ?? game?.items?.get?.(item.id) ?? item;
    } catch (error) {
      console.error("[sc-simple-sockets] HostItemUpdateService.update failed", {
        error,
        itemUuid: item?.uuid ?? null,
        itemId: item?.id ?? null,
        itemParentDocumentName: item?.parent?.documentName ?? null,
        itemParentUuid: item?.parent?.uuid ?? null,
        optionsParentDocumentName: options?.parent?.documentName ?? null,
        optionsParentUuid: options?.parent?.uuid ?? null,
        optionsParentUuidRaw: options?.parentUuid ?? null,
        operationParentDocumentName: operation?.parent?.documentName ?? null,
        operationParentUuid: operation?.parent?.uuid ?? null,
        operationParentUuidRaw: operation?.parentUuid ?? null
      });
      throw error;
    }
  }
}
