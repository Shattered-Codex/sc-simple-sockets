import { Constants } from "../Constants.js";

/**
 * The outbound links the module offers: wiki, support popup, and Discord.
 *
 * They used to be registered settings menus, which Foundry renders as a full
 * label + hint + button row each — two rows of vertical space for what are
 * really just links. They are injected as one compact strip at the end of the
 * module's settings section instead.
 */
const LINKS = Object.freeze([
  Object.freeze({
    id: "wiki",
    url: Constants.MODULE_WIKI_URL,
    icon: "fas fa-hat-wizard",
    labelKey: "SCSockets.Settings.DocumentationMenu.Label",
    labelFallback: "Open wiki",
    hintKey: "SCSockets.Settings.DocumentationMenu.Hint",
    hintFallback: "Open the SC - Simple Sockets documentation wiki."
  }),
  Object.freeze({
    id: "patreon",
    icon: "fas fa-heart",
    labelKey: "SCSockets.Settings.SupportMenu.Label",
    labelFallback: "Patreon support",
    hintKey: "SCSockets.Settings.SupportMenu.Hint",
    hintFallback: "Open the Shattered Codex popup with release notes, module highlights, Patreon, Discord, and wiki links.",
    // The support popup is this module's Patreon surface: it carries the
    // release notes and the module showcase, so the button opens it instead of
    // jumping straight to the campaign page. Imported on demand so the strip
    // does not drag the popup application in just to render three buttons.
    open: async () => {
      try {
        const { openSupportCard } = await import("../support/supportCard.js");
        await openSupportCard({ force: true });
      } catch (error) {
        console.warn(`[${Constants.MODULE_ID}] failed to open the support popup`, error);
      }
    }
  }),
  Object.freeze({
    id: "discord",
    url: Constants.DISCORD_URL,
    icon: "fab fa-discord",
    labelKey: "SCSockets.Settings.DiscordLink.Label",
    labelFallback: "Discord",
    hintKey: "SCSockets.Settings.DiscordLink.Hint",
    hintFallback: "Join the Shattered Codex Discord server."
  })
]);

export class CommunityLinks {
  static definitions() {
    return LINKS;
  }

  /** The links with their labels resolved, in the order the strip renders. */
  static links() {
    return LINKS.map((link) => ({
      id: link.id,
      url: link.url ?? "",
      icon: link.icon,
      label: Constants.localize(link.labelKey, link.labelFallback),
      tooltip: Constants.localize(link.hintKey, link.hintFallback)
    }));
  }

  static open(id) {
    const link = LINKS.find((entry) => entry.id === id);
    if (!link) {
      return null;
    }
    if (typeof link.open === "function") {
      void link.open();
      return null;
    }
    globalThis.window?.open?.(link.url, "_blank", "noopener");
    return link.url;
  }

  /**
   * Appends the strip to the module's own settings section. Foundry renders one
   * `section[data-category="<module id>"]` per package, so the strip can be
   * anchored directly instead of walking up from a button.
   */
  static inject(html) {
    const section = CommunityLinks.#moduleSection(html);
    if (!section || section.querySelector(".sc-sockets-community-links")) {
      return null;
    }

    const strip = globalThis.document?.createElement?.("div");
    if (!strip) {
      return null;
    }
    strip.className = "sc-sockets-community-links";
    strip.setAttribute(
      "aria-label",
      Constants.localize("SCSockets.Settings.CommunityLinks.Aria", "Community links")
    );

    for (const link of CommunityLinks.links()) {
      strip.append(CommunityLinks.#button(link));
    }

    section.append(strip);
    return strip;
  }

  static #button(link) {
    const button = globalThis.document.createElement("button");
    button.type = "button";
    button.className = `sc-sockets-community-link sc-sockets-community-link--${link.id}`;
    button.dataset.scSocketsLink = link.id;
    button.setAttribute("data-tooltip", link.tooltip);
    button.setAttribute("aria-label", link.tooltip);

    const icon = globalThis.document.createElement("i");
    icon.className = link.icon;
    icon.setAttribute("inert", "");

    const label = globalThis.document.createElement("span");
    label.textContent = link.label;

    button.append(icon, label);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      // The settings form owns the surrounding submit handler; a stray bubble
      // here would save the whole settings sheet just for opening a link.
      event.stopPropagation();
      CommunityLinks.open(link.id);
    });

    return button;
  }

  static #moduleSection(html) {
    const root = CommunityLinks.#resolveRoot(html);
    if (!root) {
      return null;
    }
    if (root.matches?.(`[data-category="${Constants.MODULE_ID}"]`)) {
      return root;
    }
    return root.querySelector?.(`[data-category="${Constants.MODULE_ID}"]`)
      ?? root.querySelector?.(`[data-tab="${Constants.MODULE_ID}"]`)
      ?? null;
  }

  static #resolveRoot(html) {
    if (!html) {
      return null;
    }
    if (html.jquery || typeof html.get === "function") {
      return html[0] ?? html.get(0) ?? null;
    }
    // Duck-typed rather than `instanceof Element`: every Element has
    // querySelector, and this stays safe where the global is not defined.
    if (typeof html.querySelector === "function") {
      return html;
    }
    return null;
  }
}
