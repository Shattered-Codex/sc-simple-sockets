import { Constants } from "../Constants.js";
import { SocketService } from "../services/SocketService.js";
import { SocketGemSheetService } from "../services/SocketGemSheetService.js";
import { SocketSlotConfigApp } from "../ui/SocketSlotConfigApp.js";
import { SocketTooltipUI } from "../ui/SocketTooltipUI.js";
import { DragHelper } from "../../helpers/DragHelper.js";
import { DialogHelper } from "../../helpers/DialogHelper.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { buildSocketLayoutContext } from "../helpers/socketLayout.js";
import { ItemSheetSync } from "../support/ItemSheetSync.js";

/**
 * Handles all DOM interaction for the Tidy5e socket tab:
 * action listeners, drag-drop, expansion toggle, and tab counter badge.
 */
export class TidySocketTabHandler {
  static #socketTabId = `${Constants.MODULE_ID}-tidy-sockets`;
  static #templatePath = `modules/${Constants.MODULE_ID}/templates/tidy/item-socket-tab.hbs`;

  /**
   * Bind all socket-tab event handlers and update the tab counter.
   * Call this from the socket tab's `onRender` callback.
   */
  static bind(tabContents, sheet) {
    TidySocketTabHandler.#ensureSocketActionHandlers(tabContents, sheet);
    TidySocketTabHandler.#bindExpansionToggle(tabContents);
    DragHelper.bindDropZones(
      tabContents,
      '[data-dropzone="socket-slot"]',
      async ({ data, index }) => {
        const item = ItemSheetSync.syncSheetDocument(sheet, sheet.item);
        await SocketService.addGem(item, index, data);
        await TidySocketTabHandler.refresh(tabContents, sheet);
      }
    );
    SocketTooltipUI.refresh(sheet, tabContents);
    TidySocketTabHandler.updateCounter(sheet);
  }

  /**
   * Rebuild the socket tab HTML from the current item state and rebind handlers.
   * This avoids stale Tidy tab content after document updates that do not fully
   * rebuild custom HtmlTab contents in the same render cycle.
   */
  static async refresh(tabContents, sheet) {
    const item = ItemSheetSync.syncSheetDocument(sheet, sheet?.item);
    if (!(tabContents instanceof HTMLElement) || !item) {
      return;
    }

    const expanded = tabContents.querySelector(".sc-sockets-tidy")?.dataset?.scExpanded !== "false";
    const editable = Boolean(sheet?.isEditable);
    const canManageSockets = editable && ModuleSettings.canAddOrRemoveSocket(game.user);
    const canAddSocketSlot = canManageSockets && ModuleSettings.isItemSocketableByType(item);
    const context = buildSocketLayoutContext(item, {
      editable,
      canManageSockets,
      canAddSocketSlot,
      sockets: SocketService.getSlots(item)
    });

    tabContents.innerHTML = await foundry.applications.handlebars.renderTemplate(
      TidySocketTabHandler.#templatePath,
      context
    );

    const table = tabContents.querySelector(".sc-sockets-tidy");
    if (table) {
      table.dataset.scExpanded = expanded ? "true" : "false";
    }

    TidySocketTabHandler.bind(tabContents, sheet);
  }

  /** Update the filled/total counter badge on the socket tab anchor. */
  static updateCounter(sheet) {
    const item = ItemSheetSync.resolve(sheet?.item);
    if (!item) return;

    const slots = SocketService.getSlots(item);
    const total = Array.isArray(slots) ? slots.length : 0;
    const filled = total ? slots.filter((slot) => slot?.gem).length : 0;

    const anchor = sheet.element?.querySelector?.(`[data-tab-id="${TidySocketTabHandler.#socketTabId}"]`);
    if (!anchor) return;

    let counter = anchor.querySelector(".tab-title-count");
    if (!counter) {
      counter = document.createElement("span");
      counter.classList.add("tab-title-count", "font-data-medium", "theme-dark");
      anchor.appendChild(counter);
    }

    if (!total) {
      counter.textContent = "";
      counter.classList.add("hidden");
    } else {
      counter.textContent = `${filled}/${total}`;
      counter.classList.remove("hidden");
    }
  }

  // ---------------------------------------------------------------------------
  // Private — event handling
  // ---------------------------------------------------------------------------

  static #ensureSocketActionHandlers(root, sheet) {
    if (root.dataset.scSocketsTidyBound === "true") return;

