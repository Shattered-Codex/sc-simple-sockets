import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render SocketableItemTypesSettings.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/settings/socketable-item-types.hbs`;

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, formData);
}

export class SocketableItemTypesSettings extends BaseApplication {
  #inputListener;
  #root = null;
  #dirtyBaseline = "";

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-socketable-item-types-settings`,
      tag: "form",
      classes: ["sc-sockets", "sc-sockets-settings-theme", "socketable-item-types-settings"],
      position: { width: 880, height: 580 },
      window: {
        title: Constants.localize(
          "SCSockets.Settings.SocketableItemTypes.Title",
          "Socketable Item Types"
        ),
        icon: "fas fa-link",
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
    const rawTypes = expanded?.types;
    const selected = SocketableItemTypesSettings.#extractSelectedTypes(rawTypes);

    await ModuleSettings.setSocketableItemTypes(selected);
    ModuleSettings.refreshOpenSheets({ item: true, actor: true });
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
    const targetWidth = Math.max(760, Math.min(940, maxWidth));
    const maxHeight = Math.max(460, viewportHeight - 48);
    const app = this.element?.querySelector?.(".sc-sockets-settings-app");
    const naturalHeight = (app?.scrollHeight ?? 460) + 92;
    const targetHeight = Math.max(520, Math.min(760, maxHeight, naturalHeight));
    this.setPosition?.({ width: targetWidth, height: targetHeight });
  }

  #applyDefaultSelection() {
    const defaults = new Set(ModuleSettings.getDefaultSocketableItemTypes());
    const checkboxes = this.element?.querySelectorAll?.(".socketable-type-option input[type='checkbox']");
    if (!checkboxes?.length) return;

    for (const checkbox of checkboxes) {
      const type = String(checkbox?.dataset?.typeValue ?? "")
        .trim()
        .toLowerCase();
      checkbox.checked = defaults.has(type);
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

  #buildSnapshot(root = this.#root ?? this.element) {
    if (!root) return "[]";
    const selected = Array.from(root.querySelectorAll("input[data-type-value]:checked"))
      .map((input) => String(input.dataset.typeValue ?? input.value ?? "").trim().toLowerCase())
      .filter((value) => value.length)
      .sort();
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
      "SCSockets.Settings.SocketableItemTypes.UnsavedChanges",
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

  static #extractSelectedTypes(rawTypes) {
    if (Array.isArray(rawTypes)) {
      return rawTypes
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length);
    }

    if (typeof rawTypes === "string") {
      const value = rawTypes.trim();
      return value.length ? [value] : [];
    }

    if (!rawTypes || typeof rawTypes !== "object") {
      return [];
    }

    return Object.entries(rawTypes)
      .filter(([, value]) => value === true || value === "true" || value === "on" || value === 1 || value === "1")
      .map(([key]) => String(key ?? "").trim())
      .filter((value) => value.length);
  }

  async #buildContext() {
    const formId = this.id ?? `${Constants.MODULE_ID}-socketable-item-types-settings`;
    const selected = ModuleSettings.getSocketableItemTypes();
    const selectedSet = new Set(selected.map((value) => String(value ?? "").toLowerCase()));
    const available = ModuleSettings.getAvailableSocketableItemTypes();
    const options = available.map((entry) => ({
      value: entry.value,
      label: entry.label,
      selected: selectedSet.has(String(entry.value ?? "").toLowerCase())
    }));
    const midpoint = Math.ceil(options.length / 2);
    const typeColumns = [
      options.slice(0, midpoint),
      options.slice(midpoint)
    ];

    return {
      formId,
      typeColumns,
      strings: {
        selectLabel: Constants.localize(
          "SCSockets.Settings.SocketableItemTypes.SelectLabel",
          "Item types that can receive sockets"
        ),
        selectHint: Constants.localize(
          "SCSockets.Settings.SocketableItemTypes.SelectHint",
          "Choose one or more item types."
        ),
        submit: Constants.localize("SCSockets.Settings.SocketableItemTypes.Save", "Save"),
        reset: Constants.localize("SCSockets.Settings.SocketableItemTypes.Reset", "Reset defaults")
      }
    };
  }
}
