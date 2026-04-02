import { Constants } from "./Constants.js";
import { SheetExtension } from "./SheetExtension.js";
import { DialogHelper } from "../helpers/DialogHelper.js";
import { DragHelper } from "../helpers/DragHelper.js";
import { SocketService } from "./services/SocketService.js";
import { ModuleSettings } from "./settings/ModuleSettings.js";
import { SocketGemSheetService } from "./services/SocketGemSheetService.js";
import { buildSocketLayoutContext } from "./helpers/socketLayout.js";
import { SocketSlotConfigApp } from "./ui/SocketSlotConfigApp.js";

export class ItemSocketExtension extends SheetExtension {
  static TAB_ID = "sockets";
  static PART_ID = "item-sockets-part";
  static DETAILS_TOGGLE_PART_ID = "sc-sockets-item-toggle-part";

  constructor() {
    super(dnd5e.applications.item.ItemSheet5e);
  }

  applyChanges() {
    this.#registerTab();
    this.#registerPart();
    this.#registerDetailsToggleInline();
    this.#registerContext();
    this.#registerActions();
    Hooks.on("renderItemSheet5e", (sheet) => {
      this.#bindDnD(sheet);
    });
  }

  #isSockeable = (item) => ModuleSettings.isItemSocketTabVisible(item);

  /**
   * Checks if an item can receive sockets.
   * @param {Item|object} item
   * @returns {boolean}
   */
  isSockeable(item) {
    return this.#isSockeable(item);
  }

  /**
   * Builds the context consumed by the socket tab template.
   * @param {ItemSheet} sheet
   * @param {object} [options]
   * @param {boolean} [options.includeTab=true]
   * @param {boolean} [options.includePartId=true]
   * @param {string} [options.partId=ItemSocketExtension.PART_ID]
   * @returns {object}
   */
  buildSocketTabContext(sheet, {
    includeTab = true,
    includePartId = true,
    partId = ItemSocketExtension.PART_ID
  } = {}) {
    const editable = !!sheet?.isEditable;
    const canManageSockets = editable && ModuleSettings.canAddOrRemoveSocket(game.user);
    const canAddSocketSlot = canManageSockets && ModuleSettings.isItemSocketableByType(sheet?.item);
    const item = sheet?.item ?? null;
    const sockets = SocketService.getSlots(item);
    const context = buildSocketLayoutContext(item, {
      editable,
      canManageSockets,
      canAddSocketSlot,
      sockets
    });

    if (includePartId) {
      context.partId = partId;
    }

    if (includeTab) {
      const isActive = this.#isTabActive(sheet);
      context.tab = {
        id: ItemSocketExtension.TAB_ID,
        group: "primary",
        cssClass: isActive ? "active" : ""
      };
    }

    return context;
  }

  buildItemSocketTabToggleContext(sheet, {
    includePart = true,
    partId = ItemSocketExtension.DETAILS_TOGGLE_PART_ID,
    tab = "details",
    group = "primary"
  } = {}) {
    const item = sheet?.item ?? null;
    const hasSockets = ModuleSettings.itemHasSockets(item);
    const locked = ModuleSettings.isItemSocketTabToggleLocked(item);
    const checked = hasSockets || ModuleSettings.isItemSocketTabEnabledByFlag(item);
    const visible = ModuleSettings.isItemSocketTabToggleVisible(item);
    const context = {
      visible,
      heading: Constants.localize(
        "SCSockets.ItemDetails.CustomDetailsHeading",
        "Custom Details"
      ),
      label: Constants.localize(
        "SCSockets.ItemDetails.EnableSocketTab",
        "Enable Socket Tab"
      ),
      hint: Constants.localize(
        "SCSockets.ItemDetails.EnableSocketTabHint",
        "Show the Sockets tab on this item when the global display setting is disabled."
      ),
      lockHint: locked
        ? Constants.localize(
          "SCSockets.ItemDetails.EnableSocketTabLockedHint",
          "Items that already have sockets keep this option enabled until all sockets are removed."
        )
        : "",
      name: ModuleSettings.getItemSocketTabFieldName(),
      inputId: partId ? `${partId}-checkbox` : `${Constants.MODULE_ID}-item-socket-toggle`,
      checked,
      disabled: locked
    };

    const tooltipLines = [context.hint, context.lockHint].filter((value) => String(value ?? "").trim().length);
    context.tooltip = tooltipLines.join("\n");

    if (includePart) {
      context.part = {
        id: partId,
        tab,
        group,
        cssClass: this.#isPartActive(sheet, partId, tab) ? "active" : ""
      };
    }

    return context;
  }

