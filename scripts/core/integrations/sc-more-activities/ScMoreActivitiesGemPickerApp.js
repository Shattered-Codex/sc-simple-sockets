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
  #confirmIcon;
  #confirmLabel;
  #filterQuery = "";
  #gems;
  #limit;
  #multiple;
  #onPick;
  #resolved = false;
  /** Chosen gem uuids, in the order they were chosen (multiple mode). */
  #selected = [];
  #selectionLabel;
  #submittingUuid = null;
  #subtitle;

  constructor({
    closeLabel = Constants.localize("SCSockets.SocketSlotConfig.Cancel", "Cancel"),
    confirmIcon = "fa-solid fa-check",
    confirmLabel = "",
    gems = [],
    limit = null,
    multiple = false,
    onPick = null,
    selected = [],
    selectionLabel = null,
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
    this.#confirmIcon = String(confirmIcon ?? "");
    this.#confirmLabel = String(confirmLabel ?? "");
    this.#gems = Array.isArray(gems) ? gems : [];
    this.#limit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : null;
    this.#multiple = multiple === true;
    this.#selectionLabel = typeof selectionLabel === "function" ? selectionLabel : null;
    if (this.#multiple) {
      for (const uuid of Array.isArray(selected) ? selected : []) {
        this.toggle(uuid);
      }
    }
    this.#onPick = typeof onPick === "function" ? onPick : null;
    this.#subtitle = String(subtitle ?? "");
  }

  /**
   * Renders the picker and resolves with the chosen gem uuid, or null when
   * dismissed. With `multiple`, several gems are chosen and confirmed, and it
   * resolves with `[{ uuid, units }]`: `limit` caps the total units, and a
   * stack (`gem.units`) takes as many of them as are left.
   */
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
      confirmIcon: this.#confirmIcon,
      confirmLabel: this.#confirmLabel,
      gems: this.#gems.map((gem) => ({
        ...gem,
        isSelected: this.#selected.includes(gem.uuid),
        isSubmitting: this.#submittingUuid === gem.uuid
      })),
      multiple: this.#multiple,
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

  /** The chosen gems and how many units of each fit the limit, in choice order. */
  get selection() {
    let remaining = this.#limit ?? Infinity;
    const selection = [];
    for (const uuid of this.#selected) {
      const gem = this.#gems.find((entry) => entry.uuid === uuid);
      const units = Math.min(Math.max(Math.floor(Number(gem?.units ?? 1)) || 1, 1), remaining);
      if (units <= 0) {
        break;
      }
      selection.push({ uuid, units });
      remaining -= units;
    }
    return selection;
  }

  /** Chooses or releases a gem (multiple mode). A full limit refuses new gems. */
  toggle(gemUuid) {
    const uuid = String(gemUuid ?? "").trim();
    if (!this.#multiple || this.#resolved || !this.#gems.some((gem) => gem.uuid === uuid)) {
      return;
    }

    const index = this.#selected.indexOf(uuid);
    if (index >= 0) {
      this.#selected.splice(index, 1);
    } else if (this.#remaining() > 0) {
      this.#selected.push(uuid);
    }
    this.#syncSelection();
  }

  /** Resolves the pending pick with the current selection and closes (multiple mode). */
  confirm() {
    const selection = this.selection;
    if (!this.#multiple || !selection.length || this.#resolved) {
      return;
    }

    this.#resolve(selection);
    void Promise.resolve(this.close?.()).catch(() => {});
  }

  #remaining() {
    const used = this.selection.reduce((total, entry) => total + entry.units, 0);
    return (this.#limit ?? Infinity) - used;
  }

  #syncSelection() {
    const root = this.element;
    if (!root?.querySelectorAll) {
      return;
    }

    const selection = this.selection;
    const count = selection.reduce((total, entry) => total + entry.units, 0);
    const full = this.#remaining() <= 0;
    root.querySelectorAll("[data-gem-uuid]").forEach((button) => {
      const selected = this.#selected.includes(button.dataset.gemUuid);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = !selected && full;
    });

    const counter = root.querySelector('[data-role="gem-selection"]');
    if (counter) {
      counter.textContent = this.#selectionLabel?.(count, this.#limit) ?? "";
    }
    const confirm = root.querySelector('[data-action="confirm"]');
    if (confirm) {
      confirm.disabled = !selection.length;
    }
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

    this.element?.querySelector('[data-action="confirm"]')?.addEventListener("click", () => {
      this.confirm();
    });
    if (this.#multiple) {
      this.#syncSelection();
    }

    this.element?.querySelectorAll("[data-gem-uuid]")?.forEach((button) => {
      button.addEventListener("click", (event) => {
        const uuid = event.currentTarget?.dataset?.gemUuid;
        if (this.#multiple) {
          this.toggle(uuid);
          return;
        }
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
