import { Constants } from "../Constants.js";
import { SocketService } from "./SocketService.js";

export class SocketGemSheetService {
  static async openFromHost(hostItem, slotIndex) {
    const slots = SocketService.getSlots(hostItem);
    const slot = Array.isArray(slots) ? slots[slotIndex] : null;
    if (!slot?.gem && !slot?._gemData) {
      return false;
    }

    const document = await this.#resolveDocument(slot);
    if (document?.sheet?.render) {
      document.sheet.render(true);
      return true;
    }

    const temporary = this.#buildTemporaryDocument(hostItem, slot);
    if (temporary?.sheet?.render) {
      temporary.sheet.render(true);
      return true;
    }

    ui.notifications?.warn?.(
      Constants.localize(
        "SCSockets.Notifications.CannotOpenGem",
        "Could not open the gem item."
      )
    );
    return false;
  }

  static async #resolveDocument(slot) {
    const candidates = [
      slot?.gem?.uuid,
      slot?.gem?.sourceUuid,
      slot?._gemData?.flags?.core?.sourceId
    ].filter((value, index, array) => value && array.indexOf(value) === index);

    for (const uuid of candidates) {
      const resolved = await this.#fromUuid(uuid);
      if (resolved?.documentName === "Item") {
        return resolved;
      }
    }

    return null;
  }

  static #buildTemporaryDocument(hostItem, slot) {
    const payload = foundry.utils.deepClone(slot?._gemData ?? null);
    const ItemDocument = CONFIG?.Item?.documentClass;
    if (!payload || typeof ItemDocument !== "function") {
      return null;
    }

    payload.name ||= slot?.gem?.name ?? slot?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty");
    payload.img ||= slot?.gem?.img ?? slot?.img ?? Constants.SOCKET_SLOT_IMG;

    try {
      return new ItemDocument(payload, { parent: hostItem?.actor ?? null });
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] failed to create temporary gem document`, error);
      return null;
    }
  }

  static async #fromUuid(uuid) {
    if (!uuid) {
      return null;
    }

    if (typeof fromUuidSync === "function") {
      try {
        const resolved = fromUuidSync(uuid);
        if (resolved) {
          return resolved;
        }
      } catch {
      }
    }

    if (typeof fromUuid === "function") {
      try {
        return await fromUuid(uuid);
      } catch {
      }
    }

    return null;
  }
}
