import { Constants } from "../Constants.js";

const api = foundry?.applications?.api ?? {};
const { ApplicationV2 } = api;
if (!ApplicationV2) {
  throw new Error(`${Constants.MODULE_ID}: ApplicationV2 is required to render DocumentationMenu.`);
}

const DOCUMENTATION_MENU_KEY = `${Constants.MODULE_ID}.docsMenu`;

export class DocumentationMenu extends ApplicationV2 {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: `${Constants.MODULE_ID}-documentation-menu`,
    window: {
      title: Constants.localize("SCSockets.Settings.DocumentationMenu.Name", "Documentation"),
      resizable: false,
      icon: "fas fa-hat-wizard"
    },
    position: {
      width: 420,
      height: "auto"
    }
  }, { inplace: false });

  render(..._args) {
    DocumentationMenu.openDocs();
    return this;
  }

  static openDocs() {
    window?.open?.(Constants.MODULE_WIKI_URL, "_blank", "noopener");
  }

  static bindSettingsButton(html) {
    const root = DocumentationMenu.#resolveRoot(html);
    if (!root) return;

    const selectors = [
      `[data-setting-id="${DOCUMENTATION_MENU_KEY}"]`,
      `[data-menu-id="${DOCUMENTATION_MENU_KEY}"]`,
      `[data-key="${DOCUMENTATION_MENU_KEY}"]`,
      `[data-setting="${DOCUMENTATION_MENU_KEY}"]`
    ];
    const candidates = root.querySelectorAll(selectors.join(","));
    for (const candidate of candidates) {
      candidate.classList.add("scsockets-docs-setting-row");

      const button = candidate instanceof HTMLButtonElement
        ? candidate
        : candidate.querySelector("button");
      if (!button) continue;
      button.classList.add("scsockets-docs-button");
      if (button.dataset.scSocketsDocsBound === "true") continue;
      button.dataset.scSocketsDocsBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        DocumentationMenu.openDocs();
      }, { capture: true });
    }
  }

  static #resolveRoot(html) {
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
