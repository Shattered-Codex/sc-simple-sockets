import { Constants } from "./Constants.js";
import { SheetExtension } from "./SheetExtension.js";
import { DialogHelper } from "../helpers/DialogHelper.js";
import { DragHelper } from "../helpers/DragHelper.js";
import { SocketService } from "./services/SocketService.js";

export class ItemSocketExtension extends SheetExtension {
  static TAB_ID = "sockets";
  static PART_ID = "item-sockets-part";

  constructor() {
    super(dnd5e.applications.item.ItemSheet5e);
  }

  applyChanges() {
    this.#registerTab();
    this.#registerPart();
    this.#registerContext();
    this.#registerActions();
    Hooks.on("renderItemSheet5e", (sheet) => {
      this.#bindDnD(sheet);
    });
  }

  #isSockeable = this.makeItemCondition({ types: ["weapon", "equipment"] });

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
    const item = sheet?.item ?? null;
    const sockets = SocketService.getSlots(item);
    const context = {
      editable,
      dataEditable: editable ? "true" : "false",
      sockets
    };

    if (includePartId) {
      context.partId = partId;
    }

    if (includeTab) {
      const isActive = this.#isTabActive(sheet, partId);
      context.tab = {
        id: ItemSocketExtension.TAB_ID,
        group: "primary",
        cssClass: isActive ? "active" : ""
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

  #isTabActive(sheet, partId) {
    const node = sheet.element?.querySelector(
      `[data-application-part="${partId}"]`
    );
    if (node?.classList.contains("active")) {
      return true;
    }
    if (sheet.tabGroups?.primary === ItemSocketExtension.TAB_ID) {
      return true;
    }
    if (sheet._activeTab?.primary === ItemSocketExtension.TAB_ID) {
      return true;
    }
    return false;
  }
}
