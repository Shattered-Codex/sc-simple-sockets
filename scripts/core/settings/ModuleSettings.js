import { Constants } from "../Constants.js";
import { SupportMenu } from "./SupportMenu.js";

export class ModuleSettings {
  static #DISALLOWED_SOCKETABLE_TYPES = new Set(["container"]);
  static SETTING_GEM_BADGES = "gemBadgesEnabled";
  static SETTING_EDIT_SOCKET = "editSocketPermission";
  static SETTING_MAX_SOCKETS = "maxSockets";
  static SETTING_DELETE_ON_REMOVE = "deleteGemOnRemoval";
  static SETTING_GEM_ROLL_LAYOUT = "gemRollLayout";
  static SETTING_SOCKETABLE_ITEM_TYPES = "socketableItemTypes";
  static SETTING_SOCKETABLE_ITEM_TYPES_MENU = "socketableItemTypesSettings";
  static SETTING_SUPPORT_CARD = "supportCardDisabled";
  static SETTING_LAST_MODULE_VERSION = "lastModuleVersion";
  static SETTING_SUPPORT_MENU = "supportMenu";
  static SETTING_GEM_LOOT_SUBTYPES = Constants.SETTING_GEM_LOOT_SUBTYPES;
  static SETTING_LOOT_SUBTYPE_MENU = Constants.SETTING_LOOT_SUBTYPE_MENU;
  static SETTING_CUSTOM_LOOT_SUBTYPES = Constants.SETTING_CUSTOM_LOOT_SUBTYPES;
  static SETTING_CUSTOM_LOOT_SUBTYPE_MENU = "customLootSubtypeMenu";

  constructor() {
  }

  async register() {
    this.#registerSupportMenu();
    this.#registerSupportCardSetting();
    this.#registerLastModuleVersionSetting();
    this.#registerEditSocketPermission();
    await this.#registerSocketableItemTypeSettings();
    this.#registerMaxSockets();
    this.#registerDeleteOnRemoval();
    this.#registerGemRollLayoutSetting();
    await this.#registerLootSubtypeSettings();
  }

