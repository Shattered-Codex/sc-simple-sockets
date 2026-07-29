import { Constants } from "../Constants.js";
import { SocketService } from "./SocketService.js";
import { ItemResolver } from "../ItemResolver.js";
import { Compatibility } from "../support/Compatibility.js";

export class SocketGemSheetService {
  static async openFromHost(hostItem, slotIndex, { editable = true } = {}) {
    const slots = SocketService.getSlots(hostItem);
    const slot = Array.isArray(slots) ? slots[slotIndex] : null;
    if (!slot?.gem && !slot?._gemData) {
      return false;
    }

    const temporary = this.#buildTemporaryDocument(hostItem, slot, slotIndex);
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

  static #buildTemporaryDocument(hostItem, slot, slotIndex) {
    const payload = ItemResolver.expandSnapshot(slot?._gemData ?? null);
    const ItemDocument = CONFIG?.Item?.documentClass;
    if (!payload || typeof ItemDocument !== "function") {
      return null;
    }

    payload.name ||= slot?.gem?.name ?? slot?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty");
    payload.img ||= slot?.gem?.img ?? slot?.img ?? Constants.SOCKET_SLOT_IMG;

    try {
      const temporary = new ItemDocument(payload, { parent: hostItem?.actor ?? null });
      // Temporary documents cannot persist their own updates, so actions on the
      // inspected sheet (e.g. the recharge roll) write into the socket instead.
      // The per-socketing instance id (with the gem name as legacy fallback)
      // fingerprints the slot: if the socket's contents change while this
      // sheet stays open, the action is refused instead of hitting whatever
      // gem now sits at the same index.
      temporary[Constants.PROP_SOCKET_SOURCE] = {
        hostItem,
        slotIndex: Number.isInteger(slotIndex) ? slotIndex : Number(slotIndex ?? -1),
        gemName: payload.name ?? null,
        gemInstanceId: slot?._gemInstanceId ?? null
      };
      return temporary;
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] failed to create temporary gem document`, error);
      return null;
    }
  }

  static #renderDocument(document, { editable = true } = {}) {
    const sheet = this.#createRenderSheet(document, { editable });
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

  static #createRenderSheet(document, { editable = true } = {}) {
    if (!document) {
      return null;
    }

    const fallbackSheetClass = Compatibility.getDnd5eItemSheetClass();
    const shouldBypassTidyThemeCrash = !document.uuid && typeof fallbackSheetClass === "function";

    if (!shouldBypassTidyThemeCrash) {
      return document.sheet ?? null;
    }

    const options = {
      editable,
      id: `sc-sockets-temp-gem-${document.id ?? foundry.utils.randomID()}`
    };

    return this.#createSheetInstance(fallbackSheetClass, document, options);
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
