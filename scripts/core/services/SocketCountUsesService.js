import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";

/**
 * Keeps native dnd5e Item Uses stable while a formula-derived socket maximum
 * changes. The dnd5e system remains the sole owner of consumption and recovery;
 * this service only rebases `spent` when sockets are inserted or removed so the
 * number of remaining uses does not unexpectedly change with the capacity.
 */
export class SocketCountUsesService {
  static SOCKETS_PATH = `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;

  /**
   * Exact item-use maxima supported by the socket-count binding. Only the paths
   * published in the item roll data are accepted: a formula the module claims
   * but dnd5e cannot resolve would leave `uses.max` at 0 while the rebase below
   * still moved `spent` by the real socket count.
   */
  static parseUsesMaxBinding(formula) {
    const match = String(formula ?? "").trim().match(/^@sc\.sockets\.(total|gems)$/i);
    if (!match) return null;
    return { poolKey: match[1].toLowerCase() === "gems" ? "gems" : "slots" };
  }

  static getUsesBinding(item) {
    const formula = item?._source?.system?.uses?.max ?? item?.system?._source?.uses?.max;
    return SocketCountUsesService.parseUsesMaxBinding(formula);
  }

  static poolMax(poolKey, slots) {
    const list = Array.isArray(slots) ? slots : [];
    return poolKey === "slots"
      ? list.length
      : list.filter((slot) => GemResourceService.slotHasGem(slot)).length;
  }

  static hasSocketChange(changes) {
    return SocketCountUsesService.#readChange(changes, SocketCountUsesService.SOCKETS_PATH) !== undefined;
  }

  /**
   * Refreshes dnd5e's prepared UsesField immediately after a socket update.
   * Embedded item updates can otherwise leave the previously evaluated formula
   * value in memory until the next item use or actor preparation cycle.
   */
  static syncPreparedUses(item, changes = null) {
    const binding = SocketCountUsesService.getUsesBinding(item);
    if (!binding || (changes && !SocketCountUsesService.hasSocketChange(changes))) return null;

    const max = SocketCountUsesService.poolMax(binding.poolKey, SocketStore.peekSlots(item));
    const rawSpent = Number(
      item?._source?.system?.uses?.spent
      ?? item?.system?._source?.uses?.spent
      ?? item?.system?.uses?.spent
      ?? 0
    );
    const spent = Number.isFinite(rawSpent) ? Math.max(Math.floor(rawSpent), 0) : 0;
    const value = Math.min(Math.max(max - spent, 0), max);

    if (item?.system?.uses) {
      item.system.uses.max = max;
      item.system.uses.spent = spent;
      item.system.uses.value = value;
    }
    return { poolKey: binding.poolKey, max, spent, value };
  }

  /**
   * preUpdateItem hook. Given an item with N remaining uses, resize its native
   * maximum while preserving N (clamped to the new maximum):
   *
   *   oldCurrent = oldMax - oldSpent
   *   newSpent   = newMax - min(oldCurrent, newMax)
   *
   * Native consumption or recovery updates that explicitly include `spent`
   * are authoritative and are never overwritten.
   */
  static rebaseSpentForSocketChange(item, changes) {
    const binding = SocketCountUsesService.getUsesBinding(item);
    if (!binding || SocketCountUsesService.#readChange(changes, "system.uses.spent") !== undefined) {
      return;
    }

    const nextSlots = SocketCountUsesService.#readChange(changes, SocketCountUsesService.SOCKETS_PATH);
    if (!Array.isArray(nextSlots)) return;

    const oldMax = SocketCountUsesService.poolMax(binding.poolKey, SocketStore.peekSlots(item));
    const newMax = SocketCountUsesService.poolMax(binding.poolKey, nextSlots);
    if (oldMax === newMax) return;

    const sourceSpent = Number(
      item?._source?.system?.uses?.spent
      ?? item?.system?._source?.uses?.spent
      ?? item?.system?.uses?.spent
      ?? 0
    );
    const oldSpent = Number.isFinite(sourceSpent) ? Math.max(Math.floor(sourceSpent), 0) : 0;
    const oldCurrent = Math.min(Math.max(oldMax - oldSpent, 0), oldMax);
    const newCurrent = Math.min(oldCurrent, newMax);
    foundry.utils.setProperty(changes, "system.uses.spent", newMax - newCurrent);
  }

  static #readChange(changes, path) {
    if (!changes || typeof changes !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
    return foundry.utils.getProperty(changes, path);
  }
}
