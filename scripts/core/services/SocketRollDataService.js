import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";

/**
 * Adds derived socket resource pools to dnd5e item roll data.
 *
 * The root values cover every item owned by the actor. The nested `item` values
 * cover only the item whose formula is being evaluated. Unowned items use their
 * own pool for both scopes.
 */
export class SocketRollDataService {
  static #activated = false;

  static activate() {
    if (SocketRollDataService.#activated || game?.system?.id !== "dnd5e") {
      return;
    }

    const ItemClass = globalThis.dnd5e?.documents?.Item5e ?? globalThis.CONFIG?.Item?.documentClass;
    const original = ItemClass?.prototype?.getRollData;
    if (typeof original !== "function") {
      console.warn(`[${Constants.MODULE_ID}] Item.getRollData was not found; socket formula data is unavailable.`);
      return;
    }

    const enrich = function (wrapped, ...args) {
      const data = wrapped.call(this, ...args) ?? {};
      const socketData = SocketRollDataService.build(this);
      data.sockets = SocketRollDataService.#withNumericFallback({
        ...(data.sockets ?? {}),
        ...socketData
      }, 0);
      SocketRollDataService.applyDerivedSpent(this, socketData);
      return data;
    };

    if (globalThis.libWrapper?.register && globalThis.dnd5e?.documents?.Item5e) {
      libWrapper.register(
        Constants.MODULE_ID,
        "dnd5e.documents.Item5e.prototype.getRollData",
        enrich,
        "WRAPPER"
      );
    } else {
      ItemClass.prototype.getRollData = function (...args) {
        return enrich.call(this, original, ...args);
      };
    }

    SocketRollDataService.#activated = true;
  }

  /**
   * @param {Item} item Item whose roll data is being prepared.
   * @returns {Record<string, object>}
   */
  static build(item) {
    const itemPools = SocketRollDataService.#aggregateItems([item]);
    const actorItems = item?.actor?.items ? [item, ...Array.from(item.actor.items)] : [item];
    const actorPools = SocketRollDataService.#aggregateItems(actorItems);
    const keys = new Set([...itemPools.keys(), ...actorPools.keys()]);
    const data = {};

    for (const key of keys) {
      const itemPool = SocketRollDataService.#poolValues(itemPools.get(key));
      const actorPool = SocketRollDataService.#poolValues(actorPools.get(key));
      data[key] = SocketRollDataService.#withNumericFallback({
        ...actorPool,
        actor: SocketRollDataService.#withNumericFallback({ ...actorPool }, actorPool.total),
        item: SocketRollDataService.#withNumericFallback(itemPool, itemPool.total)
      }, actorPool.total);
    }

    return SocketRollDataService.#withNumericFallback(data, 0);
  }

  static normalizeResourceKey(value) {
    return GemResourceService.normalizeResourceLookupKey(value);
  }

  static parseUsesFormula(formula) {
    const match = String(formula ?? "").trim().match(
      /^@sockets\.([a-z0-9_-]+)\.(total|item)$/i
    );
    if (!match) return null;
    return {
      resourceKey: match[1].toLowerCase(),
      scope: match[2].toLowerCase() === "item" ? "item" : "actorAll"
    };
  }

  static getUsesBindingState(item, socketData = SocketRollDataService.build(item)) {
    const formula = item?._source?.system?.uses?.max ?? item?.system?._source?.uses?.max;
    const binding = SocketRollDataService.parseUsesFormula(formula);
    if (!binding) return null;
    const resource = socketData?.[binding.resourceKey];
    const pool = binding.scope === "item" ? resource?.item : resource?.actor ?? resource;
    return {
      ...binding,
      current: Number(pool?.current) || 0,
      total: Number(pool?.total) || 0,
      spent: Number(pool?.spent) || 0
    };
  }

  static applyDerivedSpent(item, socketData) {
    const state = SocketRollDataService.getUsesBindingState(item, socketData);
    if (state && item?.system?.uses) item.system.uses.spent = state.spent;
    return state;
  }

  static #aggregateItems(items) {
    const pools = new Map();
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || seen.has(item)) continue;
      seen.add(item);

      for (const pool of GemResourceService.aggregatePools(SocketStore.peekSlots(item))) {
        const key = SocketRollDataService.normalizeResourceKey(pool.key);
        if (!key) continue;
        const aggregate = pools.get(key) ?? { value: 0, max: 0, gems: 0 };
        aggregate.value += pool.value;
        aggregate.max += pool.max;
        aggregate.gems += pool.gems;
        pools.set(key, aggregate);
      }
    }
    return pools;
  }

  static #poolValues(pool) {
    const current = pool?.value ?? 0;
    const total = pool?.max ?? 0;
    return {
      current,
      total,
      max: total,
      spent: Math.max(total - current, 0),
      gems: pool?.gems ?? 0
    };
  }

  /**
   * dnd5e may evaluate a partially typed formula when an item form submits.
   * Giving namespace objects a numeric primitive prevents paths such as
   * `@sockets` or `@sockets.energy` from becoming "[object Object]".
   */
  static #withNumericFallback(object, value) {
    Object.defineProperty(object, Symbol.toPrimitive, {
      configurable: true,
      value() {
        return String(Number(value) || 0);
      }
    });
    return object;
  }
}
