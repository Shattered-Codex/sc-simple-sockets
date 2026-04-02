import { Constants } from "../Constants.js";
import { SocketService } from "./SocketService.js";

export class SocketGemSheetService {
  static async openFromHost(hostItem, slotIndex, { editable = true } = {}) {
    const slots = SocketService.getSlots(hostItem);
    const slot = Array.isArray(slots) ? slots[slotIndex] : null;
    if (!slot?.gem && !slot?._gemData) {
      return false;
    }

    const document = await this.#resolveDocument(slot);
    if (this.#renderDocument(document, { editable })) {
      return true;
    }

    const temporary = this.#buildTemporaryDocument(hostItem, slot);
    if (this.#renderDocument(temporary, { editable })) {
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

  static async inspectFromHost(hostItem, slotIndex) {
    return this.openFromHost(hostItem, slotIndex, { editable: false });
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

  static #renderDocument(document, { editable = true } = {}) {
    const sheet = document?.sheet;
    if (!sheet?.render) {
      return false;
    }

    if (editable !== false) {
      sheet.render(true);
      return true;
    }

    const SheetClass = sheet.constructor;
    if (typeof SheetClass !== "function") {
      return false;
    }

    try {
      const options = foundry.utils.mergeObject(
        sheet.options ?? {},
        { editable: false },
        { inplace: false }
      );
      const inspectSheet = this.#createSheetInstance(SheetClass, document, options);
      if (!inspectSheet) {
        return false;
      }
      this.#makeSheetReadOnly(inspectSheet);
      inspectSheet.render(true);
      return true;
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] failed to render read-only gem sheet`, error);
      return false;
    }
  }

  static #makeSheetReadOnly(sheet) {
    if (!sheet) {
      return;
    }

    try {
      Object.defineProperty(sheet, "isEditable", {
        configurable: true,
        get: () => false
      });
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] failed to override sheet editability`, error);
    }
  }

  static #createSheetInstance(SheetClass, document, options) {
    try {
      return new SheetClass({
        ...options,
        document
      });
    } catch (error) {
      try {
        return new SheetClass(document, options);
      } catch {
      }

      console.warn(`[${Constants.MODULE_ID}] failed to create gem sheet instance`, error);
      return null;
    }
  }
}
