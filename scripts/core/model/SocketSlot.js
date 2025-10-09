import { Constants } from "../Constants.js";

export class SocketSlot {
  
  static makeDefault() {
    const name = Constants.localize("SCSockets.SocketEmptyName", "Empty");
    return {
      gem: null,
      img: Constants.SOCKET_SLOT_IMG,
      name
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
