import { Constants } from "../../core/Constants.js";
import { Compatibility } from "../../core/support/Compatibility.js";

/**
 * Broken state of a gem. A broken gem is an ordinary inventory item carrying a
 * module flag: it keeps its data, but cannot be socketed until it is repaired.
 * The flag lives on the item itself, so it travels with trades and exports.
 */
export class GemBreakService {
  static FLAG_PATH = `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_BROKEN}`;

  /** Accepts an Item document or plain item data (e.g. a socket snapshot). */
  static isBroken(itemOrData) {
    if (!itemOrData) {
      return false;
    }
    return itemOrData?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_BROKEN] === true;
  }

  /** Marks plain item data as broken, in place, before it is created. */
  static markDataBroken(data) {
    if (!data || typeof data !== "object") {
      return data;
    }
    data.flags ??= {};
    data.flags[Constants.MODULE_ID] ??= {};
    data.flags[Constants.MODULE_ID][Constants.FLAG_GEM_BROKEN] = true;
    return data;
  }

  /** Removes the broken marker from plain item data, in place. */
  static clearDataBroken(data) {
    const flags = data?.flags?.[Constants.MODULE_ID];
    if (flags && typeof flags === "object") {
      delete flags[Constants.FLAG_GEM_BROKEN];
    }
    return data;
  }

  /** Breaks the whole stack. Returns true when the item changed. */
  static async break(item, options = {}) {
    if (!item?.update || item[Constants.PROP_SOCKET_SOURCE] || GemBreakService.isBroken(item)) {
      return false;
    }
    await item.update({ [GemBreakService.FLAG_PATH]: true }, options);
    return true;
  }

  /** Repairs the whole stack. Returns true when the item changed. */
  static async repair(item, options = {}) {
    if (!item?.update || !GemBreakService.isBroken(item)) {
      return false;
    }
    await item.update(Compatibility.addDeletion({}, GemBreakService.FLAG_PATH), options);
    return true;
  }
}
