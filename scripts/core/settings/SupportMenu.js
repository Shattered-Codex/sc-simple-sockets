import { Constants } from "../Constants.js";

const api = foundry?.applications?.api ?? {};
const { ApplicationV2 } = api;
if (!ApplicationV2) {
  throw new Error(`${Constants.MODULE_ID}: ApplicationV2 is required to render SupportMenu.`);
}
const PATREON_URL = "https://www.patreon.com/c/shatteredcodex";
const SUPPORT_MENU_KEY = `${Constants.MODULE_ID}.supportMenu`;

export class SupportMenu extends ApplicationV2 {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: `${Constants.MODULE_ID}-support-menu`,
    window: {
      title: Constants.localize("SCSockets.Settings.SupportMenu.Name", "Support the developer"),
      resizable: false,
      icon: "fas fa-heart"
    },
    position: {
      width: 420,
      height: "auto"
    }
  }, { inplace: false });

  render(...args) {
    SupportMenu.openPatreon();
    return this;
  }

  static openPatreon() {
    window?.open?.(PATREON_URL, "_blank", "noopener");
  }

  static bindSettingsButton(html) {
    const root = SupportMenu.#resolveRoot(html);
    if (!root) return;

    const selectors = [
      `[data-setting-id="${SUPPORT_MENU_KEY}"]`,
      `[data-menu-id="${SUPPORT_MENU_KEY}"]`,
      `[data-key="${SUPPORT_MENU_KEY}"]`,
      `[data-setting="${SUPPORT_MENU_KEY}"]`
    ];
    const candidates = root.querySelectorAll(selectors.join(","));
    for (const candidate of candidates) {
      const button = candidate instanceof HTMLButtonElement
        ? candidate
        : candidate.querySelector("button");
      if (!button) continue;
      if (button.dataset.scSocketsSupportBound === "true") continue;
      button.dataset.scSocketsSupportBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        SupportMenu.openPatreon();
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
