// ItemSocketExtension.js
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

  #registerTab() {
    this.addTab({
      tab: ItemSocketExtension.TAB_ID,
      label: "Sockets",
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
    this.addContext(ItemSocketExtension.PART_ID, (sheet, ctx) => {
      ctx.editable = sheet.isEditable;
      ctx.dataEditable = ctx.editable ? "true" : "false";

      // Leia via Service (evita acoplar UI ao store/flags)
      ctx.sockets = SocketService.getSlots(sheet.item);

      // Estado visual da aba
      const node = sheet.element?.querySelector(
        `[data-application-part="${ItemSocketExtension.PART_ID}"]`
      );
      const isActive =
        node?.classList.contains("active") ||
        sheet.tabGroups?.primary === ItemSocketExtension.TAB_ID ||
        sheet._activeTab?.primary === ItemSocketExtension.TAB_ID;

      ctx.tab = {
        id: ItemSocketExtension.TAB_ID,
        group: "primary",
        cssClass: isActive ? "active" : ""
      };
      ctx.partId = ItemSocketExtension.PART_ID;
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

        // garante estado limpo: tira a gema (se houver) e remove o slot
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
            "Remove Gem",
            "Are you sure you want to remove the gem from this slot?"
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
}
