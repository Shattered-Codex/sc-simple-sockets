import { Constants } from "../core/Constants.js";
import { SocketsController } from "../handlers/SocketsController.js";

/**
 * Sheet que adiciona a aba "Sockets" para itens Weapon e Equipment,
 * reaproveitando o layout padrão do D&D5e.
 */
export class SocketItemSheet extends dnd5e.applications.item.ItemSheet5e {

  /** Regras: apenas weapon e equipment */
  static qualifies(item) {
    return item?.type === "weapon" || item?.type === "equipment";
  }

  /** Adiciona a aba nova ao conjunto de TABS do D&D5e */
  static TABS = [
    ...super.TABS,
    { tab: "sockets", label: "Sockets", condition: (item) => this.qualifies(item) }
  ];

  /** Registra a “parte” da aba e associa à tab "sockets" */
  static PARTS = foundry.utils.mergeObject(super.PARTS, {
    sockets: {
      id: "sockets",
      tab: "sockets", // ESSENCIAL: garante que só renderiza dentro da aba "sockets"
      template: `modules/${Constants.MODULE_ID}/templates/socket-tab.hbs`
    }
  });

  /**
   * Se for a parte "sockets", só adicionamos dados extras ao contexto.
   * Não faça unshift/push em context.parts.
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId !== "sockets") return context;

    // dados que seu HBS pode usar
    context.gbSockets = {
      isGM: game.user.isGM,
      canEdit: this.item.isOwner,
      itemId: this.item.id
    };

    return context;
  }


  /**
   * Registro da Sheet.
   * Dica: se quiser que TODOS os weapons/equipment usem essa sheet,
   * deixe `makeDefault: true`. Se preferir manual (por flag), mude para false.
   */
  static registerSheet() {
    foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, Constants.MODULE_ID, this, {
      types: ["weapon", "equipment"],
      label: "GB: Socket Item Sheet",
      makeDefault: true
    });
  }

  /** adiciona listeners no HTML renderizado */
  static get DEFAULT_OPTIONS() {
    const opts = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, { actions: {} });

    opts.actions["add-socket"] = function (evt, target) { return this._onAddSocket(evt, target); };
    opts.actions["add-hidden-socket"] = function (evt, target) { return this._onAddHiddenSocket(evt, target); };
    opts.actions["delete-socket"] = function (evt, target) { return this._onDeleteSocket(evt, target); };
    opts.actions["toggle-socket"] = function (evt, target) { return this._onToggleSocket(evt, target); };
    opts.actions["remove-gem"] = function (evt, target) { return this._onRemoveGem(evt, target); };

    return opts;
  }

  // Handlers de ação (nota: "this" aqui é a INSTÂNCIA, não a classe)
  async _onAddSocket(_evt, _target) {
    await SocketsController.addSlot(this.item, { hidden: false });
  }

  async _onAddHiddenSocket(_evt, _target) {
    await SocketsController.addSlot(this.item, { hidden: true });
  }

  async _onDeleteSocket(_evt, target) {
    const slot = Number(target.closest(".socket-row")?.dataset.slot);
    await SocketsController.deleteSlot(this.item, slot);
  }

  async _onToggleSocket(_evt, target) {
    const slot = Number(target.closest(".socket-row")?.dataset.slot);
    await SocketsController.toggleHidden(this.item, slot);
  }

  async _onRemoveGem(_evt, target) {
    const slot = Number(target.closest(".socket-row")?.dataset.slot);
    await SocketsController.removeGemWithSourceId(this.item, slot);
  }


  async _attachPartListeners(partId, html) {
    await super._attachPartListeners(partId, html);
    if (partId !== "sockets") return;

    html.addEventListener("drop", async (event) => {
      event.preventDefault();
      const row = event.target.closest?.(".socket-row");
      const slot = row ? Number(row.dataset.slot) : null;

      let data;
      try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
      catch { return; }
      if (data?.type !== "Item") return;

      const dropped = await Item.implementation.fromDropData(data);
      await SocketsController.socketGemWithSourceId(this.item, dropped, { slot });
      this.render(false);
    });
  }

}
