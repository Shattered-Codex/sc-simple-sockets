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

    Hooks.once("tidy5e-sheet.ready", (api) => TidyIntegration.#onApiReady(api));

    // Handle the case where tidy fires before our module registers the hook.
    const existingApi = globalThis.tidy5eSheetApi ?? game?.modules?.get?.("tidy5e-sheet")?.api;
    if (existingApi) {
      TidyIntegration.#onApiReady(existingApi);
    }

    Hooks.on("updateItem", (item, changes) => {
      if (!GemCriteria.hasTypeUpdate(changes)) {
        return;
      }
      void TidyIntegration.#syncTabConfiguration(item);
    });

    Hooks.on("renderItemSheet", (sheet, element) => {
      if (!sheet?.constructor?.name?.toLowerCase?.()?.includes?.("tidy")) {
        return;
      }
      void TidyIntegration.#ensureGemFilterRendered(sheet, element[0] ?? element);
    });
  }

  static #onApiReady(api) {
    if (!api || TidyIntegration.#api) {
      return;
    }
    TidyIntegration.#api = api;
    TidyIntegration.#registerGemFilter(api);
    TidyIntegration.#registerSocketTab(api);
    TidyIntegration.#registerActorBadges(api);
    TidyIntegration.#associateExistingTabs(api);
  }

  static #registerGemFilter(api) {
    if (!TidyIntegration.#gemExtension) {
      return;
    }

    const HandlebarsContent = api.models?.HandlebarsContent;
    if (!HandlebarsContent) {
      return;
    }

    // Target the tab contents for Details directly (Quadrone).
    const selector = ".tidy-tab-contents[data-tab='details']";

    api.registerItemContent(
      new HandlebarsContent({
        path: `modules/${Constants.MODULE_ID}/templates/tidy/gem-target-filter.hbs`,
        injectParams: {
          selector,
          position: "beforeend"
        },
        layout: api.constants?.SHEET_LAYOUTS?.ALL ?? "all",
        getData: (context) => TidyIntegration.#buildGemFilterData(context),
        enabled: (context) => {
          const item = TidyIntegration.#resolveItem(context);
          return GemCriteria.matches(item);
        },
        renderScheme: "handlebars",
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

  static #associateExistingTabs(api) {
    if (typeof api?.associateExistingItemTab !== "function") {
      return;
    }

    const tabIds = ["activities", "effects"];
    const buildOptions = () => ({
      includeAsDefault: true,
      tabCondition: {
        predicate: (context) => {
          const item = TidyIntegration.#resolveItem(context) ?? null;
          if (item) {
            return GemCriteria.matches(item);
          }
          const subtype = foundry?.utils?.getProperty?.(context, "system.type.value");
          return GemCriteria.matches({
            type: Constants.ITEM_TYPE_LOOT,
            system: { type: { value: subtype } }
          });
        },
        mode: "overwrite"
      }
    });

    for (const tabId of tabIds) {
      api.associateExistingItemTab(Constants.ITEM_TYPE_LOOT, tabId, buildOptions());
      TidyIntegration.#forceDefaultLootTabs(api, tabId);
    }
  }

  static #forceDefaultLootTabs(api, tabId) {
    const runtime = api?.runtime?.ItemSheetQuadroneRuntime;
    const sheetMap = runtime?._sheetMap;
    if (!sheetMap?.get) return;

    const lootConfig = sheetMap.get(Constants.ITEM_TYPE_LOOT);
    if (!lootConfig?.defaultTabs) return;

    if (!lootConfig.defaultTabs.includes(tabId)) {
      lootConfig.defaultTabs.push(tabId);
    }

    const tab = runtime?._tabs?.find?.((t) => t.id === tabId);
    if (tab?.types instanceof Set && !tab.types.has(Constants.ITEM_TYPE_LOOT)) {
      tab.types.add(Constants.ITEM_TYPE_LOOT);
    }
  }

  static async #syncTabConfiguration(item, sheet) {
    const isGem = GemCriteria.matches(item);

    const runtime = TidyIntegration.#api?.runtime?.ItemSheetQuadroneRuntime;
    const defaults = runtime?.getDefaultTabIds?.(item?.type) ?? [];
    const allTabs = runtime?.getAllRegisteredTabs?.(item?.type) ?? [];
    const baseList = (() => {
      const current = item?.getFlag?.("tidy5e-sheet", "tab-configuration") ?? {};
      if (Array.isArray(current.selected) && current.selected.length) {
        return current.selected;
      }
      if (defaults.length) {
        return defaults;
      }
      return allTabs.map((t) => t.id);
    })();

    const desired = [];
    const ensureIds = new Set(isGem ? ["activities", "effects"] : []);

    for (const id of baseList) {
      if (!desired.includes(id)) {
        desired.push(id);
      }
      ensureIds.delete(id);
    }

    if (isGem && ensureIds.size) {
      for (const id of ensureIds) {
        desired.push(id);
      }
    }

    if (!isGem) {
      // Remove Activities/Effects when leaving gem subtype.
      const filtered = desired.filter((id) => !["activities", "effects"].includes(id));
      desired.length = 0;
      desired.push(...filtered);
    }

    const current = item?.getFlag?.("tidy5e-sheet", "tab-configuration") ?? {};
    const selected = Array.isArray(current.selected) ? current.selected : [];
    const changed = desired.length !== selected.length ||
      desired.some((id) => !selected.includes(id));

    if (!changed) {
      return;
    }

    const nextConfig = {
      ...current,
      selected: desired
    };

    await item.setFlag("tidy5e-sheet", "tab-configuration", nextConfig);
    if (sheet?.render) {
      sheet.render(false);
    }
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
    const partId = `${Constants.MODULE_ID}-sc-sockets-gem-target-filter`;

    return GemTargetFilterBuilder.buildContext(item, {
      editable,
      selectId: `${baseId}-gem-target-select`,
      part: {
        id: partId,
        tab: "details",
        group: "primary",
        cssClass: ""
      }
    });
  }

  static async #ensureGemFilterRendered(sheet, root, attempt = 0) {
    try {
      const item = sheet?.item;
      if (!GemCriteria.matches(item)) {
        return;
      }

      const existing = root?.querySelector?.("[data-tidy-section-key='sc-sockets-gem-target-filter']");
      if (existing) {
        return;
      }

      const partSelector = ".tidy-tab-contents[data-tab='details']";
      const candidates = [
        () => root?.querySelector?.(partSelector),
        () => root?.querySelector?.("[data-tidy-sheet-part='item-sheet-details']"),
        () => root?.querySelector?.("section.tidy-tab-contents[data-tab='details']"),
        () => root?.querySelector?.(".tidy-tab-contents[data-tab='details']"),
        () => root?.querySelector?.(".tab[data-tab='details'][data-group]"),
        () => root?.querySelector?.("[data-tab='details']"),
        () => root
      ];

      let target = null;
      for (const getter of candidates) {
        target = getter();
        if (target) break;
      }
      if (!target) {
        if (attempt < 3) {
          setTimeout(() => TidyIntegration.#ensureGemFilterRendered(sheet, root, attempt + 1), 50);
        }
        return;
      }

      const data = TidyIntegration.#buildGemFilterData({ item, sheet, appId: sheet?.appId });
      const renderFn = globalThis?.foundry?.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
      const render = async () => {
        const html = await renderFn(
          `modules/${Constants.MODULE_ID}/templates/tidy/gem-target-filter.hbs`,
          { gemTargetFilter: data }
        );
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        const content = wrapper.firstElementChild;
        if (content) {
          target.appendChild(content);
          TransferFilterUI.bindToSheet(sheet, content);
        }
      };

      // Ensure we inject after Tidy finishes its own layout pass.
      const schedule = () => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => render());
        } else {
          setTimeout(() => render(), 0);
        }
      };
      schedule();
    } catch (err) {
      console.error(`[${Constants.MODULE_ID}] Failed to inject gem filter into Tidy sheet`, err);
    }
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

    void TidyIntegration.#syncTabConfiguration(sheet.item, sheet);

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
