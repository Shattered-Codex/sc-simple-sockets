import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";

export class SocketDescriptionsUI {
  static #handler = null;
  static SELECTOR = '[data-sc-sockets="socket-descriptions"]';
  static DESCRIPTION_TARGET = "system.description.value";
  static EXPAND_ID = "sc-sockets.socket-descriptions";

  static activate() {
    if (SocketDescriptionsUI.#handler) {
      return;
    }
    SocketDescriptionsUI.#handler = (sheet, html) => {
      void SocketDescriptionsUI.bindToSheet(sheet, html);
    };
    Hooks.on("renderItemSheet5e", SocketDescriptionsUI.#handler);
  }

  static deactivate() {
    if (!SocketDescriptionsUI.#handler) {
      return;
    }
    Hooks.off("renderItemSheet5e", SocketDescriptionsUI.#handler);
    SocketDescriptionsUI.#handler = null;
  }

  static async bindToSheet(sheet, html) {
    const item = sheet?.item;
    if (!item) {
      return;
    }

    const slots = SocketStore.peekSlots(item);
    if (!Array.isArray(slots) || !slots.length) {
      return;
    }

    const root = SocketDescriptionsUI.#rootOf(html ?? sheet?.element);
    if (!root) return;

    const container = root.querySelector(".item-descriptions");
    if (!container || container.querySelector(SocketDescriptionsUI.SELECTOR)) {
      return;
    }

    const descriptionCard = container.querySelector(
      `.card.description[data-target="${SocketDescriptionsUI.DESCRIPTION_TARGET}"]`
    );
    if (!descriptionCard) {
      return;
    }

    const entries = await SocketDescriptionsUI.#buildEntries(item, slots);
    if (!entries.length) {
      return;
    }

    SocketDescriptionsUI.#ensureExpanded(sheet);
    const expanded = sheet?.expandedSections?.get?.(SocketDescriptionsUI.EXPAND_ID) ?? true;
    const collapsible = item.isOwner ?? false;
    const label = Constants.localize("SCSockets.SocketDescriptions.Label", "Socket Descriptions");

    const card = SocketDescriptionsUI.#buildCard({
      label,
      entries,
      collapsible,
      expanded
    });

    card.dataset.scSocketsHostName = item?.name ?? "";
    card.dataset.scSocketsHostImg = item?.img ?? "";

    descriptionCard.after(card);
    SocketDescriptionsUI.#bindActions(card, item);
  }

  static async #buildEntries(item, slots) {
    const getProperty = foundry?.utils?.getProperty;
    const textEditor = Constants.getTextEditor();
    const enrichmentOptions = {
      secrets: item?.isOwner ?? false,
      relativeTo: item,
      rollData: item?.getRollData?.()
    };

    const entries = [];
    for (const slot of slots) {
      if (!slot?.gem) continue;
      const description = typeof getProperty === "function"
        ? getProperty(slot, `_gemData.flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_DESCRIPTION}`)
        : slot?._gemData?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOCKET_DESCRIPTION];
      if (!String(description ?? "").trim().length) {
        continue;
      }
      const enriched = await textEditor?.enrichHTML?.(description, enrichmentOptions) ?? "";
      entries.push({
        name: slot?.gem?.name ?? slot?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty"),
        img: slot?.gem?.img ?? slot?.img ?? Constants.SOCKET_SLOT_IMG,
        description: enriched
      });
    }

    return entries;
  }

  static #buildCard({ label, entries, collapsible, expanded }) {
    const card = document.createElement("div");
    const classes = [
      "card",
      "description",
      collapsible ? "collapsible" : "",
      !expanded ? "collapsed" : ""
    ].filter(Boolean).join(" ");

    card.className = classes;
    card.dataset.scSockets = "socket-descriptions";
    card.dataset.target = SocketDescriptionsUI.EXPAND_ID;
    if (collapsible) {
      card.dataset.action = "toggleCollapsed";
      card.dataset.expandId = SocketDescriptionsUI.EXPAND_ID;
    }

    const sendLabel = Constants.localize(
      "SCSockets.SocketDescriptions.SendToChat",
      "Send to Chat"
    );
    const rows = entries.map((entry) => `
      <div class="sc-sockets-socket-description">
        <img src="${entry.img}" alt="${entry.name}">
        <div class="sc-sockets-socket-description-body">
          <div class="sc-sockets-socket-description-header">
            <strong class="sc-sockets-socket-description-title">${entry.name}</strong>
            <button type="button"
                    class="unbutton control-button always-interactive sc-sockets-socket-description-chat"
                    data-action="sendSocketDescription"
                    data-tooltip="${sendLabel}"
                    aria-label="${sendLabel}">
              <i class="fas fa-comment-dots" inert></i>
            </button>
          </div>
          <div class="sc-sockets-socket-description-text">${entry.description}</div>
        </div>
      </div>
    `).join("");

    card.innerHTML = `
      <div class="header">
        <span>${label}</span>
      </div>
      <div class="details collapsible-content">
        <div class="editor editor-content wrapper">
          <div class="sc-sockets-socket-descriptions">
            ${rows}
          </div>
        </div>
      </div>
    `;

    return card;
  }

  static #bindActions(card, item) {
    if (card?.dataset?.scSocketsBound === "true") {
      return;
    }

    card.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest("[data-action]")
        : null;
      if (!target) return;

      if (target.dataset.action !== "sendSocketDescription") {
        return;
      }

      event.preventDefault();
      const row = target.closest(".sc-sockets-socket-description");
      if (!row) return;

      const imgSrc = row.querySelector("img")?.getAttribute("src") ?? "";
      const title = row.querySelector(".sc-sockets-socket-description-title")?.textContent?.trim() ?? "";
      const description = row.querySelector(".sc-sockets-socket-description-text")?.innerHTML ?? "";

      if (!description.trim()) {
        return;
      }

      const hostName = card.dataset.scSocketsHostName ?? item?.name ?? "";
      const hostImg = card.dataset.scSocketsHostImg ?? item?.img ?? "";
      const hostHeader = hostName || hostImg
        ? `
          <div class="sc-sockets-socket-description-host">
            ${hostImg ? `<img src="${hostImg}" alt="${hostName}">` : ""}
            <strong class="sc-sockets-socket-description-host-title">${hostName}</strong>
          </div>
        `
        : "";

      const content = `
        <div class="sc-sockets-socket-description-chat-card">
          ${hostHeader}
          <div class="sc-sockets-socket-description">
            <img src="${imgSrc}" alt="${title}">
            <div class="sc-sockets-socket-description-body">
              <div class="sc-sockets-socket-description-header">
                <strong class="sc-sockets-socket-description-title">${title}</strong>
              </div>
              <div class="sc-sockets-socket-description-text">${description}</div>
            </div>
          </div>
        </div>
      `;

      await ChatMessage.create({
        user: game.user?.id ?? game.userId,
        speaker: ChatMessage.getSpeaker(),
        content
      });
    });

    card.dataset.scSocketsBound = "true";
  }

  static #ensureExpanded(sheet) {
    if (!sheet?.expandedSections?.has) return;
    if (!sheet.expandedSections.has(SocketDescriptionsUI.EXPAND_ID)) {
      sheet.expandedSections.set(SocketDescriptionsUI.EXPAND_ID, true);
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
