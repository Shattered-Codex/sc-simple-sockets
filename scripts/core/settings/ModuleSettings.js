import { Constants } from "../Constants.js";

export class ModuleSettings {
  static SETTING_GEM_BADGES = "gemBadgesEnabled";
  static SETTING_EDIT_SOCKET = "editSocketPermission";
  static SETTING_MAX_SOCKETS = "maxSockets";
  static SETTING_DELETE_ON_REMOVE = "deleteGemOnRemoval";

  constructor() {
  }

  register() {
    this.#registerEditSocketPermission();
    this.#registerMaxSockets();
    this.#registerDeleteOnRemoval();
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

  #registerEditSocketPermission() {
    const roles = Object.keys(CONST.USER_ROLES)

    game.settings.register(Constants.MODULE_ID, "editSocketPermission", {
      name: "Edit Socket Permission",
      hint: "The minimum role required to add/remove sockets from items.",
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
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS, {
      name: "Maximum Number of Sockets per Item",
      hint: "Maximum number of sockets an item can have. Use -1 for unlimited.",
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
    game.settings.register(Constants.MODULE_ID, ModuleSettings.SETTING_DELETE_ON_REMOVE, {
      name: "Delete Gem on Removal",
      hint: "If enabled, a gem is destroyed when removed from a socket; otherwise it's returned to the player's inventory.",
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
}
