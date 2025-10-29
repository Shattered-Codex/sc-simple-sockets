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

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-gem-subtype-settings`,
      tag: "form",
      classes: ["sc-sockets", "gem-subtype-settings"],
      position: { width: 520 },
      window: {
        title: Constants.localize("SCSockets.Settings.GemLootSubtypes.Title", "Gem Loot Subtype Settings"),
        icon: "fas fa-gem"
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
          this.#syncSelectOptions();
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
    return {};
  }

  async _updateObject(_event, formData) {
    await this.#processSubmission(formData);
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
    const selectSize = Math.min(Math.max(options.length + 2, 8), 18);

    return {
      formId,
      selectId: `${formId}-subtypes`,
      selectSize,
      availableSubtypes: options,
      customSubtypes: customSubtypes.map((entry) => ({
        key: entry.key,
        label: entry.label
      })),
      selectedSubtypes: Array.from(selectedSet),
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
    this.#root = root;
    this.#syncSelectOptions(root);
  }

  #unbindRoot() {
    const root = this.#root;
    if (!root) return;
    root.removeEventListener("input", this.#inputListener);
  }

  async #processSubmission(formData) {
    const expanded = foundry.utils.expandObject(formData?.object ?? {});
    const object = expanded ?? {};

    const rawSubtypes = object.subtypes;
    const allowed = Array.isArray(rawSubtypes)
      ? rawSubtypes
      : (typeof rawSubtypes === "string" && rawSubtypes.length ? [rawSubtypes] : []);
    const cleanedAllowed = Array.from(new Set(
      allowed
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length)
    ));

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
        <button type="button" class="dialog-button" data-action="removeCustomSubtype">
          ${foundry.utils.escapeHTML(removeLabel)}
        </button>
      </td>
    `;

    container.append(row);
    this.#reindexCustomSubtypeRows();
    const keyInput = row.querySelector('input[data-custom-field="key"]');
    keyInput?.focus?.();
    this.#syncSelectOptions(root);
  }

  #handleInput(event) {
    if (event.target?.matches?.('[data-custom-field]')) {
      this.#syncSelectOptions();
    }
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
      this.#syncSelectOptions();
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

  #syncSelectOptions(root = this.#root ?? this.element) {
    if (!root) return;
    const select = root.querySelector(`select[name="subtypes"]`);
    if (!select) return;

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
        key,
        lower: key.toLowerCase(),
        label
      });
    }

    const options = Array.from(select.querySelectorAll("option"));
    for (const option of options) {
      if (option.dataset.custom === "true") {
        const lower = option.value.toLowerCase();
        if (!entries.some((entry) => entry.lower === lower)) {
          if (option.selected) option.selected = false;
          option.remove();
        }
      }
    }

    const optionMap = new Map(Array.from(select.options).map((opt) => [opt.value.toLowerCase(), opt]));
    for (const entry of entries) {
      const existing = optionMap.get(entry.lower);
      if (existing) {
        existing.dataset.custom = "true";
        existing.textContent = entry.label;
        continue;
      }
      const option = document.createElement("option");
      option.value = entry.key;
      option.textContent = entry.label;
      option.dataset.custom = "true";
      select.append(option);
      optionMap.set(entry.lower, option);
    }

    const size = Math.min(Math.max(select.options.length, 6), 16);
    select.size = size;
  }
}
