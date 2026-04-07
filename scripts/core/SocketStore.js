import { Constants } from "../core/Constants.js";
import { ItemResolver } from "./ItemResolver.js";
import { HostItemUpdateService } from "./support/HostItemUpdateService.js";

export class SocketStore {

  static getSlots(item) {
    const slots = this.peekSlots(item);
    return foundry.utils.duplicate(slots);
  }

  static async setSlots(item, slots, options = {}) {
    const normalizedSlots = ItemResolver.normalizeSocketSlots(foundry.utils.deepClone(slots ?? []));
    return HostItemUpdateService.update(item, {
      [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: normalizedSlots
    }, options);
  }

  static async addSlot(item, defaultSlot) {
    const slots = this.getSlots(item);
    slots.push(defaultSlot);
    return this.setSlots(item, slots);
  }

  static async removeSlot(item, idx) {
    const slots = this.getSlots(item);
    if (idx >= 0 && idx < slots.length) {
      slots.splice(idx, 1);
      return this.setSlots(item, slots);
    }
  }

  static peekSlots(item) {
    const slots = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAGS.sockets);
    return Array.isArray(slots) ? slots : [];
  }
}