    root.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest("[data-action]")
        : null;
      if (!target) return;

      const action = target.dataset.action;
      switch (action) {
        case "addSocketSlot":
          event.preventDefault();
          await SocketService.addSlot(ItemSheetSync.syncSheetDocument(sheet, sheet.item));
          await TidySocketTabHandler.refresh(root, sheet);
          break;
        case "removeSocketSlot":
          await TidySocketTabHandler.#handleRemoveSocketSlot(event, target, sheet, root);
          break;
        case "removeGemFromSlot":
          await TidySocketTabHandler.#handleRemoveGem(event, target, sheet, root);
          break;
        case "openGemFromSlot":
          await TidySocketTabHandler.#handleOpenGem(event, target, sheet);
          break;
        case "openSocketSlotConfig":
          await TidySocketTabHandler.#handleOpenSocketSlotConfig(event, target, sheet);
          break;
        default:
          break;
      }
    });

    root.dataset.scSocketsTidyBound = "true";
  }

  static async #handleRemoveSocketSlot(event, target, sheet, root) {
    event.preventDefault();
    event.stopPropagation();

    const idx = TidySocketTabHandler.#resolveIndex(target);
    if (idx === null) return;

    if (!event.shiftKey) {
      const ok = await DialogHelper.confirmDeleteSocket();
      if (!ok) return;
    }

    const item = ItemSheetSync.syncSheetDocument(sheet, sheet.item);
    await SocketService.removeGem(item, idx);
    await SocketService.removeSlot(item, idx);
    await TidySocketTabHandler.refresh(root, sheet);
  }

  static async #handleRemoveGem(event, target, sheet, root) {
    event.preventDefault();
    event.stopPropagation();

    const idx = TidySocketTabHandler.#resolveIndex(target);
    if (idx === null) return;

    if (!event.shiftKey) {
      const ok = await DialogHelper.confirmGeneric(
        "SCSockets.Dialogs.RemoveGem.Title",
        "SCSockets.Dialogs.RemoveGem.Message"
      );
      if (!ok) return;
    }

    await SocketService.removeGem(ItemSheetSync.syncSheetDocument(sheet, sheet.item), idx);
    await TidySocketTabHandler.refresh(root, sheet);
  }

  static async #handleOpenGem(event, target, sheet) {
    event.preventDefault();
    event.stopPropagation();

    const idx = TidySocketTabHandler.#resolveIndex(target);
    if (idx === null) return;

    await SocketGemSheetService.openFromHost(ItemSheetSync.syncSheetDocument(sheet, sheet.item), idx);
  }

  static async #handleOpenSocketSlotConfig(event, target, sheet) {
    event.preventDefault();
    event.stopPropagation();

    const idx = TidySocketTabHandler.#resolveIndex(target);
    if (idx === null) return;

    SocketSlotConfigApp.open(ItemSheetSync.syncSheetDocument(sheet, sheet.item), idx, {
      parentApp: sheet,
      editable: sheet?.isEditable && ModuleSettings.canAddOrRemoveSocket(game.user)
    });
  }

  static #resolveIndex(target) {
    const value = target.dataset.index ?? target.closest?.("[data-index]")?.dataset.index;
    const idx = Number(value);
    return Number.isInteger(idx) ? idx : null;
  }

  // ---------------------------------------------------------------------------
  // Private — expansion toggle
  // ---------------------------------------------------------------------------

  static #bindExpansionToggle(tabContents) {
    const table = tabContents?.querySelector?.(".sc-sockets-tidy");
    if (!table || table.dataset.scSocketsToggleBound === "true") return;

    const header = table.querySelector(".tidy-table-header-row");
    const button = table.querySelector(".expand-button");
    const expandable = table.querySelector(".sc-sockets-expandable");
    if (!header || !button || !expandable) return;

    const setExpanded = (expanded) => {
      table.dataset.scExpanded = expanded ? "true" : "false";
      button.classList.toggle("expanded", expanded);
      expandable.classList.toggle("expanded", expanded);
      expandable.style.display = expanded ? "" : "none";
    };

    setExpanded(table.dataset.scExpanded !== "false");

    header.addEventListener("click", (event) => {
      if (event.target.closest("[data-action]") || event.target.closest(".tidy-table-button")) return;
      const expanded = table.dataset.scExpanded !== "false";
      setExpanded(!expanded);
    });

    table.dataset.scSocketsToggleBound = "true";
  }
}
