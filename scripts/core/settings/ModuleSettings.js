import { Constants } from "../Constants.js";

/**
 * Runtime API for reading and writing module settings.
 * All methods are static — call them directly: `ModuleSettings.getMaxSockets()`.
 *
 * Registration of settings is handled separately by `ModuleSettingsRegistrar`.
 */
export class ModuleSettings {
  static #DISALLOWED_SOCKETABLE_TYPES = new Set(["container"]);

  // Setting keys ---------------------------------------------------------------
  static SOCKET_TAB_LAYOUT_LIST = "list";
  static SOCKET_TAB_LAYOUT_GRID = "grid";
  static SETTING_GEM_BADGES = "gemBadgesEnabled";
  static SETTING_EDIT_SOCKET = "editSocketPermission";
  static SETTING_MAX_SOCKETS = "maxSockets";
  static SETTING_DELETE_ON_REMOVE = "deleteGemOnRemoval";
  static SETTING_GEM_ROLL_LAYOUT = "gemRollLayout";
  static SETTING_SOCKET_TAB_LAYOUT = "socketTabLayout";
  static SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS = "enableSocketTabForAllItems";
  static SETTING_SOCKETABLE_ITEM_TYPES = "socketableItemTypes";
  static SETTING_SOCKETABLE_ITEM_TYPES_MENU = "socketableItemTypesSettings";
  static SETTING_SOCKET_BEHAVIOR_MENU = "socketBehaviorSettings";
  static SETTING_SUPPORT_MENU = "supportMenu";
  static SETTING_DOCUMENTATION_MENU = "docsMenu";
  static SETTING_HIDE_SUPPORT_CARD = "hideSupportCardUntilNextUpdate";
  static SETTING_SUPPORT_CARD_VERSION = "supportCardAcknowledgedVersion";
  static SETTING_GEM_LOOT_SUBTYPES = Constants.SETTING_GEM_LOOT_SUBTYPES;
  static SETTING_LOOT_SUBTYPE_MENU = Constants.SETTING_LOOT_SUBTYPE_MENU;
  static SETTING_CUSTOM_LOOT_SUBTYPES = Constants.SETTING_CUSTOM_LOOT_SUBTYPES;
  static SETTING_CUSTOM_LOOT_SUBTYPE_MENU = "customLootSubtypeMenu";

  // Permission -----------------------------------------------------------------

  static canAddOrRemoveSocket(user = game.user) {
    if (!user) return false;
    if (user.isGM) return true;
    const stored = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_EDIT_SOCKET);
    return user.hasRole(ModuleSettings.#resolveRoleLevel(stored));
  }

  /** Exposed for `ModuleSettingsRegistrar` to use as the default value. */
  static getDefaultEditSocketRole() {
    const roles = CONST?.USER_ROLES ?? {};
    if (Number.isFinite(roles.GAMEMASTER)) return roles.GAMEMASTER;
    if (Number.isFinite(roles.GM)) return roles.GM;
    return 4;
  }

  static getEditSocketPermissionChoices() {
    const roleEntries = Object.entries(CONST?.USER_ROLES ?? {})
      .filter(([, level]) => Number.isFinite(level))
      .sort((a, b) => a[1] - b[1]);

    return roleEntries.reduce((acc, [name, level]) => {
      acc[level] = ModuleSettings.#roleLabel(name);
      return acc;
    }, {});
  }

  // Sockets --------------------------------------------------------------------

