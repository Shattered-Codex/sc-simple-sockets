import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { EffectService } from "./EffectService.js";
import { ActivityTransferService } from "./ActivityTransferService.js";
import { InventoryService } from "./InventoryService.js";
import { ItemResolver } from "../ItemResolver.js";
import { SocketSlot } from "../model/SocketSlot.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";

export class SocketService {
  static async addGem(hostItem, idx, source) {
    const slots = SocketStore.getSlots(hostItem);

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return ui.notifications?.warn?.(
        Constants.localize("SCSockets.Notifications.InvalidSocketIndex", "Invalid socket index.")
      );
    }

    let gemItem = null;
    if (typeof source === "string") {
      try {
        gemItem = await fromUuid(source);
      } catch {
      }
    } else if (source?.documentName === "Item") {
      gemItem = source;
    } else {
      gemItem = await ItemResolver.resolveDraggedItem(source);
    }

    if (!gemItem) {
      return ui.notifications?.warn?.(
        Constants.localize("SCSockets.Notifications.CannotResolveItem", "Cannot resolve dropped item.")
      );
    }

    if (!ItemResolver.isGem(gemItem)) {
      return ui.notifications?.warn?.(
        Constants.localize("SCSockets.Notifications.OnlyGems", "Only gems can be socketed.")
      );
    }

    await EffectService.removeGemEffects(hostItem, idx);
    await ActivityTransferService.removeForSlot(hostItem, idx);

    const snap = ItemResolver.snapshotOne(gemItem);
    slots[idx] = SocketSlot.fillFromGem(slots[idx], gemItem, snap, idx);
    await SocketStore.setSlots(hostItem, slots);

    await EffectService.applyGemEffects(hostItem, idx, gemItem);
    await ActivityTransferService.applyFromGem(hostItem, idx, gemItem);
    await InventoryService.consumeOne(gemItem);
  }

  static async removeGem(hostItem, idx) {
    const slots = SocketStore.getSlots(hostItem);

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return;
    }

    const slot = slots[idx] ?? {};

    if (!ModuleSettings.shouldDeleteGemOnRemoval()) {
      try {
        await InventoryService.returnOne(hostItem, slot._gemData);
      } catch (e) {
        console.warn("return inventory failed:", e);
      }
    }

    await EffectService.removeGemEffects(hostItem, idx);
    await ActivityTransferService.removeForSlot(hostItem, idx);
    slots[idx] = SocketSlot.makeDefault();
    await SocketStore.setSlots(hostItem, slots);
    ui.notifications?.info?.(
      Constants.localize("SCSockets.Notifications.GemUnsocketed", "Gem unsocketed.")
    );
  }

  static async addSlot(hostItem) {
    if (!ModuleSettings.canAddOrRemoveSocket()) {
      return;
    }
    const currentSlots = SocketStore.getSlots(hostItem);
    const maxSlots = ModuleSettings.getMaxSockets();
    if (currentSlots.length >= maxSlots) {
      ui.notifications?.warn?.(
        Constants.localize("SCSockets.Notifications.MaxReached", "Maximum number of sockets reached.")
      );
      return;
    }
    return SocketStore.addSlot(hostItem, SocketSlot.makeDefault());
  }

  static async removeSlot(hostItem, idx) {
    if (!ModuleSettings.canAddOrRemoveSocket()) {
      return;
    }
    return SocketStore.removeSlot(hostItem, idx);
  }

  static getSlots(hostItem) {
    return SocketStore.getSlots(hostItem);
  }

}
