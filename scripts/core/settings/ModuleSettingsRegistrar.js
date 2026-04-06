import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";
import { SocketBehaviorSettingsLauncher } from "./SocketBehaviorSettingsLauncher.js";
import { DocumentationMenu } from "./DocumentationMenu.js";
import { SupportMenu } from "./SupportMenu.js";

/**
 * Registers all game settings and menus for the module.
 * Instantiate once and call `register()` during the `init` hook.
 * Reading and writing settings at runtime is done via the static
 * methods on `ModuleSettings`.
 */
export class ModuleSettingsRegistrar {
  static #runtimeHooksRegistered = false;
  #settingsRegistered = false;

  /**
   * Registers all `game.settings.register` calls synchronously.
   * Must be called before any `await` in the `init` hook so that settings are
   * available when later hooks (`setup`, `ready`) fire — Foundry does NOT await
   * async hook callbacks, so anything after an `await` may run too late.
   */
  registerSettings() {
    if (this.#settingsRegistered) return;
    this.#settingsRegistered = true;

    ModuleSettingsRegistrar.#registerRuntimeHooks();
    this.#registerEditSocketPermission();
    this.#registerSocketableItemTypeSetting();
    this.#registerMaxSockets();
    this.#registerDeleteOnRemoval();
    this.#registerGemRollLayoutSetting();
    this.#registerSocketTabLayoutSetting();
    this.#registerEnableSocketTabForAllItems();
    this.#registerLootSubtypeDataSettings();
    this.#registerSupportCardSettings();
    this.#registerMigrationSettings();
  }

  /**
   * Registers menus that require dynamically-imported types, plus any remaining
   * synchronous menus. Call `registerSettings()` first (synchronously), then
   * await this method to finish the full registration.
   */
  async register() {
    this.registerSettings();
    this.#registerSupportMenu();
    this.#registerDocumentationMenu();
    this.#registerSocketBehaviorMenu();
    await this.#registerSocketableItemTypeMenu();
    await this.#registerLootSubtypeMenus();
  }

  // ---------------------------------------------------------------------------
  // Runtime hooks (registered once per session, not per world-load)
  // ---------------------------------------------------------------------------

  static #registerRuntimeHooks() {
    if (ModuleSettingsRegistrar.#runtimeHooksRegistered) return;
    ModuleSettingsRegistrar.#runtimeHooksRegistered = true;

    const syncItemSocketTabFlag = async (item) => {
      if (ModuleSettings.shouldEnableSocketTabForAllItems()) return;
      if (!ModuleSettings.itemHasSockets(item) || ModuleSettings.isItemSocketTabEnabledByFlag(item)) return;
      await ModuleSettings.ensureItemSocketTabEnabled(item);
    };

    Hooks.on("createItem", (item) => {
      void syncItemSocketTabFlag(item);
    });

    Hooks.on("updateItem", (item, changes) => {
      if (ModuleSettings.shouldEnableSocketTabForAllItems()) return;

      const socketsPath = `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;
      const socketTabPath = `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_TAB_ENABLED}`;
      if (
        !foundry.utils.hasProperty(changes, socketsPath) &&
        !foundry.utils.hasProperty(changes, socketTabPath)
      ) return;

      void syncItemSocketTabFlag(item);
    });
  }

  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------

  #registerSupportMenu() {
    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_MENU, {
      name: Constants.localize("SCSockets.Settings.SupportMenu.Name", "Support the developer"),
      label: Constants.localize("SCSockets.Settings.SupportMenu.Label", "Patreon support"),
      hint: Constants.localize(
        "SCSockets.Settings.SupportMenu.Hint",
        "Get access to SC - More Gems with 120+ gems, and more every month. We are also building SC - Setforge to create item sets."
      ),
      icon: "fas fa-heart",
      type: SupportMenu,
      restricted: true
    });

    Hooks.on("renderSettingsConfig", (_app, html) => {
      SupportMenu.bindSettingsButton(html);
    });
  }

  #registerDocumentationMenu() {
    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_DOCUMENTATION_MENU, {
      name: Constants.localize("SCSockets.Settings.DocumentationMenu.Name", "Documentation"),
      label: Constants.localize("SCSockets.Settings.DocumentationMenu.Label", "Open wiki"),
      hint: Constants.localize(
        "SCSockets.Settings.DocumentationMenu.Hint",
        "Open the SC - Simple Sockets documentation wiki."
      ),
      icon: "fas fa-hat-wizard",
      type: DocumentationMenu,
      restricted: true
    });

    Hooks.on("renderSettingsConfig", (_app, html) => {
      DocumentationMenu.bindSettingsButton(html);
    });
  }

  #registerSocketBehaviorMenu() {
    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKET_BEHAVIOR_MENU, {
      name: Constants.localize("SCSockets.Settings.SocketBehaviorMenu.Name", "Socket settings"),
      label: Constants.localize(
        "SCSockets.Settings.SocketBehaviorMenu.Label",
        "Configure socket settings"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.SocketBehaviorMenu.Hint",
        "Open a dedicated window for socket permissions, limits, gem handling, and layout options."
      ),
      icon: "fas fa-gears",
      type: SocketBehaviorSettingsLauncher,
      restricted: true
    });
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  #registerEditSocketPermission() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_EDIT_SOCKET, {
      name: Constants.localize("SCSockets.Settings.EditPermission.Name", "Edit Socket Permission"),
      hint: Constants.localize(
        "SCSockets.Settings.EditPermission.Hint",
        "The minimum role required to add or remove sockets from items."
      ),
      scope: "world",
      config: false,
      type: Number,
      choices: ModuleSettings.getEditSocketPermissionChoices(),
      default: ModuleSettings.getDefaultEditSocketRole(),
      onChange: (value) => {
        if (Constants.isDebugEnabled()) {
          console.log(`${Constants.MODULE_ID} | editSocketPermission changed to ${value}`);
        }
        ModuleSettings.refreshOpenSheets({ item: true, actor: true });
      }
    });
  }

  #registerSocketableItemTypeSetting() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES, {
      scope: "world",
      config: false,
      type: Array,
      default: ModuleSettings.getDefaultSocketableItemTypes()
    });
  }

  async #registerSocketableItemTypeMenu() {
    const { SocketableItemTypesSettings } = await import("./SocketableItemTypesSettings.js");

    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES_MENU, {
      name: Constants.localize("SCSockets.Settings.SocketableItemTypes.Name", "Socketable Item Types"),
      label: Constants.localize(
        "SCSockets.Settings.SocketableItemTypes.Label",
        "Configure Socketable Item Types"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.SocketableItemTypes.Hint",
        "Choose which item types can receive sockets."
      ),
      icon: "fas fa-link",
      type: SocketableItemTypesSettings,
      restricted: true
    });
  }

  #registerMaxSockets() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS, {
      name: Constants.localize(
        "SCSockets.Settings.MaxSockets.Name",
        "Maximum Number of Sockets per Item"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.MaxSockets.Hint",
        "Maximum number of sockets an item can have. Use -1 for unlimited."
      ),
      scope: "world",
      config: false,
      type: Number,
      default: 6
    });
  }

  #registerDeleteOnRemoval() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_DELETE_ON_REMOVE, {
      name: Constants.localize("SCSockets.Settings.DeleteOnRemoval.Name", "Delete Gem on Removal"),
      hint: Constants.localize(
        "SCSockets.Settings.DeleteOnRemoval.Hint",
        "If enabled, a gem is destroyed when removed from a socket; otherwise it's returned to the player's inventory."
      ),
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });
  }

  #registerGemRollLayoutSetting() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT, {
      name: Constants.localize(
        "SCSockets.Settings.GemRollLayout.Name",
        "Gem damage layout in roll dialog"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.GemRollLayout.Hint",
        "Enable the grouped-by-gem layout in the damage roll configuration dialog."
      ),
      scope: "client",
      config: false,
      type: Boolean,
      default: true,
      onChange: async (value) => {
        const { DamageRollGemLayout } = await import("../ui/DamageRollGemLayout.js");
        DamageRollGemLayout.activate({ mode: value ? "gem" : "type" });
      }
    });
  }

  #registerSocketTabLayoutSetting() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKET_TAB_LAYOUT, {
      name: Constants.localize("SCSockets.Settings.SocketTabLayout.Name", "Socket tab layout"),
      hint: Constants.localize(
        "SCSockets.Settings.SocketTabLayout.Hint",
        "Choose how the sockets tab is displayed."
      ),
      scope: "world",
      config: false,
      type: String,
      choices: {
        [ModuleSettings.SOCKET_TAB_LAYOUT_LIST]: Constants.localize(
          "SCSockets.Settings.SocketTabLayout.Options.List",
          "Default list"
        ),
        [ModuleSettings.SOCKET_TAB_LAYOUT_GRID]: Constants.localize(
          "SCSockets.Settings.SocketTabLayout.Options.Grid",
          "Grid"
        )
      },
      default: ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
      onChange: foundry.utils.debounce(
        () => ModuleSettings.refreshOpenSheets({ item: true, actor: false }),
        150
      )
    });
  }

  #registerEnableSocketTabForAllItems() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS, {
      name: Constants.localize(
        "SCSockets.Settings.EnableSocketTabForAllItems.Name",
        "Enable Socket Tab on all items"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.EnableSocketTabForAllItems.Hint",
        "If enabled, the Sockets tab appears on every socketable item. If disabled, it must be enabled per item in Details."
      ),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      onChange: async (value) => {
        if (value === false) {
          await ModuleSettings.syncSocketTabFlagsForExistingItems();
        }
        ModuleSettings.refreshOpenSheets({ item: true, actor: true });
      }
    });
  }

  #registerLootSubtypeDataSettings() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPES, {
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_LOOT_SUBTYPES, {
      scope: "world",
      config: false,
      type: Array,
      default: [Constants.ITEM_SUBTYPE_GEM]
    });
  }

  async #registerLootSubtypeMenus() {
    const { GemSubtypeSelectionSettings } = await import("./GemSubtypeSelectionSettings.js");
    const { GemCustomSubtypeSettings } = await import("./GemCustomSubtypeSettings.js");

    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_LOOT_SUBTYPE_MENU, {
      name: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.Selection.Name",
        "Gem Loot Subtypes"
      ),
      label: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.Selection.Label",
        "Configure Gem Loot Subtypes"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.Selection.Hint",
        "Select which loot subtypes count as gems."
      ),
      icon: "fas fa-gem",
      type: GemSubtypeSelectionSettings,
      restricted: true
    });

    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPE_MENU, {
      name: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.CustomMenu.Name",
        "Custom Loot Subtypes"
      ),
      label: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.CustomMenu.Label",
        "Configure Custom Loot Subtypes"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.CustomMenu.Hint",
        "Add custom loot subtype keys and labels that can be used as gems."
      ),
      icon: "fas fa-list",
      type: GemCustomSubtypeSettings,
      restricted: true
    });
  }

  #registerSupportCardSettings() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_HIDE_SUPPORT_CARD, {
      name: Constants.localize(
        "SCSockets.Settings.HideSupportCard.Name",
        "Hide automatic support message until next update"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.HideSupportCard.Hint",
        "After the support card appears once for the current version, this option is checked automatically. Uncheck it if you want the card to appear whenever the world loads."
      ),
      scope: "client",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_CARD_VERSION, {
      scope: "client",
      config: false,
      type: String,
      default: ""
    });
  }

  #registerMigrationSettings() {
    game.settings.register(Constants.MODULE_ID, "migrationVersion", {
      scope: "world",
      config: false,
      type: String,
      default: ""
    });
  }
}