  static getMaxSockets() {
    const val = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS);
    if (typeof val !== "number") {
      console.warn(`${Constants.MODULE_ID} setting ${ModuleSettings.SETTING_MAX_SOCKETS} is not a number`);
      return Infinity;
    }
    return val < 0 ? Infinity : val;
  }

  static shouldDeleteGemOnRemoval() {
    return game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_DELETE_ON_REMOVE);
  }

  // Socketable item types ------------------------------------------------------

  static getSocketableItemTypes() {
    const raw = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES);
    const parsed = ModuleSettings.#parseSocketableTypes(raw);
    return parsed.length ? parsed : [...ModuleSettings.#defaultSocketableItemTypes()];
  }

  static getDefaultSocketableItemTypes() {
    return [...ModuleSettings.#defaultSocketableItemTypes()];
  }

  static async setSocketableItemTypes(types = []) {
    const cleaned = ModuleSettings.#parseSocketableTypes(types);
    if (!cleaned.length) cleaned.push(...ModuleSettings.#defaultSocketableItemTypes());
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES, cleaned);
    return cleaned;
  }

  static isItemSocketable(item) {
    return ModuleSettings.isItemSocketableByType(item) || ModuleSettings.itemHasSockets(item);
  }

  static isItemSocketableByType(item) {
    const type = String(item?.type ?? "").trim().toLowerCase();
    return type.length && ModuleSettings.getSocketableItemTypes().includes(type);
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
      if (!value.length || ModuleSettings.#isDisallowedSocketableType(value)) return;
      const label = ModuleSettings.#resolveItemTypeLabel(labelSource, value);
      options.set(value, { value, label });
    };

    for (const [key, value] of Object.entries(dnd5eTypes)) pushOption(key, value);
    for (const [key, value] of Object.entries(itemTypeLabels)) pushOption(key, value);
    for (const key of Object.keys(itemDataModels)) {
      pushOption(key, itemTypeLabels[key] ?? dnd5eTypes[key] ?? key);
    }

    return Array.from(options.values())
      .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined));
  }

  // Layout ---------------------------------------------------------------------

  static shouldUseGemRollLayout() {
    return game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT) ?? true;
  }

  static getSocketTabLayout() {
    const value = String(
      game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKET_TAB_LAYOUT)
      ?? ModuleSettings.SOCKET_TAB_LAYOUT_LIST
    ).trim().toLowerCase();

    return [ModuleSettings.SOCKET_TAB_LAYOUT_LIST, ModuleSettings.SOCKET_TAB_LAYOUT_GRID].includes(value)
      ? value
      : ModuleSettings.SOCKET_TAB_LAYOUT_LIST;
  }

  static shouldUseSocketTabGridLayout() {
    return ModuleSettings.getSocketTabLayout() === ModuleSettings.SOCKET_TAB_LAYOUT_GRID;
  }

  // Socket tab visibility ------------------------------------------------------

  static shouldEnableSocketTabForAllItems() {
    return game.settings.get(
      Constants.MODULE_ID,
      ModuleSettings.SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS
    ) !== false;
  }

  static isItemSocketTabEnabledByFlag(item) {
    return item?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_SOCKET_TAB_ENABLED) === true;
  }

  static isItemSocketTabToggleVisible(item) {
    if (ModuleSettings.shouldEnableSocketTabForAllItems()) return false;
    return ModuleSettings.isItemSocketableByType(item) || ModuleSettings.itemHasSockets(item);
  }

  static isItemSocketTabToggleLocked(item) {
    return !ModuleSettings.shouldEnableSocketTabForAllItems() && ModuleSettings.itemHasSockets(item);
  }

  static isItemSocketTabVisible(item) {
    if (!item) return false;
    if (ModuleSettings.shouldEnableSocketTabForAllItems()) {
      return ModuleSettings.isItemSocketable(item);
    }
    return ModuleSettings.itemHasSockets(item)
      || (ModuleSettings.isItemSocketableByType(item) && ModuleSettings.isItemSocketTabEnabledByFlag(item));
  }

  static getItemSocketTabFieldName() {
    return `flags.${Constants.MODULE_ID}.${Constants.FLAG_SOCKET_TAB_ENABLED}`;
  }

  static async ensureItemSocketTabEnabled(item) {
    if (!item || !ModuleSettings.itemHasSockets(item) || ModuleSettings.isItemSocketTabEnabledByFlag(item)) {
      return false;
    }
    await item.setFlag(Constants.MODULE_ID, Constants.FLAG_SOCKET_TAB_ENABLED, true);
    return true;
  }

  static async syncSocketTabFlagsForExistingItems() {
    const items = [
      ...(game.items ?? []),
      ...(Array.from(game.actors ?? []).flatMap((actor) => Array.from(actor?.items ?? [])))
    ];
    for (const item of items) {
      if (ModuleSettings.itemHasSockets(item)) {
        await ModuleSettings.ensureItemSocketTabEnabled(item);
      }
    }
  }

  // UI -------------------------------------------------------------------------

  static refreshOpenSheets({ item = true, actor = true } = {}) {
    const windows = Object.values(ui?.windows ?? {});
    const applicationInstances = (() => {
      const instances = foundry?.applications?.instances;
      if (instances instanceof Map) return Array.from(instances.values());
      if (Array.isArray(instances)) return instances;
      if (instances && typeof instances === "object") return Object.values(instances);
      return [];
    })();

    const seen = new Set();
    for (const app of [...windows, ...applicationInstances]) {
      if (!app || seen.has(app)) continue;
      seen.add(app);
      if (!app?.rendered || typeof app.render !== "function") continue;
      const doc = app.document ?? app.object;
      const documentName = String(doc?.documentName ?? "").toLowerCase();
      if ((item && documentName === "item") || (actor && documentName === "actor")) {
        app.render(false);
      }
    }
  }

  // Gem loot subtypes ----------------------------------------------------------

  static getGemLootSubtypes() {
    if (!ModuleSettings.#isSettingRegistered(ModuleSettings.SETTING_GEM_LOOT_SUBTYPES)) {
      return [Constants.ITEM_SUBTYPE_GEM];
    }

    const raw = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_LOOT_SUBTYPES);
    if (!Array.isArray(raw)) return [Constants.ITEM_SUBTYPE_GEM];

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
    if (!cleaned.length) cleaned.push(Constants.ITEM_SUBTYPE_GEM);
    return cleaned;
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
    if (!cleaned.length) cleaned.push(Constants.ITEM_SUBTYPE_GEM);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_LOOT_SUBTYPES, cleaned);
    return cleaned;
  }

  static getCustomLootSubtypes() {
    if (!ModuleSettings.#isSettingRegistered(ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPES)) {
      return [];
    }

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

  static formatSubtypeLabel(key) {
    if (!key) return "Custom";
    const normalized = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized.length) return "Custom";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  // Private helpers ------------------------------------------------------------

  static #defaultSocketableItemTypes() {
    return ["weapon", "equipment"];
  }

  static #isSettingRegistered(key) {
    const registered = game?.settings?.settings;
    if (!(registered instanceof Map)) return false;
    return registered.has(`${Constants.MODULE_ID}.${key}`);
  }

  static #parseSocketableTypes(value) {
    const source = Array.isArray(value) ? value : String(value ?? "").split(",");
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
    return ModuleSettings.#DISALLOWED_SOCKETABLE_TYPES.has(String(type ?? "").trim().toLowerCase());
  }

  static #resolveItemTypeLabel(source, fallback) {
    if (typeof source === "string") {
      const localized = game?.i18n?.localize?.(source);
      if (localized && localized !== source) return localized;
      if (source.includes(".")) return ModuleSettings.formatSubtypeLabel(fallback);
      return source;
    }
    if (source && typeof source === "object") {
      return ModuleSettings.#resolveItemTypeLabel(source.label ?? source.name ?? fallback, fallback);
    }
    return ModuleSettings.formatSubtypeLabel(fallback);
  }

  static #resolveRoleLevel(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;

    if (typeof value === "string" && value.trim().length) {
      const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
      const roles = CONST?.USER_ROLES ?? {};
      if (Number.isFinite(roles[normalized])) return roles[normalized];
      if (normalized === "GM" && Number.isFinite(roles.GAMEMASTER)) return roles.GAMEMASTER;
      if (normalized === "GAMEMASTER" && Number.isFinite(roles.GM)) return roles.GM;
    }

    return ModuleSettings.getDefaultEditSocketRole();
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
      if (localized && localized !== i18nKey) return localized;
    }
    const normalized = key.toLowerCase().replace(/_/g, " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  static #sanitizeCustomSubtypeEntries(entries) {
    if (!Array.isArray(entries)) return [];
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
    return a.every((entry, index) => entry?.key === b[index]?.key && entry?.label === b[index]?.label);
  }
}
