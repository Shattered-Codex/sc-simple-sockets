import { Constants } from "../../Constants.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;

if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required for ScMoreActivitiesGemPickerApp.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/gem-picker.hbs`;
const FILTER_THRESHOLD = 6;

export class ScMoreActivitiesGemPickerApp extends BaseApplication {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      tag: "section",
      classes: ["dnd5e2", "sc-sockets", "sc-sockets-view", "sc-sockets-scma-picker", "sc-sockets-scma-gem-picker"],
      position: {
        width: 560,
        height: "auto"
      }
    },
    { inplace: false }
  );

  static PARTS = {
    body: {
      template: TEMPLATE_PATH
    }
  };

  #closeLabel;
  #filterQuery = "";
  #gems;
  #onPick;
  #resolved = false;
  #submittingUuid = null;
  #subtitle;

  constructor({
    closeLabel = Constants.localize("SCSockets.SocketSlotConfig.Cancel", "Cancel"),
    gems = [],
    onPick = null,
    subtitle = "",
    title = ""
  } = {}, options = {}) {
    super({
      ...options,
      window: {
        title
      }
    });

    this.#closeLabel = closeLabel;
    this.#gems = Array.isArray(gems) ? gems : [];
    this.#onPick = typeof onPick === "function" ? onPick : null;
    this.#subtitle = String(subtitle ?? "");
  }

  /** Renders the picker and resolves with the chosen gem uuid, or null when dismissed. */
  static async pick(config = {}, options = {}) {
    return new Promise((resolve) => {
      new ScMoreActivitiesGemPickerApp({ ...config, onPick: resolve }, options).render(true);
    });
  }

  async _preparePartContext(partId, context = {}, renderOptions) {
    const base = await super._preparePartContext?.(partId, context, renderOptions) ?? context;
    if (partId !== "body") {
      return base;
    }

    return foundry.utils.mergeObject(base, {
      closeLabel: this.#closeLabel,
      filterPlaceholder: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.GemReload.App.GemFilterPlaceholder",
        "Filter gems by name…"
      ),
      gems: this.#gems.map((gem) => ({
        ...gem,
        isSubmitting: this.#submittingUuid === gem.uuid
      })),
      hasGems: this.#gems.length > 0,
      noResultsMessage: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.GemReload.App.GemFilterNoResults",
        "No gems match the current filter."
      ),
      showFilter: this.#gems.length > FILTER_THRESHOLD,
      subtitle: this.#subtitle
    }, { inplace: false });
  }

  /** Resolves the pending pick and closes. Public so flows and tests can confirm programmatically. */
  submit(gemUuid) {
    const uuid = String(gemUuid ?? "").trim();
    if (!uuid.length || this.#resolved) {
      return;
    }

    this.#resolve(uuid);
    void Promise.resolve(this.close?.()).catch(() => {});
  }

  #resolve(value) {
    if (this.#resolved) {
      return;
    }

    this.#resolved = true;
    this.#onPick?.(value);
  }

  _onClose(options) {
    super._onClose?.(options);
    this.#resolve(null);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element?.querySelector('[data-action="close"]')?.addEventListener("click", () => {
      void this.close();
    });

    const filterInput = this.element?.querySelector('[data-role="gem-filter"]');
    if (filterInput) {
      filterInput.value = this.#filterQuery;
      filterInput.addEventListener("input", (event) => {
        this.#filterQuery = String(event.currentTarget?.value ?? "");
        this.#applyFilter();
      });
    }
    this.#applyFilter();

    this.element?.querySelectorAll("[data-gem-uuid]")?.forEach((button) => {
      button.addEventListener("click", (event) => {
        const uuid = event.currentTarget?.dataset?.gemUuid;
        if (!uuid || this.#submittingUuid) {
          return;
        }

        this.#submittingUuid = uuid;
        this.submit(uuid);
      });
    });
  }

  #applyFilter() {
    const root = this.element;
    if (!root) {
      return;
    }

    const query = this.#filterQuery.trim().toLowerCase();
    let visible = 0;

    root.querySelectorAll("[data-gem-name]")?.forEach((item) => {
      const matches = !query.length || String(item.dataset.gemName ?? "").includes(query);
      item.hidden = !matches;
      if (matches) {
        visible += 1;
      }
    });

    const noResults = root.querySelector('[data-role="gem-filter-empty"]');
    if (noResults) {
      noResults.hidden = visible > 0;
    }
  }
}
