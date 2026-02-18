import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";

export class TidySocketDescriptionsUI {
  static SELECTOR = '[data-sc-sockets="socket-descriptions-tidy"]';

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

  static #buildEditor({ label, entries, item }) {
    const section = document.createElement("section");
    section.className = "collapsible-editor sc-sockets-tidy-editor";
    section.dataset.scSockets = "socket-descriptions-tidy";

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

    section.innerHTML = `
      <header>
        <a class="title">
          ${label}
          <i class="fas fa-angle-right fa-fw expand-indicator expanded"></i>
        </a>
        <div role="presentation" class="gold-header-underline"></div>
      </header>
      <div class="expandable expanded" role="presentation">
        <div role="presentation" class="expandable-child-animation-wrapper">
          <div class="editor">
            <div class="user-select-text">
              <div class="sc-sockets-socket-descriptions">
                ${rows}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    section.dataset.scSocketsHostName = item?.name ?? "";
    section.dataset.scSocketsHostImg = item?.img ?? "";
    section.dataset.scSocketsExpanded = "true";
    return section;
  }

  static async renderInto(target, item, app = null) {
    const root = target?.closest
      ? (target.closest(".item-descriptions") ?? target.closest(".tidy-tab.description") ?? target)
      : target;
    if (!root) return;

    root.querySelectorAll(TidySocketDescriptionsUI.SELECTOR).forEach((node) => node.remove());

    if (!item) {
      return;
    }

    const slots = SocketStore.peekSlots(item);
    if (!Array.isArray(slots) || !slots.length) {
      return;
    }

    const entries = await TidySocketDescriptionsUI.#buildEntries(item, slots);
    if (!entries.length) {
      return;
    }

    const label = Constants.localize("SCSockets.SocketDescriptions.Label", "Socket Descriptions");
    const section = TidySocketDescriptionsUI.#buildEditor({
      label,
      entries,
      item
    });

    const descriptionItem = root.querySelector(".collapsible-editor") ?? null;
    if (descriptionItem?.after) {
      descriptionItem.after(section);
    } else {
      root.append(section);
    }

    TidySocketDescriptionsUI.#bindActions(section);

    Hooks.callAll(Constants.HOOK_TIDY_SOCKET_DESCRIPTIONS_RENDERED, {
      app,
      item,
      root,
      section,
      target,
    });

    // No-op: keep the original node to avoid removing the sheet root.
  }

  static #bindActions(section) {
    if (section?.dataset?.scSocketsBound === "true") {
      return;
    }

    section.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement
        ? event.target.closest("[data-action]")
        : null;

      if (target?.dataset.action === "sendSocketDescription") {
        event.preventDefault();
        const row = target.closest(".sc-sockets-socket-description");
        if (!row) return;

        const imgSrc = row.querySelector("img")?.getAttribute("src") ?? "";
        const title = row.querySelector(".sc-sockets-socket-description-title")?.textContent?.trim() ?? "";
        const description = row.querySelector(".sc-sockets-socket-description-text")?.innerHTML ?? "";
        if (!description.trim()) {
          return;
        }

        const hostName = section.dataset.scSocketsHostName ?? "";
        const hostImg = section.dataset.scSocketsHostImg ?? "";
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
        return;
      }

      const toggle = event.target instanceof HTMLElement
        ? event.target.closest("header .title")
        : null;
      if (toggle) {
        event.preventDefault();
        TidySocketDescriptionsUI.#toggleExpanded(section);
      }
    });

    section.dataset.scSocketsBound = "true";
  }

  static #toggleExpanded(section) {
    const expanded = section.dataset.scSocketsExpanded !== "false";
    const next = !expanded;
    section.dataset.scSocketsExpanded = next ? "true" : "false";
    section.querySelector(".expand-indicator")?.classList.toggle("expanded", next);
    const content = section.querySelector(".expandable");
    if (content) {
      content.classList.toggle("expanded", next);
      content.style.display = next ? "" : "none";
    }
  }

  // Rendering is driven by TidyIntegration custom content hooks.
}
