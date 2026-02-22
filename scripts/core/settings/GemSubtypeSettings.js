import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";
import { GemLootTypeExtension } from "../../domain/gems/GemLootTypeExtension.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render GemSubtypeSettings.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/settings/gem-loot-subtypes.hbs`;

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, formData);
}

export class GemSubtypeSettings extends BaseApplication {
  #inputListener;
  #root = null;
  #dirtyBaseline = "";

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-gem-subtype-settings`,
      tag: "form",
      classes: ["sc-sockets", "sc-sockets-settings-theme", "gem-subtype-settings"],
      position: { width: 980, height: 560 },
      window: {
        title: Constants.localize("SCSockets.Settings.GemLootSubtypes.Title", "Gem Loot Subtype Settings"),
        icon: "fas fa-gem",
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
          this.#syncSubtypeOptions();
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
    await this.#processSubmission(formData);
    this.#dirtyBaseline = this.#buildSnapshot();
    this.#setSaveDirtyState(false);
    return {};
  }

  async _updateObject(_event, formData) {
    await this.#processSubmission(formData);
    this.#dirtyBaseline = this.#buildSnapshot();
    this.#setSaveDirtyState(false);
  }

  render(...args) {
    const rendered = super.render(...args);
    Promise.resolve(rendered).then(() => {
      window.requestAnimationFrame(() => this.#applyLayoutBounds());
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

    const formId = this.id ?? `${Constants.MODULE_ID}-gem-subtype-settings`;
    const customSubtypes = ModuleSettings.getCustomLootSubtypes();
    const selected = ModuleSettings.getGemLootSubtypes();
    const selectedSet = new Set(selected.map((value) => String(value ?? "").toLowerCase()));

    const available = GemLootTypeExtension.getAvailableLootSubtypes();
    const customMap = new Map(customSubtypes.map((entry) => [entry.key.toLowerCase(), entry]));
    const options = available.map((entry) => {
      const lower = String(entry.value ?? "").toLowerCase();
      return {
        value: entry.value,
        label: entry.label,
        isCustom: customMap.has(lower),
        selected: selectedSet.has(lower)
      };
    });

    for (const value of selected) {
      const lower = String(value ?? "").toLowerCase();
      if (options.some((option) => option.value.toLowerCase() === lower)) {
        continue;
      }
      const custom = customMap.get(lower);
      options.push({
        value,
        label: custom?.label ?? ModuleSettings.formatSubtypeLabel(value),
        isCustom: customMap.has(lower),
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
      customSubtypes: customSubtypes.map((entry) => ({
        key: entry.key,
        label: entry.label
      })),
      strings: {
        subtypeSelect: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.SelectLabel",
          "Loot subtypes considered gems"
        ),
        subtypeHint: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.SelectHint",
          "Items with these loot subtypes will be treated as gems."
        ),
        submit: Constants.localize("SCSockets.Settings.GemLootSubtypes.Save", "Save"),
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
    this.#syncSubtypeOptions(root);
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
    const maxWidth = Math.max(760, viewportWidth - 48);
    const targetWidth = Math.max(760, Math.min(980, maxWidth));
    const maxHeight = Math.max(440, viewportHeight - 48);
    const app = this.element?.querySelector?.(".sc-sockets-settings-app");
    const naturalHeight = (app?.scrollHeight ?? 520) + 72;
    const targetHeight = Math.max(500, Math.min(760, maxHeight, naturalHeight));
    this.setPosition?.({ width: targetWidth, height: targetHeight });
  }

  async #processSubmission(formData) {
    const expanded = foundry.utils.expandObject(formData?.object ?? {});
    const object = expanded ?? {};

    const selectedFromUI = this.#collectSelectedSubtypeValues();
    const cleanedAllowed = selectedFromUI.length
      ? selectedFromUI
      : GemSubtypeSettings.#extractSubtypeSelection(object.subtypes ?? object.subtypeChoices);

    const custom = GemSubtypeSettings.#extractCustomSubtypeEntries(object.customSubtypes);

    await ModuleSettings.setCustomLootSubtypes(custom);
    await ModuleSettings.setGemLootSubtypes(cleanedAllowed);
    GemLootTypeExtension.ensure();
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

  static #extractSubtypeSelection(raw) {
    if (Array.isArray(raw)) {
      return GemSubtypeSettings.#normalizeSubtypeValues(raw);
    }
    if (typeof raw === "string") {
      return GemSubtypeSettings.#normalizeSubtypeValues([raw]);
    }
    if (!raw || typeof raw !== "object") {
      return [];
    }

    const selected = Object.entries(raw)
      .filter(([, value]) => value === true || value === "true" || value === "on" || value === 1 || value === "1")
      .map(([key]) => key);
    return GemSubtypeSettings.#normalizeSubtypeValues(selected);
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

  #collectSelectedSubtypeValues(root = this.#root ?? this.element) {
    if (!root) return [];
    const checked = root.querySelectorAll("[data-subtype-choice]:checked");
    return GemSubtypeSettings.#normalizeSubtypeValues(
      Array.from(checked).map((input) => input.dataset.typeValue ?? input.value ?? "")
    );
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
    const selected = this.#collectSelectedSubtypeValues(root)
      .map((value) => value.toLowerCase())
      .sort((a, b) => a.localeCompare(b, game?.i18n?.lang ?? undefined));
    const custom = this.#collectCustomSubtypeEntries(root);
    return JSON.stringify({ selected, custom });
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

    const row = document.createElement("tr");
    row.dataset.subtypeRow = "";
    row.dataset.index = String(index);
    row.innerHTML = `
      <td>
        <input type="text"
               name="customSubtypes.${index}.key"
               value="${foundry.utils.escapeHTML(key)}"
               placeholder="${foundry.utils.escapeHTML(keyPlaceholder)}"
               data-custom-field="key"
               autocomplete="off" />
      </td>
      <td>
        <input type="text"
               name="customSubtypes.${index}.label"
               value="${foundry.utils.escapeHTML(label)}"
               placeholder="${foundry.utils.escapeHTML(labelPlaceholder)}"
               data-custom-field="label"
               autocomplete="off" />
      </td>
      <td class="actions">
        <button type="button" class="dialog-button sc-sockets-settings-btn sc-sockets-settings-btn--ghost" data-action="removeCustomSubtype">
          ${foundry.utils.escapeHTML(removeLabel)}
        </button>
      </td>
    `;

    container.append(row);
    this.#reindexCustomSubtypeRows();
    const keyInput = row.querySelector('input[data-custom-field="key"]');
    keyInput?.focus?.();
    this.#syncSubtypeOptions(root);
    this.#applyLayoutBounds();
    this.#updateSaveDirtyState(root);
  }

  #handleInput(event) {
    if (event.target?.matches?.('[data-custom-field]')) {
      this.#syncSubtypeOptions();
    }
    this.#updateSaveDirtyState();
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
      this.#syncSubtypeOptions();
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

  #syncSubtypeOptions(root = this.#root ?? this.element) {
    if (!root) return;
    const container = root.querySelector("[data-subtype-options]");
    if (!container) return;

    const checkedSet = new Set(
      Array.from(container.querySelectorAll("[data-subtype-choice]:checked"))
        .map((input) => String(input.dataset.typeValue ?? input.value ?? "").trim().toLowerCase())
        .filter((value) => value.length)
    );

    const baseMap = new Map();
    for (const option of container.querySelectorAll("[data-subtype-option]")) {
      if (option.dataset.custom === "true") continue;
      const input = option.querySelector("input[data-subtype-choice]");
      const label = option.querySelector("span");
      const value = String(input?.dataset?.typeValue ?? input?.value ?? "").trim();
      if (!value.length) continue;
      const lower = value.toLowerCase();
      if (baseMap.has(lower)) continue;
      baseMap.set(lower, {
        value,
        lower,
        label: String(label?.textContent ?? ModuleSettings.formatSubtypeLabel(value)).trim(),
        isCustom: false
      });
    }

    const rows = root.querySelectorAll("[data-subtype-row]");
    const entries = [];
    for (const row of rows) {
      const key = row.querySelector('input[data-custom-field="key"]')?.value?.trim() ?? "";
      if (!key.length) continue;
      const labelField = row.querySelector('input[data-custom-field="label"]');
      const label = labelField?.value?.trim()?.length
        ? labelField.value.trim()
        : ModuleSettings.formatSubtypeLabel(key);
      entries.push({
        value: key,
        lower: key.toLowerCase(),
        label,
        isCustom: true
      });
    }

    for (const entry of entries) {
      baseMap.set(entry.lower, entry);
    }

    const options = Array.from(baseMap.values())
      .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined));
    const midpoint = Math.ceil(options.length / 2);
    const columns = [
      options.slice(0, midpoint),
      options.slice(midpoint)
    ];

    container.replaceChildren();
    for (const columnEntries of columns) {
      const column = document.createElement("div");
      column.className = "gem-subtype-options-column";

      for (const entry of columnEntries) {
        const option = document.createElement("label");
        option.className = "gem-subtype-option";
        option.dataset.subtypeOption = "";
        if (entry.isCustom) {
          option.dataset.custom = "true";
        }

        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = "subtypeChoices";
        input.value = entry.value;
        input.dataset.subtypeChoice = "";
        input.dataset.typeValue = entry.value;
        input.checked = checkedSet.has(entry.lower);

        const label = document.createElement("span");
        label.textContent = entry.label;

        option.append(input, label);
        column.append(option);
      }

      container.append(column);
    }
  }
}
