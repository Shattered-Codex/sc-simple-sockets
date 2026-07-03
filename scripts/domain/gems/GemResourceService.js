import { Constants } from "../../core/Constants.js";
import { ItemResolver } from "../../core/ItemResolver.js";
import {
  SOCKET_CONSUMPTION_SELECTOR_MODES,
  matchesGemNamePattern
} from "../../core/helpers/socketConsumptionConfig.js";

export class GemResourceService {
  static normalizeResource(raw) {
    const key = String(raw?.key ?? "").trim();
    if (!key.length) {
      return null;
    }

    const max = Number(raw?.max);
    const normalizedMax = Number.isFinite(max) ? Math.max(Math.floor(max), 0) : 0;
    // An empty value (fresh form input) means "full", not zero.
    const rawValue = raw?.value;
    const value = rawValue === "" || rawValue === null || rawValue === undefined
      ? NaN
      : Number(rawValue);
    const normalizedValue = Number.isFinite(value)
      ? Math.min(Math.max(Math.floor(value), 0), normalizedMax)
      : normalizedMax;

    return {
      key,
      max: normalizedMax,
      value: normalizedValue,
      destroyOnEmpty: raw?.destroyOnEmpty === true || raw?.destroyOnEmpty === "true"
    };
  }

  /**
   * Returns a copy of the slot with the gem's current charge set to the given value
   * (clamped between zero and the gem's maximum), written back into the snapshot.
   */
  static withSlotResourceValue(slot, value) {
    const source = GemResourceService.getSlotGemSource(slot);
    const resource = GemResourceService.getGemResource(source);
    if (!source || !resource) {
      return slot;
    }

    const nextValue = Math.min(Math.max(Math.trunc(Number(value) || 0), 0), resource.max);
    if (nextValue === resource.value) {
      return slot;
    }

    foundry.utils.setProperty(
      source,
      `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_RESOURCE}`,
      { ...resource, value: nextValue }
    );
    return { ...slot, _gemData: ItemResolver.compactSnapshot(source) };
  }

