import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";

/**
 * Adds derived socket resource pools to dnd5e item roll data.
 *
 * The root values cover every item owned by the actor. The nested `item` values
 * cover only the item whose formula is being evaluated. Unowned items use their
 * own pool for both scopes.
 *
 * Besides the per-resource pools under `@sockets.*`, socket counts are exposed
 * under `@sc.sockets.*` so Limited Uses (item or activity) can size a charge
 * pool by the sockets themselves:
 * - `@sc.sockets.total` — socket slots on this item
 * - `@sc.sockets.gems`  — currently socketed gems on this item
 * - `@sc.sockets.empty` — empty sockets on this item
 * - `@sc.sockets.actor.total|gems|empty` — the same counts across the actor
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
      // One inventory scan feeds both namespaces: getRollData runs on every roll,
      // activity use and formula preparation, so a second walk is not affordable.
      const scan = SocketRollDataService.#scanScopes(this);
      const socketData = SocketRollDataService.#formatPools(scan);
      data.sockets = SocketRollDataService.#withNumericFallback({
        ...(data.sockets ?? {}),
        ...socketData
      }, 0);
      const existingSc = data.sc && typeof data.sc === "object" ? data.sc : {};
      data.sc = SocketRollDataService.#withNumericFallback({
        ...existingSc,
        sockets: SocketRollDataService.#formatCounts(scan)
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
    return SocketRollDataService.#formatPools(SocketRollDataService.#scanScopes(item));
  }

  /**
   * Socket count data for `@sc.sockets.*`. Item-scoped at the root; the actor
   * totals live under `actor`. Unowned items use their own counts for both.
   * @param {Item} item Item whose roll data is being prepared.
   * @returns {{total: number, gems: number, empty: number, actor: object}}
   */
  static buildCounts(item) {
    return SocketRollDataService.#formatCounts(SocketRollDataService.#scanScopes(item));
  }

  /**
   * Scans the item scope and the actor scope. An unowned item shares a single
   * scan between both scopes, since the two would walk the same slots.
   */
  static #scanScopes(item) {
    const itemScan = SocketRollDataService.#scanItems([item]);
    if (!item?.actor?.items) return { itemScan, actorScan: itemScan };
    const actorScan = SocketRollDataService.#scanItems([item, ...Array.from(item.actor.items)]);
    return { itemScan, actorScan };
  }

  /**
   * Single pass over `items` producing both the per-resource pools and the raw
   * socket counts, reading each item's socket flag exactly once.
   *
   * Items are deduped by id rather than by object identity: dnd5e clones items
   * with `keepId: true` while resolving activity usage and scaling, so the clone
   * and the actor's own copy are different objects describing the same sockets.
   */
  static #scanItems(items) {
    const pools = new Map();
    const counts = { total: 0, gems: 0, empty: 0 };
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      if (!item) continue;
      const identity = item.id ?? item;
      if (seen.has(identity)) continue;
      seen.add(identity);

      const slots = SocketStore.peekSlots(item);
      for (const slot of slots) {
        counts.total += 1;
        if (GemResourceService.slotHasGem(slot)) {
          counts.gems += 1;
        } else {
          counts.empty += 1;
        }
      }

      for (const pool of GemResourceService.aggregatePools(slots)) {
        const key = SocketRollDataService.normalizeResourceKey(pool.key);
        if (!key) continue;
        const aggregate = pools.get(key) ?? { value: 0, max: 0, gems: 0 };
        aggregate.value += pool.value;
        aggregate.max += pool.max;
        aggregate.gems += pool.gems;
        pools.set(key, aggregate);
      }
    }
    return { pools, counts };
  }

  static #formatPools({ itemScan, actorScan }) {
    const keys = new Set([...itemScan.pools.keys(), ...actorScan.pools.keys()]);
    const data = {};

    for (const key of keys) {
      const itemPool = SocketRollDataService.#poolValues(itemScan.pools.get(key));
      const actorPool = SocketRollDataService.#poolValues(actorScan.pools.get(key));
      data[key] = SocketRollDataService.#withNumericFallback({
        ...actorPool,
        actor: SocketRollDataService.#withNumericFallback({ ...actorPool }, actorPool.total),
        item: SocketRollDataService.#withNumericFallback(itemPool, itemPool.total)
      }, actorPool.total);
    }

    return SocketRollDataService.#withNumericFallback(data, 0);
  }

  static #formatCounts({ itemScan, actorScan }) {
    const data = {
      ...itemScan.counts,
      actor: SocketRollDataService.#withNumericFallback({ ...actorScan.counts }, actorScan.counts.total)
    };
    return SocketRollDataService.#withNumericFallback(data, itemScan.counts.total);
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
