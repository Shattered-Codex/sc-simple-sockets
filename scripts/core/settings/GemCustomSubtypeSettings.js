import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";
import { GemLootTypeExtension } from "../../domain/gems/GemLootTypeExtension.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render GemCustomSubtypeSettings.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/settings/custom-loot-subtypes.hbs`;

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, formData);
}

export class GemCustomSubtypeSettings extends BaseApplication {
  #inputListener;
  #root = null;
  #dirtyBaseline = "";

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-gem-custom-subtype-settings`,
      tag: "form",
      classes: ["sc-sockets", "sc-sockets-settings-theme", "gem-custom-subtype-settings"],
      position: { width: 1020, height: 700 },
      window: {
        title: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.CustomMenu.Title",
          Constants.localize("SCSockets.Settings.GemLootSubtypes.Custom.Heading", "Custom Loot Subtypes")
        ),
        icon: "fas fa-list",
        contentClasses: ["sc-sockets-settings-theme"]
      },
      form: {
        handler: handleFormSubmit,
        closeOnSubmit: true,
        submitOnChange: false
      },
      actions: {
        addCustomSubtype(event) {
          event.preventDefault();
          this.#addCustomSubtypeRow();
        },
        removeCustomSubtype(event, target) {
          event.preventDefault();
          const row = target?.closest?.("[data-subtype-row]");
          if (!row) return;
          row.remove();
          this.#reindexCustomSubtypeRows();
          this.#applyLayoutBounds();
          this.#updateSaveDirtyState();
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
    const customFromUI = this.#collectCustomSubtypeEntries();
    const custom = customFromUI.length
      ? customFromUI
      : GemCustomSubtypeSettings.#extractCustomSubtypeEntries(expanded?.customSubtypes);

    await ModuleSettings.setCustomLootSubtypes(custom);
    GemLootTypeExtension.ensure();
    this.#dirtyBaseline = this.#buildSnapshot();
    this.#setSaveDirtyState(false);
    return {};
  }

  async _updateObject(event, formData) {
    await this._processSubmitData(event, formData);
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

  activateListeners(html) {
    super.activateListeners(html);
    queueMicrotask(() => this.#bindRoot());
  }

  deactivateListeners(html) {
    this.#unbindRoot();
    this.#root = null;
    super.deactivateListeners?.(html);
  }

  async #buildContext() {
    GemLootTypeExtension.ensure();

    const formId = this.id ?? `${Constants.MODULE_ID}-gem-custom-subtype-settings`;
    const customSubtypes = ModuleSettings.getCustomLootSubtypes();

    return {
      formId,
      customSubtypes: customSubtypes.map((entry) => ({
        key: entry.key,
        label: entry.label
      })),
      strings: {
        submit: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.CustomMenu.Save",
          Constants.localize("SCSockets.Settings.GemLootSubtypes.Save", "Save")
        ),
        custom: {
          heading: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Heading",
            "Custom loot subtypes"
          ),
          hint: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Hint",
            "Add new loot subtype keys and labels that will be available for gems."
          ),
          keyLabel: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Key",
            "Subtype key"
          ),
          keyPlaceholder: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.KeyPlaceholder",
            "e.g. extra"
          ),
          labelLabel: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Label",
            "Display label"
          ),
          labelPlaceholder: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.LabelPlaceholder",
            "Extra"
          ),
          add: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Add",
            "Add subtype"
          ),
          remove: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Remove",
            "Remove"
          )
        }
      }
    };
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

  #applyLayoutBounds() {
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
    const maxWidth = Math.max(860, viewportWidth - 48);
    const targetWidth = Math.max(860, Math.min(1060, maxWidth));
    const maxHeight = Math.max(520, viewportHeight - 48);
    const app = this.element?.querySelector?.(".sc-sockets-settings-app");
    const naturalHeight = (app?.scrollHeight ?? 620) + 84;
    const targetHeight = Math.max(600, Math.min(860, maxHeight, naturalHeight));
    this.setPosition?.({ width: targetWidth, height: targetHeight });
  }

  #handleInput(_event) {
    this.#updateSaveDirtyState();
  }

  #collectCustomSubtypeEntries(root = this.#root ?? this.element) {
    if (!root) return [];
    const rows = root.querySelectorAll("[data-subtype-row]");
    const seen = new Set();
    const entries = [];

    for (const row of rows) {
      const key = String(row.querySelector('input[data-custom-field="key"]')?.value ?? "").trim();
      if (!key.length) continue;
      const lower = key.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      const labelField = row.querySelector('input[data-custom-field="label"]');
      const labelValue = String(labelField?.value ?? "").trim();
      const label = labelValue.length ? labelValue : ModuleSettings.formatSubtypeLabel(key);
      entries.push({ key: lower, label });
    }

    entries.sort((a, b) => a.key.localeCompare(b.key, game?.i18n?.lang ?? undefined));
    return entries;
  }

  #buildSnapshot(root = this.#root ?? this.element) {
    const custom = this.#collectCustomSubtypeEntries(root);
    return JSON.stringify(custom);
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

  #addCustomSubtypeRow({ key = "", label = "" } = {}) {
    const root = this.#root ?? this.element;
    const container = root?.querySelector?.("[data-custom-subtypes]");
    if (!container) return;

    const index = container.querySelectorAll("[data-subtype-row]").length;
    const keyPlaceholder = container.dataset.placeholderKey ?? "";
    const labelPlaceholder = container.dataset.placeholderLabel ?? "";
    const removeLabel = container.dataset.removeLabel ?? "";
    const keyLabel = container.dataset.keyLabel ?? "";
    const displayLabel = container.dataset.displayLabel ?? "";

    const row = document.createElement("li");
    row.className = "gem-custom-subtype-row";
    row.dataset.subtypeRow = "";
    row.dataset.index = String(index);
    row.innerHTML = `
      <div class="gem-custom-subtype-fields">
        <div class="form-group">
          <label>${foundry.utils.escapeHTML(keyLabel)}</label>
          <div class="form-fields">
            <input type="text"
                   name="customSubtypes.${index}.key"
                   value="${foundry.utils.escapeHTML(key)}"
                   placeholder="${foundry.utils.escapeHTML(keyPlaceholder)}"
                   data-custom-field="key"
                   autocomplete="off" />
          </div>
        </div>
        <div class="form-group">
          <label>${foundry.utils.escapeHTML(displayLabel)}</label>
          <div class="form-fields">
            <input type="text"
                   name="customSubtypes.${index}.label"
                   value="${foundry.utils.escapeHTML(label)}"
                   placeholder="${foundry.utils.escapeHTML(labelPlaceholder)}"
                   data-custom-field="label"
                   autocomplete="off" />
          </div>
        </div>
      </div>
      <button type="button" class="dialog-button sc-sockets-settings-btn sc-sockets-settings-btn--ghost gem-custom-subtype-remove" data-action="removeCustomSubtype">
          ${foundry.utils.escapeHTML(removeLabel)}
      </button>
    `;

    container.append(row);
    this.#reindexCustomSubtypeRows();
    const keyInput = row.querySelector('input[data-custom-field="key"]');
    keyInput?.focus?.();
    this.#applyLayoutBounds();
    this.#updateSaveDirtyState(root);
  }

  _onClickAction(event, target) {
    const action = target?.dataset?.action;
    if (action === "addCustomSubtype") {
      event.preventDefault();
      this.#addCustomSubtypeRow();
      return;
    }

    if (action === "removeCustomSubtype") {
      event.preventDefault();
      const row = target.closest?.("[data-subtype-row]");
      if (!row) return;
      row.remove();
      this.#reindexCustomSubtypeRows();
      this.#applyLayoutBounds();
      this.#updateSaveDirtyState();
      return;
    }

    return super._onClickAction?.(event, target);
  }

  #reindexCustomSubtypeRows() {
    const container = this.#root?.querySelector?.("[data-custom-subtypes]");
    if (!container) return;
    const rows = container.querySelectorAll("[data-subtype-row]");
    rows.forEach((row, index) => {
      row.dataset.index = String(index);
      const keyInput = row.querySelector('input[data-custom-field="key"]');
      const labelInput = row.querySelector('input[data-custom-field="label"]');
      if (keyInput) keyInput.name = `customSubtypes.${index}.key`;
      if (labelInput) labelInput.name = `customSubtypes.${index}.label`;
    });
  }

  static #extractCustomSubtypeEntries(raw) {
    const source = Array.isArray(raw)
      ? raw
      : Object.values(raw ?? {});

    const entries = [];
    for (const entry of source) {
      if (!entry) continue;
      const key = typeof entry.key === "string" ? entry.key.trim() : "";
      const label = typeof entry.label === "string" ? entry.label.trim() : "";
      if (!key.length) continue;
      entries.push({ key, label });
    }
    return entries;
  }
}