  static getGemResource(itemOrSource) {
    const source = itemOrSource?.toObject?.() ?? itemOrSource;
    const raw = source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_RESOURCE];
    return GemResourceService.normalizeResource(raw);
  }

  static getSlotGemSource(slot) {
    if (!slot?._gemData) {
      return null;
    }
    return ItemResolver.expandSnapshot(slot._gemData);
  }

  static getSlotResource(slot) {
    return GemResourceService.getGemResource(GemResourceService.getSlotGemSource(slot));
  }

  static slotHasGem(slot) {
    return Boolean(slot?.gem || slot?._gemData);
  }

  /**
   * Derives the aggregated resource pools provided by the currently socketed gems.
   * The host item never stores these values; they are always recomputed from the slots.
   * @param {Array} slots
   * @returns {Array<{key: string, value: number, max: number, gems: number}>}
   */
  static aggregatePools(slots) {
    const pools = new Map();
    for (const slot of Array.isArray(slots) ? slots : []) {
      const resource = GemResourceService.getSlotResource(slot);
      if (!resource) {
        continue;
      }

      const poolKey = resource.key.toLowerCase();
      const pool = pools.get(poolKey) ?? { key: resource.key, value: 0, max: 0, gems: 0 };
      pool.value += resource.value;
      pool.max += resource.max;
      pool.gems += 1;
      pools.set(poolKey, pool);
    }

    return Array.from(pools.values()).sort((left, right) => left.key.localeCompare(right.key));
  }

  /**
   * Plans a single charge consumption target without mutating anything.
   * Each gem provides one resource, so the resource key is implied by the selected
   * gems except for the "any" mode, where the target names it explicitly.
   * A negative cost restores charges instead (clamped at each gem's maximum).
   * @param {Array} slots Current socket slots of the host item.
   * @param {{mode: string, resourceKey?: string, slotIndex?: number, gemName?: string}} spec Parsed target.
   * @param {number} cost Signed amount of charges to consume.
   * @param {object} [options]
   * @param {number|null} [options.sourceSlotIndex] Slot that originated a transferred activity.
   * @returns {{ok: boolean, reason?: string, message?: string, deductions?: Array, updatedSlots?: Array}}
   */
  static planChargeConsumption(slots, spec, cost, { sourceSlotIndex = null } = {}) {
    const workingSlots = Array.isArray(slots) ? slots : [];
    const selection = GemResourceService.#selectSlots(workingSlots, spec, { sourceSlotIndex });
    if (!selection.ok) {
      return selection;
    }

    const resources = workingSlots.map((slot) => GemResourceService.getSlotResource(slot));
    const wantedKey = spec?.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY
      ? String(spec?.resourceKey ?? "").trim().toLowerCase()
      : null;
    const candidates = selection.indices.filter((index) => {
      const resource = resources[index];
      if (!resource) {
        return false;
      }
      return wantedKey === null || resource.key.toLowerCase() === wantedKey;
    });

    const amount = Math.trunc(Number(cost) || 0);
    if (!amount) {
      return { ok: true, deductions: [], updatedSlots: workingSlots };
    }

    const deductions = [];
    if (amount > 0) {
      const available = candidates.reduce((sum, index) => sum + resources[index].value, 0);
      if (available < amount) {
        const resourceLabel = spec?.resourceKey
          ?? resources[candidates[0]]?.key
          ?? spec?.gemName
          ?? "";
        return GemResourceService.#failure(
          "insufficient-socket-charges",
          "SCSockets.Notifications.InsufficientSocketCharges",
          `Not enough socketed "${resourceLabel}" charges (${available}/${amount}).`,
          { resource: resourceLabel, available, required: amount }
        );
      }

      let pending = amount;
      for (const index of candidates) {
        if (pending <= 0) {
          break;
        }
        const taken = Math.min(resources[index].value, pending);
        if (taken > 0) {
          pending -= taken;
          deductions.push({ slotIndex: index, resourceKey: resources[index].key, amount: taken });
        }
      }
    } else {
      // Restoration: fill candidates in slot order, discarding any excess.
      let pending = -amount;
      for (const index of candidates) {
        if (pending <= 0) {
          break;
        }
        const capacity = resources[index].max - resources[index].value;
        const restored = Math.min(capacity, pending);
        if (restored > 0) {
          pending -= restored;
          deductions.push({ slotIndex: index, resourceKey: resources[index].key, amount: -restored });
        }
      }
    }

    return {
      ok: true,
      deductions,
      updatedSlots: GemResourceService.applyDeductions(workingSlots, deductions)
    };
  }

  /**
   * Plans a single whole-gem consumption target without mutating anything.
   * @param {Array} slots Current socket slots of the host item.
   * @param {{mode: string, slotIndex?: number, gemName?: string}} spec Parsed target.
   * @param {number} cost Number of gems to consume.
   * @param {object} [options]
   * @param {number|null} [options.sourceSlotIndex]
   * @param {Set<number>} [options.excluded] Slots already claimed by other targets.
   * @returns {{ok: boolean, reason?: string, message?: string, removals?: number[]}}
   */
  static planGemConsumption(slots, spec, cost, { sourceSlotIndex = null, excluded = new Set() } = {}) {
    const workingSlots = Array.isArray(slots) ? slots : [];
    const selection = GemResourceService.#selectSlots(workingSlots, spec, { sourceSlotIndex });
    if (!selection.ok) {
      return selection;
    }

    const amount = Math.trunc(Number(cost) || 0);
    if (amount <= 0) {
      return { ok: true, removals: [] };
    }

    const candidates = selection.indices.filter((index) => (
      GemResourceService.slotHasGem(workingSlots[index]) && !excluded.has(index)
    ));

    if (candidates.length < amount) {
      return GemResourceService.#failure(
        "insufficient-socket-gems",
        "SCSockets.Notifications.InsufficientSocketGems",
        `Not enough socketed gems to consume (${candidates.length}/${amount}).`,
        { available: candidates.length, required: amount }
      );
    }

    return { ok: true, removals: candidates.slice(0, amount) };
  }

  /**
   * Returns a new slots array with the planned charge deductions written back into
   * each gem snapshot, so extraction later returns the gem with its spent charges.
   */
  static applyDeductions(slots, deductions) {
    const updated = foundry.utils.deepClone(Array.isArray(slots) ? slots : []);
    const totals = new Map();
    for (const deduction of Array.isArray(deductions) ? deductions : []) {
      totals.set(deduction.slotIndex, (totals.get(deduction.slotIndex) ?? 0) + deduction.amount);
    }

    for (const [slotIndex, amount] of totals.entries()) {
      const slot = updated[slotIndex];
      const source = GemResourceService.getSlotGemSource(slot);
      const resource = GemResourceService.getGemResource(source);
      if (!source || !resource) {
        continue;
      }

      const nextValue = Math.min(Math.max(resource.value - amount, 0), resource.max);
      foundry.utils.setProperty(
        source,
        `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_RESOURCE}`,
        { ...resource, value: nextValue }
      );
      slot._gemData = ItemResolver.compactSnapshot(source);
    }

    return updated;
  }

  static #selectSlots(slots, spec, { sourceSlotIndex = null } = {}) {
    const mode = spec?.mode;

    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT) {
      const slot = Number.isInteger(sourceSlotIndex) ? slots[sourceSlotIndex] : null;
      if (!slot || !GemResourceService.slotHasGem(slot)) {
        return GemResourceService.#failure(
          "source-gem-missing",
          "SCSockets.Notifications.SourceGemMissing",
          "The gem that provides this activity is no longer socketed."
        );
      }
      return { ok: true, indices: [sourceSlotIndex] };
    }

    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT) {
      const index = Number(spec?.slotIndex);
      if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
        return GemResourceService.#failure(
          "invalid-consumption-slot",
          "SCSockets.Notifications.InvalidConsumptionSlot",
          "The socket slot configured for consumption does not exist."
        );
      }
      return { ok: true, indices: [index] };
    }

    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME) {
      const wanted = String(spec?.gemName ?? "").trim().toLowerCase();
      const indices = slots.reduce((matches, slot, index) => {
        const name = String(ItemResolver.getSlotGemMeta(slot)?.name ?? "").trim().toLowerCase();
        if (wanted.length && name === wanted) {
          matches.push(index);
        }
        return matches;
      }, []);
      return { ok: true, indices };
    }

    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH) {
      const indices = slots.reduce((matches, slot, index) => {
        if (matchesGemNamePattern(spec?.gemNamePattern, ItemResolver.getSlotGemMeta(slot)?.name)) {
          matches.push(index);
        }
        return matches;
      }, []);
      return { ok: true, indices };
    }

    if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY
      || mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM) {
      return { ok: true, indices: slots.map((_, index) => index) };
    }

    return GemResourceService.#failure(
      "invalid-consumption-target",
      "SCSockets.Notifications.InvalidConsumptionTarget",
      "This socket consumption target is not configured."
    );
  }

  static #failure(reason, key, fallback, data = {}) {
    const i18n = globalThis.game?.i18n;
    const hasTranslation = typeof i18n?.has === "function" ? i18n.has(key, { strict: true }) : false;
    const message = hasTranslation && typeof i18n?.format === "function"
      ? i18n.format(key, data)
      : fallback;

    return { ok: false, reason, message };
  }
}
