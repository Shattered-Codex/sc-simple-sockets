import { Constants } from "../Constants.js";

export class Compatibility {
  static MINIMUM_DND5E_VERSION = "5.3.0";

  static getDnd5eVersion() {
    if (game?.system?.id !== "dnd5e") return "";
    return String(game.system.version ?? game.system.data?.version ?? "").trim();
  }

  static isSupportedDnd5eVersion(minimum = Compatibility.MINIMUM_DND5E_VERSION) {
    const current = Compatibility.getDnd5eVersion();
    const isNewerVersion = foundry?.utils?.isNewerVersion;
    if (!current.length || typeof isNewerVersion !== "function") return true;
    return current === minimum || isNewerVersion(current, minimum);
  }

  static getDnd5eItemSheetClass() {
    return globalThis.dnd5e?.applications?.item?.ItemSheet5e ?? null;
  }

  static requireDnd5eItemSheetClass() {
    const SheetClass = Compatibility.getDnd5eItemSheetClass();
    if (typeof SheetClass === "function") {
      return SheetClass;
    }

    throw new Error(
      `${Constants.MODULE_ID}: dnd5e.applications.item.ItemSheet5e is required. `
      + `Use dnd5e ${Compatibility.MINIMUM_DND5E_VERSION}+ on Foundry VTT v13/v14.`
    );
  }

  static isDnd5eItemSheet(sheet) {
    const SheetClass = Compatibility.getDnd5eItemSheetClass();
    return typeof SheetClass === "function" && sheet instanceof SheetClass;
  }

  static getDnd5eItemSheetPrototypePath(method) {
    const suffix = typeof method === "string" ? method.trim() : "";
    if (!suffix.length) return null;
    return `dnd5e.applications.item.ItemSheet5e.prototype.${suffix}`;
  }

  static getDnd5eItemSheetStaticPath(method) {
    const suffix = typeof method === "string" ? method.trim() : "";
    if (!suffix.length) return null;
    return `dnd5e.applications.item.ItemSheet5e.${suffix}`;
  }

  static getPreRollHookName(kind) {
    switch (String(kind ?? "").trim().toLowerCase()) {
      case "damage":
        return "dnd5e.preRollDamage";
      case "attack":
        return "dnd5e.preRollAttack";
      default:
        return "";
    }
  }
}
