import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";
import { SocketBehaviorSettingsLauncher } from "./SocketBehaviorSettingsLauncher.js";
import { DocumentationMenu } from "./DocumentationMenu.js";
import { SupportMenu } from "./SupportMenu.js";
import { DamageRollLayoutAdapterRegistry } from "../ui/damage-roll-layout/DamageRollLayoutAdapterRegistry.js";
import { TidyIntegration } from "../integration/TidyIntegration.js";

/**
 * Registers all game settings and menus for the module.
 * Instantiate once and call `register()` during the `init` hook.
 * Reading and writing settings at runtime is done via the static
 * methods on `ModuleSettings`.
 */
export class ModuleSettingsRegistrar {
  static #runtimeHooksRegistered = false;
  static #settingsConfigHookRegistered = false;
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
    ModuleSettingsRegistrar.#registerSettingsConfigHook();
    this.#registerEditSocketPermission();
    this.#registerSocketableItemTypeSetting();
    this.#registerMaxSockets();
    this.#registerDeleteOnRemoval();
    this.#registerGemRollLayoutSetting();
    this.#registerGemFormulaLayoutSettings();
    this.#registerSocketTabLayoutSetting();
    this.#registerEnableSocketTabForAllItems();
    this.#registerLootSubtypeDataSettings();
    this.#registerSupportCardSettings();
    this.#registerDebugTraceSetting();
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

  static #registerSettingsConfigHook() {
    if (ModuleSettingsRegistrar.#settingsConfigHookRegistered) return;
    ModuleSettingsRegistrar.#settingsConfigHookRegistered = true;

    Hooks.on("renderSettingsConfig", (_app, html) => {
      SupportMenu.bindSettingsButton(html);
      DocumentationMenu.bindSettingsButton(html);
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
      default: ModuleSettings.getDefaultSocketableItemTypes(),
      onChange: () => {
        ModuleSettings.refreshOpenSheets({ item: true, actor: true });
        void TidyIntegration.syncAllItemTabConfigurations();
      }
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
    const choices = DamageRollLayoutAdapterRegistry.getSettingsChoices().reduce((accumulator, choice) => {
      accumulator[choice.value] = choice.label;
      return accumulator;
    }, {});

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT, {
      name: Constants.localize(
        "SCSockets.Settings.GemRollLayout.Name",
        "Gem damage layout in roll dialog"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.GemRollLayout.Hint",
        "Choose how gem damage is organized in the damage roll configuration dialog."
      ),
      scope: "client",
      config: false,
      type: String,
      choices,
      default: DamageRollLayoutAdapterRegistry.getDefaultMode(),
      onChange: async (value) => {
        const { DamageRollGemLayout } = await import("../ui/DamageRollGemLayout.js");
        DamageRollGemLayout.activate({ mode: value });
      }
    });
  }

  #registerGemFormulaLayoutSettings() {
    const choices = ModuleSettings.getGemFormulaLayoutChoices().reduce((accumulator, choice) => {
      accumulator[choice.value] = choice.label;
      return accumulator;
    }, {});

    const refreshActorSheets = foundry.utils.debounce(
      () => ModuleSettings.refreshOpenSheets({ item: false, actor: true }),
      150
    );

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_FORMULA_LAYOUT, {
      name: Constants.localize(
        "SCSockets.Settings.GemFormulaLayout.Name",
        "Gem damage in the sheet Formula column"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.GemFormulaLayout.Hint",
        "Choose how the extra damage from socketed gems appears in the Formula column of the character sheet."
      ),
      scope: "client",
      config: false,
      type: String,
      choices,
      default: ModuleSettings.GEM_FORMULA_LAYOUT_CURRENT,
      onChange: refreshActorSheets
    });

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_FORMULA_SHOW_IMAGE, {
      name: Constants.localize(
        "SCSockets.Settings.GemFormulaShowImage.Name",
        "Show gem image in the Formula breakdown"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.GemFormulaShowImage.Hint",
        "If enabled, gems in the Formula breakdown are identified by a small image; otherwise the gem name is used. The tooltip breakdown always shows the image and this option only hides the gem name there."
      ),
      scope: "client",
      config: false,
      type: Boolean,
      default: true,
      onChange: refreshActorSheets
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
      default: [],
      onChange: () => {
        ModuleSettings.refreshOpenSheets({ item: true, actor: true });
      }
    });

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_LOOT_SUBTYPES, {
      scope: "world",
      config: false,
      type: Array,
      default: [Constants.ITEM_SUBTYPE_GEM],
      onChange: () => {
        ModuleSettings.refreshOpenSheets({ item: true, actor: true });
        void TidyIntegration.syncAllItemTabConfigurations();
      }
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
        "Hide automatic What's New popup until next update"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.HideSupportCard.Hint",
        "After the What's New popup appears for the current version, this option can keep it hidden until the next update. Uncheck it if you want the popup to appear whenever the world loads."
      ),
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_CARD_VERSION, {
      scope: "client",
      config: false,
      type: String,
      default: ""
    });
  }

  #registerDebugTraceSetting() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_DEBUG_TRACE, {
      name: Constants.localize(
        "SCSockets.Settings.DebugTrace.Name",
        "Debug trace logging"
      ),
      hint: Constants.localize(
        "SCSockets.Settings.DebugTrace.Hint",
        "Logs item updates, sheet renders, and focus changes to the browser console to diagnose socket UI issues."
      ),
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        console.info(`[${Constants.MODULE_ID}] debug trace ${value ? "enabled" : "disabled"}`);
      }
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
