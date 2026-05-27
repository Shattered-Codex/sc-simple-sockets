import { Constants } from "../Constants.js";
import { SelectionController } from "./SelectionController.js";
import { SocketService } from "../services/SocketService.js";

const DEFAULT_OPTIONS = {
  notifications: true
};

const canEditItem = (item) => game.user?.isGM || item?.isOwner;

export class ExtractGemWorkflow {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options
    };
  }

  #notify(level, key, fallback, data) {
    if (!this.options.notifications) return;
    const message = data ? (game.i18n?.format?.(key, data) ?? fallback) : Constants.localize(key, fallback);
    ui.notifications?.[level]?.(message);
  }

  async run() {
    while (true) {
      const selection = await SelectionController.selectSocketSlot({
        notifications: this.options.notifications,
        cursorClass: SelectionController.EXTRACT_CURSOR_CLASS
      });

      if (!selection) {
        this.#notify(
          "info",
          "SCSockets.Macro.ExtractGem.Cancelled",
          "Selection cancelled."
        );
        return { success: false, reason: "cancelled" };
      }

      const item = selection.item ?? null;
      const slotIndex = Number(selection.slotIndex);
      if (!item || !Number.isInteger(slotIndex) || slotIndex < 0) {
        this.#notify(
          "warn",
          "SCSockets.Macro.ExtractGem.InvalidSlot",
          "Could not resolve the clicked socket."
        );
        continue;
      }

      if (!canEditItem(item)) {
        this.#notify(
          "warn",
          "SCSockets.Macro.ExtractGem.ItemPermissionBody",
          `You do not have permission to edit ${item.name}.`,
          { name: item.name ?? "" }
        );
        continue;
      }

      const slot = SocketService.getSlots(item)?.[slotIndex] ?? null;
      const gemName = slot?.gem?.name ?? slot?._gemData?.name ?? "";
      if (!gemName.length) {
        this.#notify(
          "warn",
          "SCSockets.Macro.ExtractGem.EmptySlot",
          "That slot does not contain a gem."
        );
        continue;
      }

      try {
        await SocketService.removeGem(item, slotIndex, {
          mode: SocketService.REMOVE_GEM_MODE_KEEP,
          notify: false
        });
        this.#notify(
          "info",
          "SCSockets.Macro.ExtractGem.Success",
          `Extracted ${gemName} from ${item.name}.`,
          { gem: gemName, name: item.name ?? "" }
        );
        return { success: true, reason: "extracted", item, slotIndex, gemName };
      } catch (error) {
        console.error(`[${Constants.MODULE_ID}] Failed to extract gem via macro workflow`, error);
        this.#notify(
          "error",
          "SCSockets.Macro.ExtractGem.Error",
          "Failed to extract gem. See console for details."
        );
        return { success: false, reason: "error", error };
      }
    }
  }
}
