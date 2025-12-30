import { Constants } from "../Constants.js";

export class ModuleSettings {
  static SETTING_GEM_BADGES = "gemBadgesEnabled";
  static SETTING_EDIT_SOCKET = "editSocketPermission";
  static SETTING_MAX_SOCKETS = "maxSockets";
  static SETTING_DELETE_ON_REMOVE = "deleteGemOnRemoval";
  static SETTING_GEM_ROLL_LAYOUT = "gemRollLayout";
  static SETTING_SUPPORT_CARD = "supportCardDisabled";
  static SETTING_GEM_LOOT_SUBTYPES = Constants.SETTING_GEM_LOOT_SUBTYPES;
  static SETTING_LOOT_SUBTYPE_MENU = Constants.SETTING_LOOT_SUBTYPE_MENU;
  static SETTING_CUSTOM_LOOT_SUBTYPES = Constants.SETTING_CUSTOM_LOOT_SUBTYPES;

  constructor() {
  }

  async register() {
    this.#registerSupportCardSetting();
    this.#registerEditSocketPermission();
    this.#registerMaxSockets();
    this.#registerDeleteOnRemoval();
    this.#registerGemRollLayoutSetting();
    await this.#registerLootSubtypeSettings();
  }

  static canAddOrRemoveSocket(user = game.user) {
    if (user.isGM) return true;

    const minRole = Number(game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_EDIT_SOCKET));
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

  static shouldUseGemRollLayout() {
    return game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT) ?? true;
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
      onChange: () => {
        window?.ui?.notifications?.info?.(`${Constants.localize("SCSockets.Settings.GemRollLayout.Name")}: ${Constants.localize("SCSockets.Notifications.Reloading", "Reloading...")}`);
        window.location.reload();
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

  #registerEditSocketPermission() {
    const roles = Object.keys(CONST.USER_ROLES)
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
      type: String,
      choices: roles,
      default: CONST.USER_ROLES.GM,
      onChange: value => {
        console.log(`${Constants.MODULE_ID} | maxSockets changed to ${value}, reloading page`);
        window.location.reload();
      }
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
      default: 6,
      onChange: value => {
        console.log(`${Constants.MODULE_ID} | maxSockets changed to ${value}, reloading page`);
        window.location.reload();
      }
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
      default: false,
      onChange: value => {
        console.log(`${Constants.MODULE_ID} | maxSockets changed to ${value}, reloading page`);
        window.location.reload();
      }
    });
  }

  async #registerLootSubtypeSettings() {
    const { GemSubtypeSettings } = await import("./GemSubtypeSettings.js");

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
      name: Constants.localize("SCSockets.Settings.GemLootSubtypes.Name", "Gem Loot Subtypes"),
      label: Constants.localize("SCSockets.Settings.GemLootSubtypes.Label", "Configure Gem Loot Subtypes"),
      hint: Constants.localize(
        "SCSockets.Settings.GemLootSubtypes.Hint",
        "Select which loot subtypes count as gems and customize the extra subtype label."
      ),
      icon: "fas fa-gem",
      type: GemSubtypeSettings,
      restricted: true
    });
  }
}
