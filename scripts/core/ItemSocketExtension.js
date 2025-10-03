// ItemSocketExtension.js
import { SheetExtension } from "./SheetExtension.js";
import { DialogHelper } from "../helpers/DialogHelper.js";
import { DragHelper } from "../helpers/DragHelper.js";
import { SocketManager } from "./SocketManager.js";

export class ItemSocketExtension extends SheetExtension {
  // Constantes de UI (evita typos e facilita manutenção)
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

    Hooks.on("renderItemSheet5e", (sheet) => this.#bindDnD(sheet));
  }

  // Reutilizável em várias verificações
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
    // Se você renomeou na SheetExtension para addContext, beleza.
    // Caso contrário, troque para this.injectContext(...)
    this.addContext(ItemSocketExtension.PART_ID, (sheet, ctx) => {
      // Dados apenas via service (sem lógica de domínio aqui)
      ctx.editable = sheet.isEditable;
      ctx.dataEditable = ctx.editable ? "true" : "false";

      ctx.sockets = SocketManager.get(sheet.item);

      // Estado de UI (ativo) sem jQuery
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
        await SocketManager.add(this.item);
      },

      async removeSocketSlot(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const idx = Number(
          target.dataset.index ?? target.closest("[data-index]")?.dataset.index
        );
        if (!Number.isInteger(idx)) return;

        if (!event.shiftKey) {
          const ok = await DialogHelper.confirmDeleteSocket();
          if (!ok) return;
        }

        await SocketManager.removeGem(this.item, idx);
        await SocketManager.remove(this.item, idx);
      },

      async removeGemFromSlot(event, target) {
        event.preventDefault();
        event.stopPropagation();

        const idx = Number(
          target.dataset.index ?? target.closest("[data-index]")?.dataset.index
        );
        if (!Number.isInteger(idx)) return;

        if (!event.shiftKey) {
          const ok = await DialogHelper.confirmGeneric('Title', 'Are you sure you want to remove the gem from this slot?');
          if (!ok) return;
        }
        await SocketManager.removeGem(this.item, idx); // -1 = todos 
      }
      
    });
  }

  #bindDnD(sheet) {
    const isSockeable = this.#isSockeable(sheet.item);
    if (!isSockeable) return;

    const root = sheet.element;
    if (!root) return;

    DragHelper.bindDropZones(
      root,
      '[data-dropzone="socket-slot"]', // <- slot, não o container
      async ({ data, index }) => {
        await SocketManager.addGem(sheet.item, index, data); // valida, troca img e copia efeitos
        sheet.render(); // re-render para refletir a imagem do slot
      }
    );
  }
}
