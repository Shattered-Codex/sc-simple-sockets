import { SocketStore } from "../SocketStore.js";
import { EffectService } from "./EffectService.js";
import { InventoryService } from "./InventoryService.js";
import { ItemResolver } from "../ItemResolver.js";
import { SocketSlot } from "../model/SocketSlot.js";
import { Constants } from "../Constants.js";

export class SocketService {
  static async addGem(hostItem, idx, source) {
    const slots = SocketStore.getSlots(hostItem);

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return ui.notifications?.warn?.("Invalid socket index.");
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
      return ui.notifications?.warn?.("Cannot resolve dropped item.");
    }

    if (!ItemResolver.isGem(gemItem)) {
      return ui.notifications?.warn?.("Only gems can be socketed.");
    }

    await EffectService.removeGemEffects(hostItem, idx);

    const snap = ItemResolver.snapshotOne(gemItem);
    slots[idx] = SocketSlot.fillFromGem(slots[idx], gemItem, snap, idx);
    await SocketStore.setSlots(hostItem, slots);

    await EffectService.applyGemEffects(hostItem, idx, gemItem);
    await InventoryService.consumeOne(gemItem);
  }

  static async removeGem(hostItem, idx) {
    const slots = SocketStore.getSlots(hostItem);

    if (!Number.isInteger(idx) || idx < 0 || idx >= slots.length) {
      return;
    }

    const slot = slots[idx] ?? {};

    try {
      await InventoryService.returnOne(hostItem, slot._gemData);
    } catch (e) {
      console.warn("return inventory failed:", e);
    }

    await EffectService.removeGemEffects(hostItem, idx);
    slots[idx] = SocketSlot.makeDefault();
    await SocketStore.setSlots(hostItem, slots);
    ui.notifications?.info?.("Gem unsocketed.");
  }

  static async addSlot(hostItem) {
    if (!this.hasRequiredPermission("editSocketPermission")) {
      return;
    }
    return SocketStore.addSlot(hostItem, SocketSlot.makeDefault());
  }

  static async removeSlot(hostItem, idx) {
    if (!this.hasRequiredPermission("editSocketPermission")) {
      return;
    }
    return SocketStore.removeSlot(hostItem, idx);
  }

  static getSlots(hostItem) {
    return SocketStore.getSlots(hostItem);
  }

  static hasRequiredPermission(permissionConfig) {
    const requiredEditGemRole = game.settings.get(Constants.MODULE_ID, permissionConfig);
    if (game.user.role == requiredEditGemRole) {
      const roleName = Object.keys(CONST.USER_ROLES).find(key => CONST.USER_ROLES[key] == requiredEditGemRole);
      ui.notifications?.warn?.(`Requires at least ${roleName} role.`);
      return false;
    }
    return true;
  }
}
