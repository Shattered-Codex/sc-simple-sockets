import { Constants } from "../Constants.js";

export class SocketSlot {
  
  static makeDefault() {
    return {
      gem: null,
      img: `modules/${Constants.MODULE_ID}/assets/imgs/socket-slot.webp`,
      name: "Empty"
    };
  }

  static fillFromGem(prev, gemItem, gemSnap, slotIndex) {
    return {
      ...(prev ?? this.makeDefault()),
      gem: {
        uuid: gemItem.uuid,
        name: gemItem.name,
        img: gemItem.img
      },
      name: gemItem.name,
      img: gemItem.img,
      _srcGemId: gemItem.id,
      _gemData: gemSnap,
      _slot: slotIndex
    };
  }
}
