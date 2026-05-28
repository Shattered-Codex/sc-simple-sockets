import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { buildSupportCardContent } from "../support/SupportCardContent.js";

const api = foundry?.applications?.api ?? {};
const { ApplicationV2, HandlebarsApplicationMixin } = api;
if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render SupportCardApp.`);
}

const BaseApplication = HandlebarsApplicationMixin(ApplicationV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/support/support-popup.hbs`;

function resolveRoot(app) {
  if (app?.element instanceof HTMLElement) return app.element;
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  if (app?.form instanceof HTMLElement) return app.form;
  return null;
}

export class SupportCardApp extends BaseApplication {
  #moduleTitle;
  #moduleVersion;
  #strings;
  #catalog;
  #releaseSections;
  #links;
  #currentSlide = 0;
  #suppressUntilNextUpdate = true;
  #onClose;
  #didPersist = false;

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-support-popup`,
      tag: "section",
      classes: ["sc-sockets", "scsockets-support-popup-window"],
      position: { width: 1000, height: 720 },
      window: {
        title: "SC - Simple Sockets - What's New",
        icon: "fas fa-circle",
        contentClasses: ["scsockets-support-popup-window"],
        resizable: true
      }
    },
    { inplace: false }
  );

  static PARTS = {
    content: {
      template: TEMPLATE_PATH
    }
  };

  constructor({ moduleTitle, moduleVersion, suppressUntilNextUpdate = true, onClose = null } = {}) {
    super();

    const content = buildSupportCardContent(moduleVersion);
    this.#moduleTitle = moduleTitle || "SC - Simple Sockets";
    this.#moduleVersion = moduleVersion || "unknown";
    this.#strings = content.strings;
    this.#catalog = content.catalog;
    this.#releaseSections = content.releaseSections;
    this.#links = content.links;
    this.#suppressUntilNextUpdate = suppressUntilNextUpdate !== false;
    this.#onClose = typeof onClose === "function" ? onClose : null;
  }

  async _preparePartContext(partId, context = {}, options) {
    const base = await super._preparePartContext?.(partId, context, options) ?? context;
    if (partId !== "content") {
      return base;
    }

    const currentSlide = this.#catalog[this.#currentSlide] ?? this.#catalog[0] ?? null;
    return foundry.utils.mergeObject(base ?? {}, {
      moduleTitle: this.#moduleTitle,
      moduleVersion: this.#moduleVersion,
      strings: this.#strings,
      slide: currentSlide,
      slides: this.#catalog.map((entry, index) => ({
        id: entry.id,
        index,
        active: index === this.#currentSlide,
        ariaLabel: `${entry.name} (${index + 1})`
      })),
      releaseSections: this.#releaseSections,
      links: this.#links,
      suppressUntilNextUpdate: this.#suppressUntilNextUpdate
    }, { inplace: false });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = resolveRoot(this);
    if (!root) return;

    if (root.dataset.scSocketsSupportBound !== "true") {
      root.dataset.scSocketsSupportBound = "true";
      this.#bindListeners(root);
    }

    this.#renderSlide(root);
    this.#applyViewportBounds();
  }

  async close(options = {}) {
    await this.#persistPreference();

    try {
      return await super.close(options);
    } finally {
      this.#onClose?.(this);
    }
  }

  #bindListeners(root) {
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
      if (!(target instanceof HTMLElement)) return;

      const action = String(target.dataset.action ?? "").trim();
      switch (action) {
        case "close":
          event.preventDefault();
          void this.close();
          return;
        case "prev-slide":
          event.preventDefault();
          this.#stepSlide(-1, root);
          return;
        case "next-slide":
          event.preventDefault();
          this.#stepSlide(1, root);
          return;
        case "go-slide": {
          event.preventDefault();
          const index = Number(target.dataset.slideIndex);
          this.#goToSlide(index, root);
          return;
        }
        case "open-module":
          event.preventDefault();
          this.#openCurrentModule();
          return;
        default:
          return;
      }
    });

    root.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.name !== "suppressSupportCard") return;
      this.#suppressUntilNextUpdate = target.checked;
    });
  }

  #stepSlide(delta, root) {
    if (!this.#catalog.length) return;
    const total = this.#catalog.length;
    this.#currentSlide = (this.#currentSlide + delta + total) % total;
    this.#renderSlide(root);
  }

  #goToSlide(index, root) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#catalog.length) return;
    this.#currentSlide = index;
    this.#renderSlide(root);
  }

  #renderSlide(root) {
    const slide = this.#catalog[this.#currentSlide] ?? null;
    if (!slide || !(root instanceof HTMLElement)) return;

    root.dataset.supportTone = slide.tone;

    const setText = (selector, value) => {
      const element = root.querySelector(selector);
      if (element instanceof HTMLElement) {
        element.textContent = value;
      }
    };

    setText("[data-card-index]", `${slide.indexLabel} / ${slide.totalLabel}`);
    setText("[data-card-title]", slide.name);
    setText("[data-card-description]", slide.description);

    const previewImage = root.querySelector("[data-card-image]");
    if (previewImage instanceof HTMLImageElement) {
      previewImage.src = slide.image ?? "";
      previewImage.alt = slide.name;
      previewImage.hidden = !slide.image;
    }

    const previewLink = root.querySelector("[data-card-preview-link]");
    if (previewLink instanceof HTMLAnchorElement) {
      previewLink.href = slide.url;
      previewLink.setAttribute("aria-label", `${this.#strings.viewModule}: ${slide.name}`);
    }

    for (const dot of root.querySelectorAll("[data-slide-index]")) {
      if (!(dot instanceof HTMLElement)) continue;
      const isActive = Number(dot.dataset.slideIndex) === this.#currentSlide;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }

  #openCurrentModule() {
    const slide = this.#catalog[this.#currentSlide] ?? null;
    if (!slide?.url) return;
    window?.open?.(slide.url, "_blank", "noopener");
  }

  #applyViewportBounds() {
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
    const targetWidth = Math.max(320, Math.min(1040, viewportWidth - 32));
    const targetHeight = Math.max(520, Math.min(760, viewportHeight - 32));
    this.setPosition?.({ width: targetWidth, height: targetHeight });
  }

  async #persistPreference() {
    if (this.#didPersist) return;
    this.#didPersist = true;

    try {
      await game.settings.set(
        Constants.MODULE_ID,
        ModuleSettings.SETTING_HIDE_SUPPORT_CARD,
        this.#suppressUntilNextUpdate
      );
      await game.settings.set(
        Constants.MODULE_ID,
        ModuleSettings.SETTING_SUPPORT_CARD_VERSION,
        String(this.#moduleVersion ?? "").trim()
      );
    } catch (error) {
      this.#didPersist = false;
      console.error(`${Constants.MODULE_ID} | Failed to persist support popup preference`, error);
    }
  }
}
