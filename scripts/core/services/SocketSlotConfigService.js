import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { SocketSlot } from "../model/SocketSlot.js";
import { getSlotConfig } from "../helpers/socketSlotConfig.js";

const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

export class SocketSlotConfigService {
  static #compiledConditionCache = new Map();
  static #CONDITION_CACHE_LIMIT = 50;

  static getConfig(slot) {
    return getSlotConfig(slot);
  }

  static getSlot(hostItem, slotIndex) {
    const slots = SocketStore.peekSlots(hostItem);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
      return null;
    }
    return slots[slotIndex] ?? null;
  }

  static async updateConfig(hostItem, slotIndex, config) {
    const slots = SocketStore.getSlots(hostItem);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
      return false;
    }

    slots[slotIndex] = SocketSlot.applyConfig(slots[slotIndex], config, slotIndex);
    await SocketStore.setSlots(hostItem, slots);
    return true;
  }

  static validateCondition(code) {
    const source = String(code ?? "");
    if (!source.trim().length) {
      return { valid: true, error: null };
    }

    try {
      SocketSlotConfigService.#compileCondition(source);
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error };
    }
  }

  static async evaluateCondition({ hostItem, slot, slotIndex, gemItem, source = null } = {}) {
    const config = getSlotConfig(slot);
    const rawCode = String(config.condition ?? "");
    if (!rawCode.trim().length) {
      return { allowed: true, error: null };
    }

    try {
      const runner = SocketSlotConfigService.#compileCondition(rawCode);
      const result = await runner(SocketSlotConfigService.#buildContext({
        hostItem,
        slot,
        slotIndex,
        gemItem,
        source
      }));
      return {
        allowed: Boolean(result),
        error: null
      };
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] slot condition evaluation failed`, error);
      return {
        allowed: false,
        error
      };
    }
  }

  static #compileCondition(code) {
    const source = String(code ?? "");
    const cached = SocketSlotConfigService.#compiledConditionCache.get(source);
    if (cached) {
      return cached;
    }

    const trimmed = source.trim();
    const body = /\breturn\b/.test(trimmed)
      ? trimmed
      : `return (${trimmed});`;

    const compiled = new AsyncFunction(
      "context",
      `"use strict";
const {
  actor,
  deepClone,
  game,
  gem,
  gemItem,
  getProperty,
  hasProperty,
  hostItem,
  item,
  moduleId,
  slot,
  slotConfig,
  slotIndex,
  source,
  user
} = context;
${body}`
    );

    if (SocketSlotConfigService.#compiledConditionCache.size >= SocketSlotConfigService.#CONDITION_CACHE_LIMIT) {
      SocketSlotConfigService.#compiledConditionCache.delete(
        SocketSlotConfigService.#compiledConditionCache.keys().next().value
      );
    }
    SocketSlotConfigService.#compiledConditionCache.set(source, compiled);
    return compiled;
  }

  static #buildContext({ hostItem, slot, slotIndex, gemItem, source }) {
    return {
      actor: hostItem?.actor ?? null,
      deepClone: foundry.utils.deepClone.bind(foundry.utils),
      game,
      gem: gemItem ?? null,
      gemItem: gemItem ?? null,
      getProperty: foundry.utils.getProperty.bind(foundry.utils),
      hasProperty: foundry.utils.hasProperty.bind(foundry.utils),
      hostItem: hostItem ?? null,
      item: hostItem ?? null,
      moduleId: Constants.MODULE_ID,
      slot: foundry.utils.deepClone(slot ?? null),
      slotConfig: getSlotConfig(slot),
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      source: foundry.utils.deepClone(source ?? null),
      user: game.user ?? null
    };
  }
}
