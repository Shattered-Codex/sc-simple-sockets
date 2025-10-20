import { Constants } from "../Constants.js";
import { GemTargetFilterBuilder } from "../../domain/gems/GemTargetFilterBuilder.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { TransferFilterUI } from "../ui/TransferFilterUI.js";
import { SocketTooltipUI } from "../ui/SocketTooltipUI.js";
import { DragHelper } from "../../helpers/DragHelper.js";
import { SocketService } from "../services/SocketService.js";
import { DialogHelper } from "../../helpers/DialogHelper.js";
import { ActorGemBadges } from "../ui/ActorGemBadges.js";

/**
 * Handles registering integrations with the Tidy5e sheet module when available.
 */
export class TidyIntegration {
  static #api = null;
  static #gemExtension = null;
  static #socketExtension = null;

  /**
   * Registers hooks to integrate with tidy5e sheet once its API is available.
   * @param {object} extensions
   * @param {GemSheetExtension} extensions.gemSheetExtension
   * @param {ItemSocketExtension} extensions.itemSocketExtension
   */
  static register({ gemSheetExtension, itemSocketExtension } = {}) {
    TidyIntegration.#gemExtension = gemSheetExtension ?? null;
    TidyIntegration.#socketExtension = itemSocketExtension ?? null;

    Hooks.once("tidy5e-sheet.ready", (api) => {
      if (!api) {
        return;
      }
      TidyIntegration.#api = api;
      TidyIntegration.#registerGemFilter(api);
      TidyIntegration.#registerSocketTab(api);
      TidyIntegration.#registerActorBadges(api);
    });
  }

  static #registerGemFilter(api) {
    if (!TidyIntegration.#gemExtension) {
      return;
    }

    const HandlebarsContent = api.models?.HandlebarsContent;
    if (!HandlebarsContent) {
      return;
    }

    const selector =
      api.getSheetPartSelector?.(api.constants.SHEET_PARTS.ITEM_SHEET_PROPERTIES) ??
      "[data-tidy-sheet-part='item-sheet-properties']";

