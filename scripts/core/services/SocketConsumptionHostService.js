import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import {
  SOCKET_CONSUMPTION_SCOPES,
  getSocketConsumptionScope
} from "../helpers/socketConsumptionConfig.js";

const FunctionConstructor = Object.getPrototypeOf(function() {}).constructor;

/**
 * Resolves the host items whose socketed gems may contribute to one consumption.
 * Charges remain stored in gem snapshots; actor scopes are virtual views over the
 * actor's embedded items and never duplicate a balance on the Actor document.
 */
export class SocketConsumptionHostService {
  static #compiledFilterCache = new Map();
  static #FILTER_CACHE_LIMIT = 50;

  static resolve(target, spec, { readSlots = SocketStore.peekSlots } = {}) {
    const sourceItem = target?.item ?? target?.activity?.item ?? null;
    const actor = sourceItem?.actor ?? target?.activity?.actor ?? null;
    const scope = getSocketConsumptionScope(spec);
    const candidates = scope === SOCKET_CONSUMPTION_SCOPES.ITEM
      ? [sourceItem]
      : SocketConsumptionHostService.#actorItems(actor, sourceItem);

    const hosts = [];
    try {
      for (const item of candidates) {
        if (!item) continue;
        if (scope === SOCKET_CONSUMPTION_SCOPES.ACTOR_EQUIPPED && item?.system?.equipped !== true) {
          continue;
        }
        const slots = readSlots(item);
        if (!Array.isArray(slots) || !slots.length) {
          continue;
        }
        if (!SocketConsumptionHostService.#matchesFilter(spec?.filter, {
          activity: target?.activity ?? null,
          actor,
          item,
          sourceItem
        })) {
          continue;
        }
        hosts.push({ item, slots });
      }
    } catch (error) {
      return {
        ok: false,
        reason: "invalid-host-filter",
        message: SocketConsumptionHostService.#formatFilterError(error),
        error,
        hosts: []
      };
    }

    return { ok: true, scope, actor, sourceItem, hosts };
  }

  static validateFilter(code) {
    const source = String(code ?? "").trim();
    if (!source.length) {
      return { valid: true, error: null };
    }
    try {
      SocketConsumptionHostService.#compileFilter(source);
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error };
    }
  }

  static #actorItems(actor, sourceItem) {
    const all = actor?.items ? Array.from(actor.items) : [];
    if (!sourceItem || !all.includes(sourceItem)) {
      return all;
    }
    return [sourceItem, ...all.filter((item) => item !== sourceItem)];
  }

  static #matchesFilter(code, { activity, actor, item, sourceItem }) {
    const source = String(code ?? "").trim();
    if (!source.length) {
      return true;
    }
    const runner = SocketConsumptionHostService.#compileFilter(source);
    return Boolean(runner({
      activity,
      actor,
      game,
      getProperty: foundry.utils.getProperty.bind(foundry.utils),
      hasProperty: foundry.utils.hasProperty.bind(foundry.utils),
      hostItem: item,
      item,
      moduleId: Constants.MODULE_ID,
      sourceItem,
      user: game.user ?? null
    }));
  }

  static #compileFilter(code) {
    const source = String(code ?? "").trim();
    const cached = SocketConsumptionHostService.#compiledFilterCache.get(source);
    if (cached) return cached;

    const body = /\breturn\b/.test(source) ? source : `return (${source});`;
    const compiled = new FunctionConstructor(
      "context",
      `"use strict";
const {
  activity,
  actor,
  game,
  getProperty,
  hasProperty,
  hostItem,
  item,
  moduleId,
  sourceItem,
  user
} = context;
${body}`
    );

    if (SocketConsumptionHostService.#compiledFilterCache.size >= SocketConsumptionHostService.#FILTER_CACHE_LIMIT) {
      SocketConsumptionHostService.#compiledFilterCache.delete(
        SocketConsumptionHostService.#compiledFilterCache.keys().next().value
      );
    }
    SocketConsumptionHostService.#compiledFilterCache.set(source, compiled);
    return compiled;
  }

  static #formatFilterError(error) {
    const fallback = `The socket consumption item filter could not be evaluated. ${error?.message ?? ""}`.trim();
    if (typeof game?.i18n?.format === "function") {
      return game.i18n.format("SCSockets.Consumption.Filter.Error", { error: error?.message ?? "" }) || fallback;
    }
    return fallback;
  }
}
