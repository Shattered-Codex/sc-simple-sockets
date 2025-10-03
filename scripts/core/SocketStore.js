import { Constants } from "../core/Constants.js";

export class SocketStore {
  static FLAGS = { sockets: "sockets" };

  static getSlots(item) {
    return foundry.utils.duplicate(
      item.getFlag(Constants.MODULE_ID, this.FLAGS.sockets) ?? []
    );
  }

  static async setSlots(item, slots) {
    return item.setFlag(Constants.MODULE_ID, this.FLAGS.sockets, slots);
  }

  static async addSlot(item, defaultSlot) {
    const slots = this.getSlots(item);
    slots.push(foundry.utils.duplicate(defaultSlot));
    return this.setSlots(item, slots);
  }

  static async removeSlot(item, idx) {
    const slots = this.getSlots(item);
    if (idx >= 0 && idx < slots.length) {
      slots.splice(idx, 1);
      return this.setSlots(item, slots);
    }
  }
}