  #registerTab() {
    this.addTab({
      tab: ItemSocketExtension.TAB_ID,
      label: Constants.localize("SCSockets.TabLabel", "Sockets"),
      condition: this.#isSockeable
    });
  }

  #registerPart() {
    this.addPart({
      id: ItemSocketExtension.PART_ID,
      tab: ItemSocketExtension.TAB_ID,
      template: `modules/${this.moduleId}/templates/socket-tab.hbs`
    });
  }

  #registerDetailsToggleInline() {
    const templatePath = `modules/${this.moduleId}/templates/item-socket-details-toggle.hbs`;
    const partId = ItemSocketExtension.DETAILS_TOGGLE_PART_ID;

    this.addContext("details", (sheet, context) => {
      const toggle = this.buildItemSocketTabToggleContext(sheet, {
        includePart: false,
        partId
      });

      if (!toggle.visible) {
        return;
      }

      context.parts = Array.isArray(context.parts) ? context.parts : [];
      if (!context.parts.includes(templatePath)) {
        context.parts.push(templatePath);
      }

      return {
        socketTabToggle: toggle
      };
    });
  }

  #registerContext() {
    this.addContext(ItemSocketExtension.PART_ID, (sheet) => {
      return this.buildSocketTabContext(sheet);
    });
  }

  #registerActions() {
    this.addActions({
      async addSocketSlot(event) {
        event.preventDefault();
        await SocketService.addSlot(this.item);
        this.sheet?.render();
      },

      async removeSocketSlot(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const idx = Number(target.dataset.index ?? target.closest("[data-index]")?.dataset.index);
        if (!Number.isInteger(idx)) {
          return;
        }

        if (!event.shiftKey) {
          const ok = await DialogHelper.confirmDeleteSocket();
          if (!ok) {
            return;
          }
        }

        await SocketService.removeGem(this.item, idx);
        await SocketService.removeSlot(this.item, idx);
        this.sheet?.render();
      },

      async removeGemFromSlot(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const idx = Number(target.dataset.index ?? target.closest("[data-index]")?.dataset.index);
        if (!Number.isInteger(idx)) {
          return;
        }

        if (!event.shiftKey) {
          const ok = await DialogHelper.confirmGeneric(
            "SCSockets.Dialogs.RemoveGem.Title",
            "SCSockets.Dialogs.RemoveGem.Message"
          );
          if (!ok) {
            return;
          }
        }

        await SocketService.removeGem(this.item, idx);
        this.sheet?.render();
      },

      async openGemFromSlot(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const idx = Number(target.dataset.index ?? target.closest("[data-index]")?.dataset.index);
        if (!Number.isInteger(idx)) {
          return;
        }

        await SocketGemSheetService.openFromHost(this.item, idx);
      },

      async openSocketSlotConfig(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const idx = Number(target.dataset.index ?? target.closest("[data-index]")?.dataset.index);
        if (!Number.isInteger(idx)) {
          return;
        }

        SocketSlotConfigApp.open(this.item, idx, {
          parentApp: this.sheet,
          editable: this.sheet?.isEditable && ModuleSettings.canAddOrRemoveSocket(game.user)
        });
      }
    });
  }

  #bindDnD(sheet) {
    if (!this.#isSockeable(sheet.item)) {
      return;
    }
    const root = sheet.element;
    if (!root) {
      return;
    }

    DragHelper.bindDropZones(
      root,
      '[data-dropzone="socket-slot"]',
      async ({ data, index }) => {
        await SocketService.addGem(sheet.item, index, data);
        sheet.render();
      }
    );
  }

  #isTabActive(sheet) {
    if (sheet.tabGroups?.primary === ItemSocketExtension.TAB_ID) {
      return true;
    }
    if (sheet._activeTab?.primary === ItemSocketExtension.TAB_ID) {
      return true;
    }
    return false;
  }

  #isPartActive(sheet, partId, tab) {
    if (!sheet) {
      return false;
    }
    const node = sheet.element?.querySelector?.(`[data-application-part="${partId}"]`);
    if (node?.classList?.contains?.("active")) {
      return true;
    }
    if (sheet.tabGroups?.primary === tab) {
      return true;
    }
    if (sheet._activeTab?.primary === tab) {
      return true;
    }
    return false;
  }
}
