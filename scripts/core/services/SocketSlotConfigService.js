import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { SocketSlot } from "../model/SocketSlot.js";
import { getSlotConfig } from "../helpers/socketSlotConfig.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";
import { GemTagService } from "../../domain/gems/GemTagService.js";

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

  static async updateConfig(hostItem, slotIndex, config, options = {}) {
    return SocketSlotConfigService.#saveSlot(
      hostItem,
      slotIndex,
      (slot) => SocketSlot.applyConfig(slot, config, slotIndex),
      options
    );
  }

  static async updateConfigAndResource(hostItem, slotIndex, config, gemResourceValue, options = {}) {
    return SocketSlotConfigService.#saveSlot(
      hostItem,
      slotIndex,
      (slot) => {
        let nextSlot = SocketSlot.applyConfig(slot, config, slotIndex);
        if (gemResourceValue !== undefined && gemResourceValue !== null && gemResourceValue !== "") {
          nextSlot = GemResourceService.withSlotResourceValue(nextSlot, Number(gemResourceValue));
        }
        return nextSlot;
      },
      options
    );
  }

  static async toggleHidden(hostItem, slotIndex, options = {}) {
    const slots = SocketStore.getSlots(hostItem);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
      return null;
    }

    const config = getSlotConfig(slots[slotIndex]);
    const nextConfig = {
      ...config,
      hidden: !config.hidden
    };
    await SocketSlotConfigService.#saveSlot(
      hostItem,
      slotIndex,
      (slot) => SocketSlot.applyConfig(slot, nextConfig, slotIndex),
      options
    );
    return nextConfig.hidden;
  }

  static async #saveSlot(hostItem, slotIndex, buildNextSlot, options = {}) {
    const slots = SocketStore.getSlots(hostItem);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length) {
      return false;
    }

    const previousSlot = slots[slotIndex];
    const nextSlot = buildNextSlot(previousSlot);
    if (SocketSlotConfigService.#stableStringify(previousSlot) === SocketSlotConfigService.#stableStringify(nextSlot)) {
      return true;
    }

    slots[slotIndex] = nextSlot;
    await SocketStore.setSlots(hostItem, slots, options);
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
  gemTags,
  getProperty,
  hasGemTag,
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
    const gemTags = GemTagService.getTags(gemItem);
    return {
      actor: hostItem?.actor ?? null,
      deepClone: foundry.utils.deepClone.bind(foundry.utils),
      game,
      gem: gemItem ?? null,
      gemItem: gemItem ?? null,
      gemTags,
      getProperty: foundry.utils.getProperty.bind(foundry.utils),
      hasGemTag: (tag) => GemTagService.hasTag(gemTags, tag),
      hasProperty: foundry.utils.hasProperty.bind(foundry.utils),
      hostItem: hostItem ?? null,
      item: hostItem ?? null,
      moduleId: Constants.MODULE_ID,
      slot: foundry.utils.deepClone(slot ?? null),
      slotConfig: getSlotConfig(slot),
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      source: foundry.utils.deepClone(source?.toObject?.() ?? source ?? null),
      user: game.user ?? null
    };
  }

  static #stableStringify(value) {
    return JSON.stringify(value ?? null);
  }
}
