import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";
import { GemLootTypeExtension } from "../../domain/gems/GemLootTypeExtension.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render GemSubtypeSelectionSettings.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/settings/gem-subtype-selection.hbs`;

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, formData);
}

export class GemSubtypeSelectionSettings extends BaseApplication {
  #inputListener;
  #root = null;
  #dirtyBaseline = "";

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-gem-subtype-selection-settings`,
      tag: "form",
      classes: ["sc-sockets", "sc-sockets-settings-theme", "gem-subtype-selection-settings"],
      position: { width: 860, height: 560 },
      window: {
        title: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.Selection.Title",
          Constants.localize("SCSockets.Settings.GemLootSubtypes.Title", "Gem Loot Subtype Settings")
        ),
        icon: "fas fa-gem",
        contentClasses: ["sc-sockets-settings-theme"]
      },
      form: {
        handler: handleFormSubmit,
        closeOnSubmit: true,
        submitOnChange: false
      },
      actions: {
        resetDefaults(event) {
          event.preventDefault();
          this.#applyDefaultSelection();
        }
      }
    },
    { inplace: false }
  );

  static PARTS = {
    form: {
      template: TEMPLATE_PATH
    }
  };

  constructor(options = {}) {
    super(options);
    this.#inputListener = (event) => this.#handleInput(event);
  }

  async _preparePartContext(partId, context = {}, options) {
    const base = await super._preparePartContext?.(partId, context, options) ?? context;
    if (partId !== "form") {
      return base;
    }
    return foundry.utils.mergeObject(base ?? {}, await this.#buildContext(), { inplace: false });
  }

  async _processSubmitData(_event, formData) {
    const expanded = foundry.utils.expandObject(formData?.object ?? {});
    const selectedFromUI = this.#collectSelectedSubtypeValues();
    const selected = selectedFromUI.length
      ? selectedFromUI
      : GemSubtypeSelectionSettings.#extractSubtypeSelection(expanded?.subtypes);

    await ModuleSettings.setGemLootSubtypes(selected);
    GemLootTypeExtension.ensure();
    this.#dirtyBaseline = this.#buildSnapshot();
    this.#setSaveDirtyState(false);
    return {};
  }

  async _updateObject(event, formData) {
    await this._processSubmitData(event, formData);
  }

  activateListeners(html) {
    super.activateListeners(html);
    queueMicrotask(() => this.#bindRoot());
  }

  deactivateListeners(html) {
    this.#unbindRoot();
    this.#root = null;
    super.deactivateListeners?.(html);
  }

  render(...args) {
    const rendered = super.render(...args);
    Promise.resolve(rendered).then(() => {
      window.requestAnimationFrame(() => {
        this.#bindRoot();
        this.#applyLayoutBounds();
      });
    });
    return rendered;
  }

  #applyLayoutBounds() {
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
    const maxWidth = Math.max(760, viewportWidth - 48);
    const targetWidth = Math.max(760, Math.min(920, maxWidth));
    const maxHeight = Math.max(440, viewportHeight - 48);
    const app = this.element?.querySelector?.(".sc-sockets-settings-app");
    const naturalHeight = (app?.scrollHeight ?? 460) + 84;
    const targetHeight = Math.max(500, Math.min(720, maxHeight, naturalHeight));
    this.setPosition?.({ width: targetWidth, height: targetHeight });
  }

  #applyDefaultSelection() {
    const defaults = new Set([String(Constants.ITEM_SUBTYPE_GEM ?? "gem").toLowerCase()]);
    const checkboxes = this.element?.querySelectorAll?.("input[data-subtype-value]");
    if (!checkboxes?.length) return;

    for (const checkbox of checkboxes) {
      const value = String(checkbox?.dataset?.subtypeValue ?? checkbox?.value ?? "")
        .trim()
        .toLowerCase();
      checkbox.checked = defaults.has(value);
    }

    this.#updateSaveDirtyState();
  }

  #bindRoot() {
    this.#unbindRoot();
    const root = this.element;
    if (!root) return;
    root.addEventListener("input", this.#inputListener);
    root.addEventListener("change", this.#inputListener);
    this.#root = root;
    this.#dirtyBaseline = this.#buildSnapshot(root);
    this.#setSaveDirtyState(false, root);
  }

  #unbindRoot() {
    const root = this.#root;
    if (!root) return;
    root.removeEventListener("input", this.#inputListener);
    root.removeEventListener("change", this.#inputListener);
  }

  #handleInput(_event) {
    this.#updateSaveDirtyState();
  }

  #collectSelectedSubtypeValues(root = this.#root ?? this.element) {
    if (!root) return [];
    const checked = root.querySelectorAll("input[data-subtype-value]:checked");
    return GemSubtypeSelectionSettings.#normalizeSubtypeValues(
      Array.from(checked).map((input) => input.dataset.subtypeValue ?? input.value ?? "")
    );
  }

  #buildSnapshot(root = this.#root ?? this.element) {
    const selected = this.#collectSelectedSubtypeValues(root)
      .map((value) => value.toLowerCase())
      .sort((a, b) => a.localeCompare(b, game?.i18n?.lang ?? undefined));
    return JSON.stringify(selected);
  }

  #updateSaveDirtyState(root = this.#root ?? this.element) {
    const dirty = this.#buildSnapshot(root) !== this.#dirtyBaseline;
    this.#setSaveDirtyState(dirty, root);
  }

  #setSaveDirtyState(dirty, root = this.#root ?? this.element) {
    const button = root?.querySelector?.("[data-save-button]");
    if (!button) return;
    button.classList.toggle("is-dirty", !!dirty);
    const tooltip = Constants.localize(
      "SCSockets.Settings.GemLootSubtypes.UnsavedChanges",
      "You have unsaved changes."
    );
    if (dirty) {
      button.title = tooltip;
      button.dataset.tooltip = tooltip;
      return;
    }
    button.removeAttribute("title");
    delete button.dataset.tooltip;
  }

  static #extractSubtypeSelection(raw) {
    if (Array.isArray(raw)) {
      return GemSubtypeSelectionSettings.#normalizeSubtypeValues(raw);
    }
    if (typeof raw === "string") {
      return GemSubtypeSelectionSettings.#normalizeSubtypeValues([raw]);
    }
    if (!raw || typeof raw !== "object") {
      return [];
    }

    const selected = Object.entries(raw)
      .filter(([, value]) => value === true || value === "true" || value === "on" || value === 1 || value === "1")
      .map(([key]) => key);
    return GemSubtypeSelectionSettings.#normalizeSubtypeValues(selected);
  }

  static #normalizeSubtypeValues(values) {
    const cleaned = [];
    const seen = new Set();
    for (const value of values) {
      const normalized = String(value ?? "").trim();
      if (!normalized.length) continue;
      const lower = normalized.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      cleaned.push(normalized);
    }
    return cleaned;
  }

  async #buildContext() {
    GemLootTypeExtension.ensure();

    const formId = this.id ?? `${Constants.MODULE_ID}-gem-subtype-selection-settings`;
    const selected = ModuleSettings.getGemLootSubtypes();
    const selectedSet = new Set(selected.map((value) => String(value ?? "").toLowerCase()));

    const options = GemLootTypeExtension.getAvailableLootSubtypes().map((entry) => ({
      value: entry.value,
      label: entry.label,
      selected: selectedSet.has(String(entry.value ?? "").toLowerCase())
    }));

    for (const value of selected) {
      const lower = String(value ?? "").toLowerCase();
      if (options.some((option) => String(option.value ?? "").toLowerCase() === lower)) {
        continue;
      }
      options.push({
        value,
        label: ModuleSettings.formatSubtypeLabel(value),
        selected: true
      });
    }

    options.sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined));
    const midpoint = Math.ceil(options.length / 2);
    const subtypeColumns = [
      options.slice(0, midpoint),
      options.slice(midpoint)
    ];

    return {
      formId,
      subtypeColumns,
      strings: {
        selectLabel: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.Selection.SelectLabel",
          Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.SelectLabel",
            "Loot subtypes considered gems"
          )
        ),
        selectHint: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.Selection.SelectHint",
          Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.SelectHint",
            "Items with these loot subtypes will be treated as gems."
          )
        ),
        submit: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.Selection.Save",
          Constants.localize("SCSockets.Settings.GemLootSubtypes.Save", "Save")
        ),
        reset: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.Selection.Reset",
          Constants.localize("SCSockets.Settings.SocketableItemTypes.Reset", "Reset defaults")
        )
      }
    };
  }
}