  static canAddOrRemoveSocket(user = game.user) {
    if (!user) return false;
    if (user.isGM) return true;

    const stored = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_EDIT_SOCKET);
    const minRole = ModuleSettings.#resolveRoleLevel(stored);
    return user.hasRole(minRole);
  }

  static getMaxSockets() {
    const val = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS);
    if (typeof val !== "number") {
      console.warn(`${Constants.MODULE_ID} setting ${ModuleSettings.SETTING_MAX_SOCKETS} is not a number`);
      return Infinity;
    }
    if (val < 0) return Infinity;
    return val;
  }

  static shouldDeleteGemOnRemoval() {
    return game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_DELETE_ON_REMOVE);
  }

  static getSocketableItemTypes() {
    const raw = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES);
    const parsed = ModuleSettings.#parseSocketableTypes(raw);
    if (parsed.length) {
      return parsed;
    }
    return [...ModuleSettings.#defaultSocketableItemTypes()];
  }

  static getDefaultSocketableItemTypes() {
    return [...ModuleSettings.#defaultSocketableItemTypes()];
  }

  static async setSocketableItemTypes(types = []) {
    const cleaned = ModuleSettings.#parseSocketableTypes(types);
    if (!cleaned.length) {
      cleaned.push(...ModuleSettings.#defaultSocketableItemTypes());
    }
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES, cleaned);
    return cleaned;
  }

  static isItemSocketable(item) {
    return ModuleSettings.isItemSocketableByType(item) || ModuleSettings.itemHasSockets(item);
  }

  static isItemSocketableByType(item) {
    const type = typeof item?.type === "string"
      ? item.type.trim().toLowerCase()
      : String(item?.type ?? "").trim().toLowerCase();
    if (!type.length) {
      return false;
    }

    return ModuleSettings.getSocketableItemTypes().includes(type);
  }

  static itemHasSockets(item) {
    const sockets = item?.getFlag?.(Constants.MODULE_ID, Constants.FLAGS?.sockets ?? "sockets");
    return Array.isArray(sockets) && sockets.length > 0;
  }

  static getAvailableSocketableItemTypes() {
    const options = new Map();
    const dnd5eTypes = CONFIG?.DND5E?.itemTypes ?? {};
    const itemTypeLabels = CONFIG?.Item?.typeLabels ?? {};
    const itemDataModels = CONFIG?.Item?.dataModels ?? {};

    const pushOption = (typeKey, labelSource) => {
      const value = String(typeKey ?? "").trim().toLowerCase();
      if (!value.length) {
        return;
      }
      if (ModuleSettings.#isDisallowedSocketableType(value)) {
        return;
      }

      const label = ModuleSettings.#resolveItemTypeLabel(labelSource, value);
      options.set(value, { value, label });
    };

    for (const [key, value] of Object.entries(dnd5eTypes)) {
      pushOption(key, value);
    }

    for (const [key, value] of Object.entries(itemTypeLabels)) {
      pushOption(key, value);
    }

    for (const key of Object.keys(itemDataModels)) {
      pushOption(key, itemTypeLabels[key] ?? dnd5eTypes[key] ?? key);
    }

    return Array.from(options.values())
      .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined));
  }

  static shouldUseGemRollLayout() {
    return game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT) ?? true;
  }

  static async suppressSupportCardOnModuleUpdate() {
    if (!game.user?.isGM) {
      return;
    }

    const module = game.modules?.get?.(Constants.MODULE_ID);
    const currentVersion = String(module?.version ?? module?.data?.version ?? "").trim();
    if (!currentVersion.length) {
      return;
    }

    const lastVersion = String(
      game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_LAST_MODULE_VERSION) ?? ""
    ).trim();

    const isUpdate = Boolean(lastVersion.length) && lastVersion !== currentVersion;
    if (isUpdate) {
      await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_CARD, true);
    }

    if (lastVersion !== currentVersion) {
      await game.settings.set(
        Constants.MODULE_ID,
        ModuleSettings.SETTING_LAST_MODULE_VERSION,
        currentVersion
      );
    }
  }

  static refreshOpenSheets({ item = true, actor = true } = {}) {
    const windows = Object.values(ui?.windows ?? {});
    for (const app of windows) {
      if (!app?.rendered || typeof app.render !== "function") continue;
      const doc = app.document ?? app.object;
      const documentName = String(doc?.documentName ?? "").toLowerCase();

      const shouldRenderItem = item && documentName === "item";
      const shouldRenderActor = actor && documentName === "actor";
      if (!shouldRenderItem && !shouldRenderActor) continue;

      app.render(false);
    }
  }

  static getGemLootSubtypes() {
    const raw = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_LOOT_SUBTYPES);
    if (!Array.isArray(raw)) {
      return [Constants.ITEM_SUBTYPE_GEM];
    }
    const cleaned = [];
    const seen = new Set();
    for (const value of raw) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed.length) continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      cleaned.push(trimmed);
    }
    if (!cleaned.length) {
      cleaned.push(Constants.ITEM_SUBTYPE_GEM);
    }
    return cleaned;
  }

  #registerGemRollLayoutSetting() {
    const name = Constants.localize("SCSockets.Settings.GemRollLayout.Name", "Gem damage layout in roll dialog");
    const hint = Constants.localize(
      "SCSockets.Settings.GemRollLayout.Hint",
      "Enable the grouped-by-gem layout in the damage roll configuration dialog."
    );

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT, {
      name,
      hint,
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: async (value) => {
        const { DamageRollGemLayout } = await import("../ui/DamageRollGemLayout.js");
        const mode = value ? "gem" : "type";
        DamageRollGemLayout.activate({ mode });
      }
    });
  }

  static async setGemLootSubtypes(subtypes = []) {
    const normalized = Array.isArray(subtypes) ? subtypes : [subtypes];
    const cleaned = [];
    const seen = new Set();
    for (const value of normalized) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed.length) continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      cleaned.push(trimmed);
    }
    if (!cleaned.length) {
      cleaned.push(Constants.ITEM_SUBTYPE_GEM);
    }
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_LOOT_SUBTYPES, cleaned);
    return cleaned;
  }

  static getCustomLootSubtypes() {
    const raw = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPES);
    const entries = Array.isArray(raw) ? raw : [];
    const sanitized = ModuleSettings.#sanitizeCustomSubtypeEntries(entries);
    if (!ModuleSettings.#areSubtypeEntriesEqual(entries, sanitized)) {
      game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPES, sanitized).catch(() => {});
    }
    return sanitized;
  }

  static async setCustomLootSubtypes(entries = []) {
    const sanitized = ModuleSettings.#sanitizeCustomSubtypeEntries(entries);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPES, sanitized);
    return sanitized;
  }

  static #sanitizeCustomSubtypeEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }

    const cleaned = [];
    const seen = new Set();
    for (const entry of entries) {
      const key = typeof entry?.key === "string" ? entry.key.trim() : "";
      if (!key.length) continue;
      const lower = key.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      const label = (typeof entry?.label === "string" && entry.label.trim().length)
        ? entry.label.trim()
        : ModuleSettings.formatSubtypeLabel(key);

      cleaned.push({ key, label });
    }
    return cleaned;
  }

  static #areSubtypeEntriesEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => {
      const other = b[index];
      return entry?.key === other?.key && entry?.label === other?.label;
    });
  }

  static formatSubtypeLabel(key) {
    if (!key) return "Custom";
    const normalized = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized.length) return "Custom";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  static #defaultSocketableItemTypes() {
    return ["weapon", "equipment"];
  }

  static #parseSocketableTypes(value) {
    const source = Array.isArray(value)
      ? value
      : String(value ?? "").split(",");
    const cleaned = [];
    const seen = new Set();
    for (const entry of source) {
      const normalized = String(entry ?? "").trim().toLowerCase();
      if (!normalized.length) continue;
      if (ModuleSettings.#isDisallowedSocketableType(normalized)) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      cleaned.push(normalized);
    }
    return cleaned;
  }

  static #isDisallowedSocketableType(type) {
    const normalized = String(type ?? "").trim().toLowerCase();
    return ModuleSettings.#DISALLOWED_SOCKETABLE_TYPES.has(normalized);
  }

  static #resolveItemTypeLabel(source, fallback) {
    if (typeof source === "string") {
      const localized = game?.i18n?.localize?.(source);
      if (localized && localized !== source) {
        return localized;
      }
      if (source.includes(".")) {
        return ModuleSettings.formatSubtypeLabel(fallback);
      }
      return source;
    }

    if (source && typeof source === "object") {
      const ref = source.label ?? source.name ?? fallback;
      return ModuleSettings.#resolveItemTypeLabel(ref, fallback);
    }

    return ModuleSettings.formatSubtypeLabel(fallback);
  }

  static #defaultEditSocketRole() {
    const roles = CONST?.USER_ROLES ?? {};
    if (Number.isFinite(roles.GAMEMASTER)) {
      return roles.GAMEMASTER;
    }
    if (Number.isFinite(roles.GM)) {
      return roles.GM;
    }
    return 4;
  }

  static #resolveRoleLevel(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    if (typeof value === "string" && value.trim().length) {
      const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
      const roles = CONST?.USER_ROLES ?? {};
      if (Number.isFinite(roles[normalized])) {
        return roles[normalized];
      }
      if (normalized === "GM" && Number.isFinite(roles.GAMEMASTER)) {
        return roles.GAMEMASTER;
      }
      if (normalized === "GAMEMASTER" && Number.isFinite(roles.GM)) {
        return roles.GM;
      }
    }

    return ModuleSettings.#defaultEditSocketRole();
  }

  static #roleLabel(roleKey) {
    const key = String(roleKey ?? "").toUpperCase();
    const i18nMap = {
      NONE: "USER.RoleNone",
      PLAYER: "USER.RolePlayer",
      TRUSTED: "USER.RoleTrusted",
      ASSISTANT: "USER.RoleAssistant",
      GAMEMASTER: "USER.RoleGamemaster",
      GM: "USER.RoleGamemaster"
    };

    const i18nKey = i18nMap[key];
    if (i18nKey) {
      const localized = game?.i18n?.localize?.(i18nKey);
      if (localized && localized !== i18nKey) {
        return localized;
      }
    }

    const normalized = key.toLowerCase().replace(/_/g, " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  #registerSupportCardSetting() {
    const name = Constants.localize("SCSockets.Settings.SupportCard.Name", "Support Chat Card - disable");
    const hint = Constants.localize(
      "SCSockets.Settings.SupportCard.Hint",
      "If enabled, the support chat card will not show on startup."
    );

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_CARD, {
      name,
      hint,
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });
  }

  #registerLastModuleVersionSetting() {
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_LAST_MODULE_VERSION, {
      scope: "world",
      config: false,
      type: String,
      default: ""
    });
  }

  #registerSupportMenu() {
    const name = Constants.localize("SCSockets.Settings.SupportMenu.Name", "Support the developer");
    const label = Constants.localize("SCSockets.Settings.SupportMenu.Label", "Patreon support");
    const hint = Constants.localize(
      "SCSockets.Settings.SupportMenu.Hint",
      "Get access to SC - More Gems with 70+ gems, and more every month. We are also building SC - Setforge to create item sets."
    );

    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_MENU, {
      name,
      label,
      hint,
      icon: "fas fa-heart",
      type: SupportMenu,
      restricted: true
    });

    Hooks.on("renderSettingsConfig", (_app, html) => {
      SupportMenu.bindSettingsButton(html);
    });
  }

  #registerEditSocketPermission() {
    const roleEntries = Object.entries(CONST?.USER_ROLES ?? {})
      .filter(([, level]) => Number.isFinite(level))
      .sort((a, b) => a[1] - b[1]);
    const roleChoices = roleEntries.reduce((acc, [name, level]) => {
      acc[level] = ModuleSettings.#roleLabel(name);
      return acc;
    }, {});
    const name = Constants.localize("SCSockets.Settings.EditPermission.Name", "Edit Socket Permission");
    const hint = Constants.localize(
      "SCSockets.Settings.EditPermission.Hint",
      "The minimum role required to add or remove sockets from items."
    );

    game.settings.register(Constants.MODULE_ID, "editSocketPermission", {
      name,
      hint,
      scope: "world",
      config: true,
      type: Number,
      choices: roleChoices,
      default: ModuleSettings.#defaultEditSocketRole(),
      onChange: (value) => {
        console.log(`${Constants.MODULE_ID} | editSocketPermission changed to ${value}`);
        ModuleSettings.refreshOpenSheets({ item: true, actor: true });
      }
    });
  }

  async #registerSocketableItemTypeSettings() {
    const { SocketableItemTypesSettings } = await import("./SocketableItemTypesSettings.js");

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES, {
      scope: "world",
      config: false,
      type: Array,
      default: [...ModuleSettings.#defaultSocketableItemTypes()]
    });

    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES_MENU, {
      name: Constants.localize("SCSockets.Settings.SocketableItemTypes.Name", "Socketable Item Types"),
      label: Constants.localize("SCSockets.Settings.SocketableItemTypes.Label", "Configure Socketable Item Types"),
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
    const name = Constants.localize(
      "SCSockets.Settings.MaxSockets.Name",
      "Maximum Number of Sockets per Item"
    );
    const hint = Constants.localize(
      "SCSockets.Settings.MaxSockets.Hint",
      "Maximum number of sockets an item can have. Use -1 for unlimited."
    );

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS, {
      name,
      hint,
      scope: "world",
      config: true,
      type: Number,
      default: 6
    });
  }

  #registerDeleteOnRemoval() {
    const name = Constants.localize(
      "SCSockets.Settings.DeleteOnRemoval.Name",
      "Delete Gem on Removal"
    );
    const hint = Constants.localize(
      "SCSockets.Settings.DeleteOnRemoval.Hint",
      "If enabled, a gem is destroyed when removed from a socket; otherwise it's returned to the player's inventory."
    );

    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_DELETE_ON_REMOVE, {
      name,
      hint,
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });
  }

  async #registerLootSubtypeSettings() {
    const { GemSubtypeSelectionSettings } = await import("./GemSubtypeSelectionSettings.js");
    const { GemCustomSubtypeSettings } = await import("./GemCustomSubtypeSettings.js");

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

    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_LOOT_SUBTYPE_MENU, {
      name: Constants.localize("SCSockets.Settings.GemLootSubtypes.Selection.Name", "Gem Loot Subtypes"),
      label: Constants.localize("SCSockets.Settings.GemLootSubtypes.Selection.Label", "Configure Gem Loot Subtypes"),
      hint: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.Selection.Hint",
        "Select which loot subtypes count as gems."
      ),
      icon: "fas fa-gem",
      type: GemSubtypeSelectionSettings,
      restricted: true
    });

    game.settings.registerMenu(Constants.MODULE_ID, ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPE_MENU, {
      name: Constants.localize("SCSockets.Settings.GemLootSubtypes.CustomMenu.Name", "Custom Loot Subtypes"),
      label: Constants.localize("SCSockets.Settings.GemLootSubtypes.CustomMenu.Label", "Configure Custom Loot Subtypes"),
      hint: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.CustomMenu.Hint",
        "Add custom loot subtype keys and labels that can be used as gems."
      ),
      icon: "fas fa-list",
      type: GemCustomSubtypeSettings,
      restricted: true
    });
  }
}
