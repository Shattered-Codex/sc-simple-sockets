import { Constants } from "../Constants.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";

export class GemSocketDescriptionUI {
  static #handler = null;
  static SELECTOR = '[data-sc-sockets="socket-description"]';
  static DESCRIPTION_TARGET = "system.description.value";

  static activate() {
    if (GemSocketDescriptionUI.#handler) {
      return;
    }
    GemSocketDescriptionUI.#handler = (sheet, html) => {
      void GemSocketDescriptionUI.bindToSheet(sheet, html);
    };
    Hooks.on("renderItemSheet5e", GemSocketDescriptionUI.#handler);
  }

  static deactivate() {
    if (!GemSocketDescriptionUI.#handler) {
      return;
    }
    Hooks.off("renderItemSheet5e", GemSocketDescriptionUI.#handler);
    GemSocketDescriptionUI.#handler = null;
  }

  static async bindToSheet(sheet, html) {
    const item = sheet?.item;
    if (!GemCriteria.matches(item)) {
      return;
    }

    const root = GemSocketDescriptionUI.#rootOf(html ?? sheet?.element);
    if (!root) return;

    const container = root.querySelector(".item-descriptions");
    if (!container || container.querySelector(GemSocketDescriptionUI.SELECTOR)) {
      return;
    }

    const descriptionCard = container.querySelector(
      `.card.description[data-target="${GemSocketDescriptionUI.DESCRIPTION_TARGET}"]`
    );
    if (!descriptionCard) {
      return;
    }

    const target = `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_DESCRIPTION}`;
    const rawValue = foundry?.utils?.getProperty?.(item?._source ?? item, target) ?? "";
    const enrichmentOptions = {
      secrets: item?.isOwner ?? false,
      relativeTo: item,
      rollData: item?.getRollData?.()
    };
    const textEditor = Constants.getTextEditor();
    const enriched = await textEditor?.enrichHTML?.(rawValue, enrichmentOptions) ?? "";

    GemSocketDescriptionUI.#ensureExpanded(sheet, target);
    const expanded = sheet?.expandedSections?.get?.(target) ?? true;
    const collapsible = item?.isOwner ?? false;
    const isEmpty = !String(rawValue ?? "").trim().length;
    const label = Constants.localize("SCSockets.SocketDescription.Label", "Socket Description");
    const editLabel = game?.i18n?.format
      ? game.i18n.format("DND5E.DescriptionEdit", { description: label })
      : label;

    const card = GemSocketDescriptionUI.#buildCard({
      target,
      label,
      editLabel,
      enriched,
      collapsible,
      expanded,
      isEmpty,
      isEditable: sheet?.isEditable ?? false
    });

    descriptionCard.after(card);
  }

  static #buildCard({
    target,
    label,
    editLabel,
    enriched,
    collapsible,
    expanded,
    isEmpty,
    isEditable
  }) {
    const card = document.createElement("div");
    const classes = [
      "card",
      "description",
      collapsible ? "collapsible" : "",
      !expanded ? "collapsed" : "",
      isEmpty ? "empty" : ""
    ].filter(Boolean).join(" ");
    const editButton = isEditable
      ? `<button type="button" class="unbutton control-button always-interactive" data-action="editDescription"
                aria-label="${editLabel}" data-target="${target}">
            <i class="fas fa-feather" inert></i>
         </button>`
      : "";

    card.className = classes;
    card.dataset.scSockets = "socket-description";
    card.dataset.target = target;
    if (collapsible) {
      card.dataset.action = "toggleCollapsed";
      card.dataset.expandId = target;
    }

    card.innerHTML = `
      <div class="header">
        <span>${label}</span>
        ${editButton}
      </div>
      <div class="details collapsible-content">
        <div class="editor editor-content wrapper">
          ${enriched}
        </div>
      </div>
    `;

    return card;
  }

  static #ensureExpanded(sheet, target) {
    if (!sheet?.expandedSections?.has) return;
    if (!sheet.expandedSections.has(target)) {
      sheet.expandedSections.set(target, true);
    }
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") {
      return html[0] ?? html.get(0) ?? null;
    }
    if (html instanceof Element || html?.querySelector) {
      return html;
    }
    return null;
  }
}