    api.registerItemContent(
      new HandlebarsContent({
        path: `modules/${Constants.MODULE_ID}/templates/tidy/gem-target-filter.hbs`,
        injectParams: {
          selector,
          position: "beforeend"
        },
        getData: (context) => TidyIntegration.#buildGemFilterData(context),
        enabled: (context) => {
          const item = TidyIntegration.#resolveItem(context);
          return GemCriteria.matches(item);
        },
        onRender: (params) => {
          TransferFilterUI.bindToSheet(params.app, params.element);
        }
      })
    );
  }

  static #registerActorBadges(api) {
    const HtmlContent = api.models?.HtmlContent;
    if (!HtmlContent) {
      return;
    }

    api.registerActorContent(
      new HtmlContent({
        html: "",
        renderScheme: "force",
        onRender: (params) => {
          ActorGemBadges.render(params.app, params.element);
        }
      })
    );
  }

  static #registerSocketTab(api) {
    if (!TidyIntegration.#socketExtension) {
      return;
    }

    const HandlebarsTab = api.models?.HandlebarsTab;
    if (!HandlebarsTab) {
      return;
    }

    const tabId = `${Constants.MODULE_ID}-tidy-sockets`;

    const socketsTab = new HandlebarsTab({
      tabId,
      title: Constants.localize("SCSockets.TabLabel", "Sockets"),
      path: `modules/${Constants.MODULE_ID}/templates/tidy/item-socket-tab.hbs`,
      getData: (context) => TidyIntegration.#buildSocketTabData(context),
      enabled: (context) => {
        const item = TidyIntegration.#resolveItem(context);
        return !!item && TidyIntegration.#socketExtension.isSockeable(item);
      },
      onRender: (params) => TidyIntegration.#onSocketTabRender(params)
    });
    socketsTab.itemCount = (ctx) => {
      const item = ctx?.document ?? ctx?.item ?? null;
      if (!item) return 0;
      const slots = SocketService.getSlots(item);
      if (!Array.isArray(slots) || !slots.length) return 0;
      const filled = slots.filter((slot) => slot?.gem).length;
      return `${filled}/${slots.length}`;
    };

    api.registerItemTab(socketsTab);
  }

  static #buildGemFilterData(context) {
    const item = TidyIntegration.#resolveItem(context);
    const editable = Boolean(
      context?.editable ??
      context?.isEditable ??
      context?.sheet?.isEditable ??
      item?.sheet?.isEditable ??
      false
    );

    const baseId = context?.appId ?? context?.app?.appId ?? Constants.MODULE_ID;

    return GemTargetFilterBuilder.buildContext(item, {
      editable,
      selectId: `${baseId}-gem-target-select`
    });
  }

  static #buildSocketTabData(context) {
    const item = TidyIntegration.#resolveItem(context);
    const editable = Boolean(
      context?.editable ??
      context?.isEditable ??
      context?.sheet?.isEditable ??
      item?.sheet?.isEditable ??
      false
    );

    return {
      editable,
      dataEditable: editable ? "true" : "false",
      sockets: SocketService.getSlots(item)
    };
  }

  static #onSocketTabRender(params) {
    const sheet = params.app;
    const tabContents = params.tabContentsElement ?? params.element;
    if (!sheet || !tabContents) {
      return;
    }

    if (!TidyIntegration.#socketExtension?.isSockeable(sheet.item)) {
      return;
    }

    TidyIntegration.#ensureSocketActionHandlers(tabContents, sheet);
    TidyIntegration.#bindExpansionToggle(tabContents);
    DragHelper.bindDropZones(
      tabContents,
      '[data-dropzone="socket-slot"]',
      async ({ data, index }) => {
        await SocketService.addGem(sheet.item, index, data);
        sheet.render();
      }
    );
    SocketTooltipUI.refresh(sheet, tabContents);
    TidyIntegration.#updateSocketTabCounter(sheet);
  }

  static #ensureSocketActionHandlers(root, sheet) {
    if (root.dataset.scSocketsTidyBound === "true") {
      return;
    }

    root.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest("[data-action]")
        : null;
      if (!target) {
        return;
      }

      const action = target.dataset.action;
      switch (action) {
        case "addSocketSlot":
          event.preventDefault();
          await SocketService.addSlot(sheet.item);
          sheet.render();
          break;
        case "removeSocketSlot":
          await TidyIntegration.#handleRemoveSocketSlot(event, target, sheet);
          break;
        case "removeGemFromSlot":
          await TidyIntegration.#handleRemoveGem(event, target, sheet);
          break;
        default:
          break;
      }
    });

    root.dataset.scSocketsTidyBound = "true";
  }

  static async #handleRemoveSocketSlot(event, target, sheet) {
    event.preventDefault();
    event.stopPropagation();

    const idx = TidyIntegration.#resolveIndex(target);
    if (idx === null) {
      return;
    }

    if (!event.shiftKey) {
      const ok = await DialogHelper.confirmDeleteSocket();
      if (!ok) {
        return;
      }
    }

    await SocketService.removeGem(sheet.item, idx);
    await SocketService.removeSlot(sheet.item, idx);
    sheet.render();
  }

  static async #handleRemoveGem(event, target, sheet) {
    event.preventDefault();
    event.stopPropagation();

    const idx = TidyIntegration.#resolveIndex(target);
    if (idx === null) {
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

    await SocketService.removeGem(sheet.item, idx);
    sheet.render();
  }

  static #resolveIndex(target) {
    const value = target.dataset.index ?? target.closest?.("[data-index]")?.dataset.index;
    const idx = Number(value);
    return Number.isInteger(idx) ? idx : null;
  }

  static #resolveItem(context) {
    return context?.item ??
      context?.document ??
      context?.sheet?.item ??
      context?.app?.item ??
      null;
  }

  static #updateSocketTabCounter(sheet) {
    const item = sheet?.item;
    if (!item) {
      return;
    }

    const slots = SocketService.getSlots(item);
    const total = Array.isArray(slots) ? slots.length : 0;
    const filled = total ? slots.filter((slot) => slot?.gem).length : 0;
    const tabId = `${Constants.MODULE_ID}-tidy-sockets`;
    const anchor = sheet.element?.querySelector?.(`[data-tab-id="${tabId}"]`);
    if (!anchor) {
      return;
    }

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

  static #bindExpansionToggle(tabContents) {
    const table = tabContents?.querySelector?.(".sc-sockets-tidy");
    if (!table || table.dataset.scSocketsToggleBound === "true") {
      return;
    }

    const header = table.querySelector(".tidy-table-header-row");
    const button = table.querySelector(".expand-button");
    const expandable = table.querySelector(".sc-sockets-expandable");
    if (!header || !button || !expandable) {
      return;
    }

    const setExpanded = (expanded) => {
      table.dataset.scExpanded = expanded ? "true" : "false";
      button.classList.toggle("expanded", expanded);
      expandable.classList.toggle("expanded", expanded);
      expandable.style.display = expanded ? "" : "none";
    };

    const toggle = () => {
      const expanded = table.dataset.scExpanded !== "false";
      setExpanded(!expanded);
    };

    setExpanded(table.dataset.scExpanded !== "false");

    header.addEventListener("click", (event) => {
      if (event.target.closest("[data-action]") || event.target.closest(".tidy-table-button")) {
        return;
      }
      toggle();
    });

    table.dataset.scSocketsToggleBound = "true";
  }
}
