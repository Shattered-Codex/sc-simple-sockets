import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";
import { GemLootTypeExtension } from "../../domain/gems/GemLootTypeExtension.js";
import { DamageRollLayoutAdapterRegistry } from "../ui/damage-roll-layout/DamageRollLayoutAdapterRegistry.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render SocketsConfigApp.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/settings/sockets-config.hbs`;

const TAB_RULES = "rules";
const TAB_DISPLAY = "display";
const TAB_TYPES = "types";
const TAB_SUBTYPES = "subtypes";
const TAB_IDS = [TAB_RULES, TAB_DISPLAY, TAB_TYPES, TAB_SUBTYPES];

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, form, formData);
}

/**
 * Unified configuration window for the module, following the Shattered Codex
 * design guide "Sidebar Tabs" archetype: an icon+label rail on the left, one
 * scrollable panel per tab, and a fixed footer with an unsaved-changes status
 * pill next to the actions.
 *
 * The Gem subtypes tab hosts both the subtype selection grid and the custom
 * subtype manager because the former depends on the latter: editing custom
 * subtype rows rebuilds the selection grid live, so new keys can be selected
 * before anything is saved.
 */
export class SocketsConfigApp extends BaseApplication {
  #inputListener;
  #keydownListener;
  #root = null;
  #activeTab = TAB_RULES;
  #baselines = {};
  #saved = false;
  #savedSelection = new Set();
  #systemSubtypes = [];

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-config`,
      tag: "form",
      classes: ["sc-sockets", "sc-config-theme"],
      position: { width: 900, height: 640 },
      window: {
        title: Constants.localize(
          "SCSockets.Settings.ConfigMenu.Title",
          "Simple Sockets — Configuration"
        ),
        icon: "fas fa-gears",
        contentClasses: ["sc-config-theme"],
        resizable: true
      },
      form: {
        handler: handleFormSubmit,
        closeOnSubmit: false,
        submitOnChange: false
      },
      actions: {
        switchTab(event, target) {
          event.preventDefault();
          this.selectTab(target?.dataset?.tabTarget);
        },
        addCustomSubtype(event) {
          event.preventDefault();
          this.addCustomSubtypeRow();
        },
        removeCustomSubtype(event, target) {
          event.preventDefault();
          this.removeCustomSubtypeRow(target);
        },
        resetActiveTab(event) {
          event.preventDefault();
          this.resetActiveTab();
        },
        close(event) {
          event.preventDefault();
          void this.close();
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
    this.#keydownListener = (event) => this.#handleTabKeydown(event);
  }

  async _preparePartContext(partId, context = {}, options) {
    const base = await super._preparePartContext?.(partId, context, options) ?? context;
    if (partId !== "form") {
      return base;
    }
    return foundry.utils.mergeObject(base ?? {}, this.#buildContext(), { inplace: false });
  }

  async _processSubmitData(_event, _form, _formData) {
    await this.#saveAll();
    return {};
  }

  async _updateObject(event, formData) {
    await this._processSubmitData(event, this.form, formData);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.form ?? this.element;
    if (!root) return;

    this.#unbindRoot();
    root.addEventListener("input", this.#inputListener);
    root.addEventListener("change", this.#inputListener);
    root.addEventListener("keydown", this.#keydownListener);
    this.#root = root;

    root
      .querySelectorAll("select[data-dynamic-description]")
      .forEach((field) => this.#updateSelectDescription(field));

    // Remember each custom row's current key so edits can be recognized as
    // renames and carry the checked state over to the new key.
    root
      .querySelectorAll('[data-custom-subtypes] input[data-custom-field="key"]')
      .forEach((input) => {
        input.dataset.prevKey = input.value;
      });

    this.#captureBaselines();
    this.#saved = false;
    this.#refreshDirtyUI();
  }

  _onClose(options) {
    this.#unbindRoot();
    this.#root = null;
    super._onClose?.(options);
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  selectTab(tabId) {
    if (!TAB_IDS.includes(tabId)) return;
    this.#activeTab = tabId;

    const root = this.#root;
    if (!root) return;

    for (const button of root.querySelectorAll("[data-tab-target]")) {
      const active = button.dataset.tabTarget === tabId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("tabindex", active ? "0" : "-1");
    }
    for (const panel of root.querySelectorAll("[data-tab-panel]")) {
      panel.hidden = panel.dataset.tabPanel !== tabId;
    }
  }

  // ---------------------------------------------------------------------------
  // Custom subtype rows (live dependency: rows feed the selection grid)
  // ---------------------------------------------------------------------------

  addCustomSubtypeRow({ key = "", label = "" } = {}) {
    const root = this.#root;
    const container = root?.querySelector?.("[data-custom-subtypes]");
    if (!container) return;

    const index = container.querySelectorAll("[data-subtype-row]").length;
    const keyPlaceholder = container.dataset.placeholderKey ?? "";
    const labelPlaceholder = container.dataset.placeholderLabel ?? "";
    const removeLabel = container.dataset.removeLabel ?? "";
    const keyAriaLabel = container.dataset.keyLabel ?? keyPlaceholder;
    const labelAriaLabel = container.dataset.labelLabel ?? labelPlaceholder;

    const row = document.createElement("li");
    row.className = "sc-config-custom__row";
    row.dataset.subtypeRow = "";
    row.dataset.index = String(index);
    row.innerHTML = `
      <input type="text"
             class="sc-input"
             name="customSubtypes.${index}.key"
             value="${foundry.utils.escapeHTML(key)}"
             placeholder="${foundry.utils.escapeHTML(keyPlaceholder)}"
             aria-label="${foundry.utils.escapeHTML(keyAriaLabel)}"
             data-custom-field="key"
             autocomplete="off" />
      <input type="text"
             class="sc-input"
             name="customSubtypes.${index}.label"
             value="${foundry.utils.escapeHTML(label)}"
             placeholder="${foundry.utils.escapeHTML(labelPlaceholder)}"
             aria-label="${foundry.utils.escapeHTML(labelAriaLabel)}"
             data-custom-field="label"
             autocomplete="off" />
      <button type="button"
              class="sc-icon-btn sc-icon-btn--danger"
              data-action="removeCustomSubtype"
              aria-label="${foundry.utils.escapeHTML(removeLabel)}"
              data-tooltip="${foundry.utils.escapeHTML(removeLabel)}">
        <i class="fas fa-trash-can" aria-hidden="true"></i>
      </button>
    `;

    container.append(row);
    this.#reindexCustomSubtypeRows();
    const keyInput = row.querySelector('input[data-custom-field="key"]');
    if (keyInput) {
      keyInput.dataset.prevKey = keyInput.value;
      keyInput.focus?.();
    }
    this.#syncSubtypeGrid();
    this.#refreshDirtyUI();
  }

  removeCustomSubtypeRow(target) {
    const row = target?.closest?.("[data-subtype-row]");
    if (!row) return;
    const removedKey = String(row.querySelector('input[data-custom-field="key"]')?.value ?? "")
      .trim()
      .toLowerCase();
    row.remove();
    this.#reindexCustomSubtypeRows();
    // Removing a custom-only subtype also drops its selection; otherwise the
    // still-checked key would be resurrected as an orphan option and saved
    // again as a gem subtype without a definition. System subtypes only lose
    // the custom label override and keep their checked state.
    const isSystemSubtype = this.#systemSubtypes.some(
      (entry) => String(entry.value ?? "").toLowerCase() === removedKey
    );
    this.#syncSubtypeGrid({
      dropKeys: removedKey.length && !isSystemSubtype ? new Set([removedKey]) : null
    });
    this.#refreshDirtyUI();
  }

  resetActiveTab() {
    const root = this.#root;
    const panel = root?.querySelector?.(`[data-tab-panel="${this.#activeTab}"]`);
    if (!panel) return;

    if (this.#activeTab === TAB_RULES || this.#activeTab === TAB_DISPLAY) {
      for (const select of panel.querySelectorAll("select[data-default-value]")) {
        select.value = select.dataset.defaultValue;
        if (select.matches("[data-dynamic-description]")) this.#updateSelectDescription(select);
      }
      for (const input of panel.querySelectorAll("input[type='number'][data-default-value]")) {
        input.value = input.dataset.defaultValue;
      }
      for (const input of panel.querySelectorAll("input[type='checkbox'][data-default-checked]")) {
        input.checked = input.dataset.defaultChecked === "true";
      }
    } else if (this.#activeTab === TAB_TYPES) {
      const defaults = new Set(ModuleSettings.getDefaultSocketableItemTypes());
      for (const input of panel.querySelectorAll("input[data-type-value]")) {
        input.checked = defaults.has(String(input.dataset.typeValue ?? "").toLowerCase());
      }
    } else if (this.#activeTab === TAB_SUBTYPES) {
      const defaults = new Set([String(Constants.ITEM_SUBTYPE_GEM ?? "gem").toLowerCase()]);
      for (const input of panel.querySelectorAll("input[data-subtype-value]")) {
        input.checked = defaults.has(String(input.dataset.subtypeValue ?? "").toLowerCase());
      }
      // The defaults have no custom subtypes: clear the rows too, otherwise
      // they would be saved again on the next Save.
      for (const row of panel.querySelectorAll("[data-subtype-row]")) {
        row.remove();
      }
      this.#reindexCustomSubtypeRows();
      this.#syncSubtypeGrid();
    }

    this.#refreshDirtyUI();
  }

  _onClickAction(event, target) {
    const action = target?.dataset?.action;
    switch (action) {
      case "switchTab":
        event.preventDefault();
        this.selectTab(target?.dataset?.tabTarget);
        return;
      case "addCustomSubtype":
        event.preventDefault();
        this.addCustomSubtypeRow();
        return;
      case "removeCustomSubtype":
        event.preventDefault();
        this.removeCustomSubtypeRow(target);
        return;
      case "resetActiveTab":
        event.preventDefault();
        this.resetActiveTab();
        return;
      case "close":
        event.preventDefault();
        void this.close();
        return;
      default:
        return super._onClickAction?.(event, target);
    }
  }

  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------

  #buildContext() {
    GemLootTypeExtension.ensure();

    const formId = this.id ?? `${Constants.MODULE_ID}-config`;
    const strings = this.#buildStrings();

    const savedSelection = ModuleSettings.getGemLootSubtypes();
    this.#savedSelection = new Set(savedSelection.map((value) => String(value ?? "").toLowerCase()));

    const available = GemLootTypeExtension.getAvailableLootSubtypes();
    this.#systemSubtypes = available
      .filter((entry) => !entry.isCustom)
      .map((entry) => ({ value: entry.value, label: entry.label }));

    const customSubtypes = ModuleSettings.getCustomLootSubtypes();
    const subtypeOptions = this.#composeSubtypeOptions({
      customEntries: customSubtypes,
      checkedKeys: this.#savedSelection,
      checkedLabels: new Map()
    });

    return {
      formId,
      tabs: [
        { id: TAB_RULES, icon: "fas fa-gears", label: strings.tabs.rules, active: this.#activeTab === TAB_RULES },
        { id: TAB_DISPLAY, icon: "fas fa-palette", label: strings.tabs.display, active: this.#activeTab === TAB_DISPLAY },
        { id: TAB_TYPES, icon: "fas fa-link", label: strings.tabs.types, active: this.#activeTab === TAB_TYPES },
        { id: TAB_SUBTYPES, icon: "fas fa-gem", label: strings.tabs.subtypes, active: this.#activeTab === TAB_SUBTYPES }
      ],
      rules: {
        active: this.#activeTab === TAB_RULES,
        title: strings.tabs.rules,
        hint: strings.tabs.rulesHint,
        fields: this.#buildRuleFields()
      },
      display: {
        active: this.#activeTab === TAB_DISPLAY,
        title: strings.tabs.display,
        hint: strings.tabs.displayHint,
        fields: this.#buildDisplayFields()
      },
      types: {
        active: this.#activeTab === TAB_TYPES,
        title: strings.tabs.types,
        hint: strings.tabs.typesHint,
        selectLabel: Constants.localize(
          "SCSockets.Settings.SocketableItemTypes.SelectLabel",
          "Item types that can receive sockets"
        ),
        selectHint: Constants.localize(
          "SCSockets.Settings.SocketableItemTypes.SelectHint",
          "Choose one or more item types."
        ),
        options: this.#buildItemTypeOptions()
      },
      subtypes: {
        active: this.#activeTab === TAB_SUBTYPES,
        title: strings.tabs.subtypes,
        hint: strings.tabs.subtypesHint,
        selectLabel: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.SelectLabel",
          "Loot subtypes considered gems"
        ),
        selectHint: Constants.localize(
          "SCSockets.Settings.GemLootSubtypes.SelectHint",
          "Items with these loot subtypes will be treated as gems."
        ),
        options: subtypeOptions,
        customSubtypes: customSubtypes.map((entry) => ({ key: entry.key, label: entry.label })),
        custom: {
          heading: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Heading",
            "Custom loot subtypes"
          ),
          hint: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.Hint",
            "Add new loot subtype keys and labels that will be available for gems."
          ),
          keyLabel: Constants.localize("SCSockets.Settings.GemLootSubtypes.Custom.Key", "Subtype key"),
          keyPlaceholder: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.KeyPlaceholder",
            "e.g. extra"
          ),
          labelLabel: Constants.localize("SCSockets.Settings.GemLootSubtypes.Custom.Label", "Display label"),
          labelPlaceholder: Constants.localize(
            "SCSockets.Settings.GemLootSubtypes.Custom.LabelPlaceholder",
            "Extra"
          ),
          add: Constants.localize("SCSockets.Settings.GemLootSubtypes.Custom.Add", "Add subtype"),
          remove: Constants.localize("SCSockets.Settings.GemLootSubtypes.Custom.Remove", "Remove")
        }
      },
      strings
    };
  }

  #buildStrings() {
    return {
      tabsAria: Constants.localize("SCSockets.Settings.ConfigMenu.Name", "Module configuration"),
      customBadge: Constants.localize("SCSockets.Settings.ConfigMenu.CustomBadge", "custom"),
      save: Constants.localize("SCSockets.Settings.ConfigMenu.Save", "Save Changes"),
      close: Constants.localize("SCSockets.Settings.ConfigMenu.Close", "Close"),
      reset: Constants.localize("SCSockets.Settings.ConfigMenu.Reset", "Reset defaults"),
      unsaved: Constants.localize("SCSockets.Settings.ConfigMenu.Unsaved", "Unsaved changes"),
      savedPill: Constants.localize("SCSockets.Settings.ConfigMenu.SavedPill", "Saved"),
      tabs: {
        rules: Constants.localize("SCSockets.Settings.ConfigMenu.Tabs.Rules", "Socket rules"),
        rulesHint: Constants.localize(
          "SCSockets.Settings.ConfigMenu.Tabs.RulesHint",
          "Control who can edit sockets and how gems behave when attached or removed."
        ),
        display: Constants.localize("SCSockets.Settings.ConfigMenu.Tabs.Display", "Display"),
        displayHint: Constants.localize(
          "SCSockets.Settings.ConfigMenu.Tabs.DisplayHint",
          "Adjust how gem damage and the socket tab are presented in the UI."
        ),
        types: Constants.localize("SCSockets.Settings.ConfigMenu.Tabs.Types", "Item types"),
        typesHint: Constants.localize(
          "SCSockets.Settings.ConfigMenu.Tabs.TypesHint",
          "Choose which item types can receive sockets."
        ),
        subtypes: Constants.localize("SCSockets.Settings.ConfigMenu.Tabs.Subtypes", "Gem subtypes"),
        subtypesHint: Constants.localize(
          "SCSockets.Settings.ConfigMenu.Tabs.SubtypesHint",
          "Select which loot subtypes count as gems and manage custom subtypes. New custom subtypes appear in the selection above as soon as they are added."
        )
      }
    };
  }

  #buildRuleFields() {
    const storedRole = Number(game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_EDIT_SOCKET));
    const editPermissionChoices = Object.entries(ModuleSettings.getEditSocketPermissionChoices()).map(
      ([value, label]) => ({
        value,
        label,
        selected: Number(value) === storedRole
      })
    );

    return [
      {
        key: ModuleSettings.SETTING_EDIT_SOCKET,
        name: Constants.localize("SCSockets.Settings.EditPermission.Name", "Edit Socket Permission"),
        hint: Constants.localize(
          "SCSockets.Settings.EditPermission.Hint",
          "The minimum role required to add or remove sockets from items."
        ),
        isSelect: true,
        defaultValue: String(ModuleSettings.getDefaultEditSocketRole()),
        choices: editPermissionChoices
      },
      {
        key: ModuleSettings.SETTING_MAX_SOCKETS,
        name: Constants.localize(
          "SCSockets.Settings.MaxSockets.Name",
          "Maximum Number of Sockets per Item"
        ),
        hint: Constants.localize(
          "SCSockets.Settings.MaxSockets.Hint",
          "Maximum number of sockets an item can have. Use -1 for unlimited."
        ),
        isNumber: true,
        defaultValue: "6",
        value: Number(game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS) ?? 6)
      },
      {
        key: ModuleSettings.SETTING_DELETE_ON_REMOVE,
        name: Constants.localize("SCSockets.Settings.DeleteOnRemoval.Name", "Delete Gem on Removal"),
        hint: Constants.localize(
          "SCSockets.Settings.DeleteOnRemoval.Hint",
          "If enabled, a gem is destroyed when removed from a socket; otherwise it's returned to the player's inventory."
        ),
        isCheckbox: true,
        defaultChecked: "false",
        checked: ModuleSettings.shouldDeleteGemOnRemoval()
      }
    ];
  }

  #buildDisplayFields() {
    const gemRollLayoutMode = ModuleSettings.getGemRollLayoutMode();
    const gemRollLayoutChoices = ModuleSettings.getGemRollLayoutChoices().map((choice) => ({
      ...choice,
      selected: choice.value === gemRollLayoutMode
    }));
    const gemRollLayoutChoice = DamageRollLayoutAdapterRegistry.getSettingsChoice(gemRollLayoutMode);

    const gemFormulaLayoutMode = ModuleSettings.getGemFormulaLayoutMode();
    const gemFormulaLayoutChoices = ModuleSettings.getGemFormulaLayoutChoices().map((choice) => ({
      ...choice,
      selected: choice.value === gemFormulaLayoutMode
    }));
    const gemFormulaLayoutChoice = gemFormulaLayoutChoices.find((choice) => choice.selected)
      ?? gemFormulaLayoutChoices[0];

    return [
      {
        key: ModuleSettings.SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS,
        name: Constants.localize(
          "SCSockets.Settings.EnableSocketTabForAllItems.Name",
          "Enable Socket Tab on all items"
        ),
        hint: Constants.localize(
          "SCSockets.Settings.EnableSocketTabForAllItems.Hint",
          "If enabled, the Sockets tab appears on every socketable item. If disabled, it must be enabled per item in Details."
        ),
        isCheckbox: true,
        defaultChecked: "true",
        checked: ModuleSettings.shouldEnableSocketTabForAllItems()
      },
      {
        key: ModuleSettings.SETTING_SOCKET_TAB_LAYOUT,
        name: Constants.localize("SCSockets.Settings.SocketTabLayout.Name", "Socket tab layout"),
        hint: Constants.localize(
          "SCSockets.Settings.SocketTabLayout.Hint",
          "Choose how the sockets tab is displayed."
        ),
        isSelect: true,
        defaultValue: ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
        choices: [
          {
            value: ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
            label: Constants.localize("SCSockets.Settings.SocketTabLayout.Options.List", "Default list"),
            selected: ModuleSettings.getSocketTabLayout() === ModuleSettings.SOCKET_TAB_LAYOUT_LIST
          },
          {
            value: ModuleSettings.SOCKET_TAB_LAYOUT_GRID,
            label: Constants.localize("SCSockets.Settings.SocketTabLayout.Options.Grid", "Grid"),
            selected: ModuleSettings.getSocketTabLayout() === ModuleSettings.SOCKET_TAB_LAYOUT_GRID
          }
        ]
      },
      {
        key: ModuleSettings.SETTING_GEM_ROLL_LAYOUT,
        name: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Name",
          "Gem damage layout in roll dialog"
        ),
        hint: Constants.localize(
          "SCSockets.Settings.GemRollLayout.Hint",
          "Choose how gem damage is organized in the damage roll configuration dialog."
        ),
        isSelect: true,
        isDynamicDescription: true,
        defaultValue: DamageRollLayoutAdapterRegistry.getDefaultMode(),
        selectedDescription: gemRollLayoutChoice?.description ?? "",
        choices: gemRollLayoutChoices
      },
      {
        key: ModuleSettings.SETTING_GEM_FORMULA_LAYOUT,
        name: Constants.localize(
          "SCSockets.Settings.GemFormulaLayout.Name",
          "Gem damage in the sheet Formula column"
        ),
        hint: Constants.localize(
          "SCSockets.Settings.GemFormulaLayout.Hint",
          "Choose how the extra damage from socketed gems appears in the Formula column of the character sheet."
        ),
        isSelect: true,
        isDynamicDescription: true,
        defaultValue: ModuleSettings.GEM_FORMULA_LAYOUT_CURRENT,
        selectedDescription: gemFormulaLayoutChoice?.description ?? "",
        choices: gemFormulaLayoutChoices
      },
      {
        key: ModuleSettings.SETTING_GEM_FORMULA_SHOW_IMAGE,
        name: Constants.localize(
          "SCSockets.Settings.GemFormulaShowImage.Name",
          "Show gem image in the Formula breakdown"
        ),
        hint: Constants.localize(
          "SCSockets.Settings.GemFormulaShowImage.Hint",
          "If enabled, gems in the Formula breakdown are identified by a small image; otherwise the gem name is used. The tooltip breakdown always shows the image and this option only hides the gem name there."
        ),
        isCheckbox: true,
        defaultChecked: "true",
        checked: ModuleSettings.shouldShowGemFormulaImages()
      },
      {
        key: ModuleSettings.SETTING_GEM_BADGES_FAVORITES,
        name: Constants.localize(
          "SCSockets.Settings.GemBadgesFavorites.Name",
          "Show gem badges in Favorites"
        ),
        hint: Constants.localize(
          "SCSockets.Settings.GemBadgesFavorites.Hint",
          "If enabled, items with socketed gems also show their gem badges in the Favorites section of the character sheet."
        ),
        isCheckbox: true,
        defaultChecked: "true",
        checked: ModuleSettings.shouldShowGemBadgesInFavorites()
      }
    ];
  }

  #buildItemTypeOptions() {
    const selected = ModuleSettings.getSocketableItemTypes();
    const selectedSet = new Set(selected.map((value) => String(value ?? "").toLowerCase()));
    return ModuleSettings.getAvailableSocketableItemTypes().map((entry) => ({
      value: entry.value,
      label: entry.label,
      selected: selectedSet.has(String(entry.value ?? "").toLowerCase())
    }));
  }

  /**
   * Merges system loot subtypes, custom subtype entries, and previously-saved
   * selections whose key no longer exists into one sorted option list. Used
   * both for the initial render and for the live rebuild when custom rows
   * change.
   */
  #composeSubtypeOptions({ customEntries, checkedKeys, checkedLabels }) {
    const options = new Map();

    for (const entry of this.#systemSubtypes) {
      const lower = String(entry.value ?? "").toLowerCase();
      if (!lower.length) continue;
      options.set(lower, { value: entry.value, label: entry.label, isCustom: false });
    }

    for (const entry of customEntries) {
      const key = String(entry?.key ?? "").trim();
      if (!key.length) continue;
      const lower = key.toLowerCase();
      const label = String(entry?.label ?? "").trim().length
        ? entry.label.trim()
        : ModuleSettings.formatSubtypeLabel(key);
      const existing = options.get(lower);
      options.set(lower, {
        value: existing?.value ?? key,
        label,
        isCustom: true
      });
    }

    for (const lower of checkedKeys) {
      if (options.has(lower) || !this.#savedSelection.has(lower)) continue;
      options.set(lower, {
        value: lower,
        label: checkedLabels.get(lower) ?? ModuleSettings.formatSubtypeLabel(lower),
        isCustom: true
      });
    }

    return Array.from(options.values())
      .map((option) => ({
        ...option,
        selected: checkedKeys.has(String(option.value ?? "").toLowerCase())
      }))
      .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined));
  }

  /**
   * Rebuilds the subtype selection grid from the current custom rows.
   * @param {Object} [options]
   * @param {Set<string>|null} [options.dropKeys] Lowercased keys whose checked
   *   state must be discarded (e.g. a custom subtype row that was just removed).
   * @param {{from: string, to: string}|null} [options.rename] Lowercased key
   *   rename from a custom row edit; the checked state follows the new key.
   */
  #syncSubtypeGrid({ dropKeys = null, rename = null } = {}) {
    const root = this.#root;
    const grid = root?.querySelector?.("[data-subtype-grid]");
    if (!grid) return;

    const checkedKeys = new Set();
    const checkedLabels = new Map();
    for (const input of grid.querySelectorAll("input[data-subtype-value]")) {
      if (!input.checked) continue;
      const lower = String(input.dataset.subtypeValue ?? "").toLowerCase();
      if (!lower.length) continue;
      checkedKeys.add(lower);
      const label = input.closest("label")?.querySelector(".sc-config-choice__label")?.textContent ?? "";
      if (label.trim().length) checkedLabels.set(lower, label.trim());
    }

    for (const lower of dropKeys ?? []) {
      checkedKeys.delete(lower);
      checkedLabels.delete(lower);
    }

    if (rename?.from && checkedKeys.has(rename.from)) {
      const isSystemSubtype = this.#systemSubtypes.some(
        (entry) => String(entry.value ?? "").toLowerCase() === rename.from
      );
      const stillDefined = this.#collectCustomSubtypeEntries().some(
        (entry) => entry.key === rename.from
      );
      if (!isSystemSubtype && !stillDefined) {
        checkedKeys.delete(rename.from);
        checkedLabels.delete(rename.from);
        if (rename.to.length) {
          checkedKeys.add(rename.to);
        }
      }
    }

    const options = this.#composeSubtypeOptions({
      customEntries: this.#collectCustomSubtypeEntries(),
      checkedKeys,
      checkedLabels
    });

    const badgeLabel = grid.dataset.customBadge ?? "custom";
    grid.replaceChildren(
      ...options.map((option) => {
        const label = document.createElement("label");
        label.className = "sc-config-choice";
        label.innerHTML = `
          <input type="checkbox"
                 name="subtypes.${foundry.utils.escapeHTML(option.value)}"
                 data-subtype-value="${foundry.utils.escapeHTML(option.value)}" />
          <span class="sc-check__box"><i class="fas fa-check" aria-hidden="true"></i></span>
          <span class="sc-config-choice__label">${foundry.utils.escapeHTML(option.label)}</span>
          ${option.isCustom ? `<span class="sc-config-badge">${foundry.utils.escapeHTML(badgeLabel)}</span>` : ""}
        `;
        label.querySelector("input").checked = option.selected;
        return label;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Collection
  // ---------------------------------------------------------------------------

  #collectCustomSubtypeEntries(root = this.#root) {
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

      const labelValue = String(row.querySelector('input[data-custom-field="label"]')?.value ?? "").trim();
      const label = labelValue.length ? labelValue : ModuleSettings.formatSubtypeLabel(key);
      entries.push({ key: lower, label });
    }

    entries.sort((a, b) => a.key.localeCompare(b.key, game?.i18n?.lang ?? undefined));
    return entries;
  }

  #collectSelectedSubtypes(root = this.#root) {
    if (!root) return [];
    const checked = root.querySelectorAll("input[data-subtype-value]:checked");
    const seen = new Set();
    const values = [];
    for (const input of checked) {
      const value = String(input.dataset.subtypeValue ?? input.value ?? "").trim();
      if (!value.length) continue;
      const lower = value.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      values.push(value);
    }
    return values;
  }

  #collectSelectedTypes(root = this.#root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll("input[data-type-value]:checked"))
      .map((input) => String(input.dataset.typeValue ?? "").trim().toLowerCase())
      .filter((value) => value.length);
  }

  #collectBehaviorValues(root = this.#root) {
    const form = root instanceof HTMLFormElement ? root : this.form;
    const field = (name) => form?.elements?.namedItem?.(name) ?? root?.querySelector?.(`[name="${name}"]`);

    const roleChoices = ModuleSettings.getEditSocketPermissionChoices();
    const editPermissionValue = String(field(ModuleSettings.SETTING_EDIT_SOCKET)?.value ?? "");
    const editPermission = Object.hasOwn(roleChoices, editPermissionValue)
      ? Number(editPermissionValue)
      : ModuleSettings.getDefaultEditSocketRole();

    const parsedMaxSockets = Number.parseInt(String(field(ModuleSettings.SETTING_MAX_SOCKETS)?.value ?? ""), 10);
    const maxSockets = Number.isInteger(parsedMaxSockets) ? parsedMaxSockets : 6;

    const checkboxValue = (name, fallback) => {
      const input = field(name);
      return input instanceof HTMLInputElement ? input.checked : fallback;
    };

    const gemFormulaLayoutValue = String(field(ModuleSettings.SETTING_GEM_FORMULA_LAYOUT)?.value ?? "")
      .trim()
      .toLowerCase();
    const gemFormulaLayout = ModuleSettings.getGemFormulaLayoutModes().includes(gemFormulaLayoutValue)
      ? gemFormulaLayoutValue
      : ModuleSettings.GEM_FORMULA_LAYOUT_CURRENT;

    const socketTabLayoutValue = String(field(ModuleSettings.SETTING_SOCKET_TAB_LAYOUT)?.value ?? "")
      .trim()
      .toLowerCase();
    const socketTabLayout = [
      ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
      ModuleSettings.SOCKET_TAB_LAYOUT_GRID
    ].includes(socketTabLayoutValue)
      ? socketTabLayoutValue
      : ModuleSettings.SOCKET_TAB_LAYOUT_LIST;

    return {
      editPermission,
      maxSockets,
      deleteOnRemoval: checkboxValue(ModuleSettings.SETTING_DELETE_ON_REMOVE, false),
      gemRollLayout: DamageRollLayoutAdapterRegistry.normalizeMode(
        field(ModuleSettings.SETTING_GEM_ROLL_LAYOUT)?.value
      ),
      gemFormulaLayout,
      gemFormulaShowImage: checkboxValue(ModuleSettings.SETTING_GEM_FORMULA_SHOW_IMAGE, true),
      gemBadgesFavorites: checkboxValue(ModuleSettings.SETTING_GEM_BADGES_FAVORITES, true),
      socketTabLayout,
      enableSocketTabForAllItems: checkboxValue(ModuleSettings.SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS, true)
    };
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async #saveAll() {
    // Custom subtypes must land first: the selection below may reference keys
    // that only exist once GemLootTypeExtension re-registers them in CONFIG.
    const custom = this.#collectCustomSubtypeEntries();
    await ModuleSettings.setCustomLootSubtypes(custom);
    GemLootTypeExtension.ensure();

    const selection = await ModuleSettings.setGemLootSubtypes(this.#collectSelectedSubtypes());
    this.#savedSelection = new Set(selection.map((value) => String(value ?? "").toLowerCase()));

    await ModuleSettings.setSocketableItemTypes(this.#collectSelectedTypes());

    const behavior = this.#collectBehaviorValues();
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_EDIT_SOCKET, behavior.editPermission);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS, behavior.maxSockets);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_DELETE_ON_REMOVE, behavior.deleteOnRemoval);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT, behavior.gemRollLayout);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_FORMULA_LAYOUT, behavior.gemFormulaLayout);
    await game.settings.set(
      Constants.MODULE_ID,
      ModuleSettings.SETTING_GEM_FORMULA_SHOW_IMAGE,
      behavior.gemFormulaShowImage
    );
    await game.settings.set(
      Constants.MODULE_ID,
      ModuleSettings.SETTING_GEM_BADGES_FAVORITES,
      behavior.gemBadgesFavorites
    );
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKET_TAB_LAYOUT, behavior.socketTabLayout);
    await game.settings.set(
      Constants.MODULE_ID,
      ModuleSettings.SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS,
      behavior.enableSocketTabForAllItems
    );

    this.#captureBaselines();
    this.#saved = true;
    this.#refreshDirtyUI();

    ui.notifications.info(
      Constants.localize("SCSockets.Settings.ConfigMenu.SavedNotification", "Simple Sockets settings saved.")
    );
  }

  // ---------------------------------------------------------------------------
  // Dirty tracking + status pill
  // ---------------------------------------------------------------------------

  #handleInput(event) {
    const target = event?.target;
    if (target instanceof HTMLSelectElement && target.matches("[data-dynamic-description]")) {
      this.#updateSelectDescription(target);
    }
    if (target instanceof HTMLElement && target.closest("[data-custom-subtypes]")) {
      this.#syncSubtypeGrid({ rename: this.#detectKeyRename(target) });
    }
    this.#refreshDirtyUI();
  }

  /**
   * Recognizes an edit of a custom row's key input as a rename, so the grid
   * sync can carry the checked state from the old key to the new one instead
   * of leaving the old key behind as a checked orphan option.
   */
  #detectKeyRename(target) {
    if (!(target instanceof HTMLInputElement) || target.dataset.customField !== "key") {
      return null;
    }
    const from = String(target.dataset.prevKey ?? "").trim().toLowerCase();
    const to = String(target.value ?? "").trim().toLowerCase();
    target.dataset.prevKey = target.value ?? "";
    if (!from.length || from === to) {
      return null;
    }
    return { from, to };
  }

  #snapshotTab(tabId) {
    switch (tabId) {
      case TAB_RULES: {
        const behavior = this.#collectBehaviorValues();
        return JSON.stringify([behavior.editPermission, behavior.maxSockets, behavior.deleteOnRemoval]);
      }
      case TAB_DISPLAY: {
        const behavior = this.#collectBehaviorValues();
        return JSON.stringify([
          behavior.enableSocketTabForAllItems,
          behavior.socketTabLayout,
          behavior.gemRollLayout,
          behavior.gemFormulaLayout,
          behavior.gemFormulaShowImage,
          behavior.gemBadgesFavorites
        ]);
      }
      case TAB_TYPES:
        return JSON.stringify(this.#collectSelectedTypes().sort());
      case TAB_SUBTYPES:
        return JSON.stringify({
          selected: this.#collectSelectedSubtypes()
            .map((value) => value.toLowerCase())
            .sort(),
          custom: this.#collectCustomSubtypeEntries()
        });
      default:
        return "";
    }
  }

  #captureBaselines() {
    this.#baselines = {};
    for (const tabId of TAB_IDS) {
      this.#baselines[tabId] = this.#snapshotTab(tabId);
    }
  }

  #refreshDirtyUI() {
    const root = this.#root;
    if (!root) return;

    let anyDirty = false;
    for (const tabId of TAB_IDS) {
      const dirty = this.#snapshotTab(tabId) !== this.#baselines[tabId];
      anyDirty ||= dirty;
      const dot = root.querySelector(`[data-tab-dot="${tabId}"]`);
      if (dot) dot.hidden = !dirty;
    }
    if (anyDirty) this.#saved = false;

    const pill = root.querySelector("[data-status-pill]");
    const label = root.querySelector("[data-status-pill-label]");
    if (!pill || !label) return;

    pill.classList.remove("sc-config-pill--unsaved", "sc-config-pill--saved");
    if (anyDirty) {
      pill.hidden = false;
      pill.classList.add("sc-config-pill--unsaved");
      label.textContent = Constants.localize("SCSockets.Settings.ConfigMenu.Unsaved", "Unsaved changes");
    } else if (this.#saved) {
      pill.hidden = false;
      pill.classList.add("sc-config-pill--saved");
      label.textContent = Constants.localize("SCSockets.Settings.ConfigMenu.SavedPill", "Saved");
    } else {
      pill.hidden = true;
      label.textContent = "";
    }

    const saveButton = root.querySelector("[data-save-button]");
    if (saveButton) saveButton.classList.toggle("is-dirty", anyDirty);
  }

  // ---------------------------------------------------------------------------
  // Misc helpers
  // ---------------------------------------------------------------------------

  #reindexCustomSubtypeRows() {
    const container = this.#root?.querySelector?.("[data-custom-subtypes]");
    if (!container) return;
    container.querySelectorAll("[data-subtype-row]").forEach((row, index) => {
      row.dataset.index = String(index);
      const keyInput = row.querySelector('input[data-custom-field="key"]');
      const labelInput = row.querySelector('input[data-custom-field="label"]');
      if (keyInput) keyInput.name = `customSubtypes.${index}.key`;
      if (labelInput) labelInput.name = `customSubtypes.${index}.label`;
    });
  }

  #updateSelectDescription(field) {
    if (!(field instanceof HTMLSelectElement)) return;
    const row = field.closest(".sc-config-row");
    const target = row?.querySelector?.("[data-select-description]");
    if (!(target instanceof HTMLElement)) return;
    target.textContent = field.selectedOptions?.[0]?.dataset?.description ?? "";
  }

  #unbindRoot() {
    const root = this.#root;
    if (!root) return;
    root.removeEventListener("input", this.#inputListener);
    root.removeEventListener("change", this.#inputListener);
    root.removeEventListener("keydown", this.#keydownListener);
  }

  /** Roving arrow-key navigation for the sidebar tabs, per the WAI-ARIA tabs pattern. */
  #handleTabKeydown(event) {
    const tab = event.target instanceof HTMLElement ? event.target.closest('[role="tab"]') : null;
    const tablist = tab?.closest?.('[role="tablist"]');
    if (!tab || !tablist) return;

    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]:not([disabled])'));
    const index = tabs.indexOf(tab);
    if (index < 0) return;

    let nextIndex = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = tabs[nextIndex];
    next?.focus?.();
    next?.click?.();
  }
}

/**
 * Thin launcher registered as the settings menu `type`: Foundry instantiates
 * it and calls `render`, which forwards to a shared SocketsConfigApp instance.
 */
export class SocketsConfigLauncher extends foundry.applications.api.ApplicationV2 {
  static #instance = null;

  render(_force = false, options = {}) {
    SocketsConfigLauncher.#instance ??= new SocketsConfigApp();
    SocketsConfigLauncher.#instance.render(true, options);
    return this;
  }
}
