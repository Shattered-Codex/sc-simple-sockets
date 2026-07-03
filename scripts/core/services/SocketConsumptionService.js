import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { SocketService } from "./SocketService.js";
import { ItemResolver } from "../ItemResolver.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";
import {
  CONSUMPTION_TYPE_CHARGE,
  CONSUMPTION_TYPE_GEM,
  SOCKET_CONSUMPTION_SELECTOR_MODES,
  getActivitySourceSlotIndex,
  matchesGemNamePattern,
  parseSocketTarget
} from "../helpers/socketConsumptionConfig.js";

/**
 * Registers two custom dnd5e consumption types so socketed consumption appears in the
 * native Consumption area of activity sheets and rides the native usage pipeline
 * (usage dialog toggles, scaling, per-target errors).
 *
 * Only the type key and a target string live in the native schema (both plain
 * StringFields, schema-safe if the module is removed); gem resources stay in
 * flags.sc-simple-sockets on the gems and inside the slot snapshots.
 *
 * - Charge consumption merges the updated slots into updates.item so it is applied
 *   atomically with the rest of the usage updates.
 * - Whole-gem consumption is validated during consumption but executed after the use
 *   completes (dnd5e.postUseActivity), because removing a gem also tears down its
 *   transferred activities and effects.
 */
export class SocketConsumptionService {
  static #registered = false;
  static #pendingGemRemovals = new Map();
  static PENDING_TTL_MS = 60_000;

  static register() {
    if (SocketConsumptionService.#registered) {
      return;
    }
    SocketConsumptionService.#registered = true;

    Hooks.once("init", () => {
      const types = globalThis.CONFIG?.DND5E?.activityConsumptionTypes;
      if (game?.system?.id !== "dnd5e" || !types) {
        return;
      }

      // No validTargets: the target is freely configurable (the resource key or gem
      // does not need to be socketed at configuration time). SocketConsumptionTargetUI
      // renders friendly mode/value fields that write the target grammar string.
      types[CONSUMPTION_TYPE_CHARGE] = {
        label: "SCSockets.Consumption.Charge.Label",
        consume: SocketConsumptionService.consumeCharge,
        consumptionLabels: SocketConsumptionService.consumptionLabelsCharge
      };
      types[CONSUMPTION_TYPE_GEM] = {
        label: "SCSockets.Consumption.Gem.Label",
        consume: SocketConsumptionService.consumeGem,
        consumptionLabels: SocketConsumptionService.consumptionLabelsGem
      };

      Hooks.on("dnd5e.preActivityConsumption", SocketConsumptionService.#onPreConsumption);
      Hooks.on("dnd5e.postUseActivity", SocketConsumptionService.#onPostUse);
    });
  }

  /* -------------------------------------------- */
  /*  Consumption handlers (this = ConsumptionTargetData) */
  /* -------------------------------------------- */

  /** @this {ConsumptionTargetData} */
  static async consumeCharge(config, updates) {
    const target = this;
    const spec = SocketConsumptionService.#requireSpec(target);
    const cost = (await target.resolveCost({ config, rolls: updates.rolls })).total;

    const slots = SocketConsumptionService.#currentSlots(target.item, updates);
    const plan = GemResourceService.planChargeConsumption(slots, spec, cost, {
      sourceSlotIndex: getActivitySourceSlotIndex(target.activity)
    });
    if (!plan.ok) {
      throw SocketConsumptionService.#consumptionError(plan.message);
    }
    if (!plan.deductions.length) {
      return;
    }

    SocketConsumptionService.#writeSlotsUpdate(target.item, updates, plan.updatedSlots);
    SocketConsumptionService.#queueEmptiedGems(target.activity, plan);
  }

  /**
   * Gems flagged with destroyOnEmpty are destroyed after the use when a charge
   * consumption drains them to zero.
   */
  static #queueEmptiedGems(activity, plan) {
    const emptied = [];
    for (const deduction of plan.deductions) {
      const resource = GemResourceService.getSlotResource(plan.updatedSlots[deduction.slotIndex]);
      if (resource?.destroyOnEmpty && resource.value === 0) {
        emptied.push(deduction.slotIndex);
      }
    }
    if (!emptied.length) {
      return;
    }

    const key = SocketConsumptionService.#keyFor(activity);
    const pending = SocketConsumptionService.#pendingGemRemovals.get(key)
      ?? { slotIndexes: [], createdAt: Date.now() };
    for (const slotIndex of emptied) {
      if (!pending.slotIndexes.includes(slotIndex)) {
        pending.slotIndexes.push(slotIndex);
      }
    }
    pending.createdAt = Date.now();
    SocketConsumptionService.#pendingGemRemovals.set(key, pending);
  }

  /** @this {ConsumptionTargetData} */
  static async consumeGem(config, updates) {
    const target = this;
    const spec = SocketConsumptionService.#requireSpec(target);
    const cost = (await target.resolveCost({ config, rolls: updates.rolls })).total;
    if (cost <= 0) {
      return;
    }

    const key = SocketConsumptionService.#keyFor(target.activity);
    const pending = SocketConsumptionService.#pendingGemRemovals.get(key)
      ?? { slotIndexes: [], createdAt: Date.now() };

    const slots = SocketConsumptionService.#currentSlots(target.item, updates);
    const plan = GemResourceService.planGemConsumption(slots, spec, cost, {
      sourceSlotIndex: getActivitySourceSlotIndex(target.activity),
      excluded: new Set(pending.slotIndexes)
    });
    if (!plan.ok) {
      throw SocketConsumptionService.#consumptionError(plan.message);
    }
    if (!plan.removals.length) {
      return;
    }

    pending.slotIndexes.push(...plan.removals);
    pending.createdAt = Date.now();
    SocketConsumptionService.#pendingGemRemovals.set(key, pending);
  }

  /* -------------------------------------------- */
  /*  Usage dialog labels (this = ConsumptionTargetData) */
  /* -------------------------------------------- */

  /** @this {ConsumptionTargetData} */
  static consumptionLabelsCharge(config, { consumed } = {}) {
    const target = this;
    const { cost, simplifiedCost, increaseKey } = target._resolveHintCost(config);
    const spec = parseSocketTarget(target.target);
    const summary = SocketConsumptionService.#describeChargeTarget(target, spec);

    return {
      label: Constants.localize(
        `SCSockets.Consumption.Charge.Prompt${increaseKey}`,
        increaseKey === "Increase" ? "Restore Socketed Charges" : "Consume Socketed Charges"
      ),
      hint: SocketConsumptionService.#format(
        `SCSockets.Consumption.Charge.PromptHint${increaseKey}`,
        { cost, resource: summary.resource, available: summary.available },
        increaseKey === "Increase"
          ? `Restores ${cost} ${summary.resource}.`
          : `Consumes ${cost} ${summary.resource} (${summary.available} available).`
      ),
      warn: (increaseKey === "Decrease") && (simplifiedCost > summary.available)
    };
  }

  /** @this {ConsumptionTargetData} */
  static consumptionLabelsGem(config, { consumed } = {}) {
    const target = this;
    const { cost, simplifiedCost } = target._resolveHintCost(config);
    const spec = parseSocketTarget(target.target);
    const summary = SocketConsumptionService.#describeGemTarget(target, spec);

    return {
      label: Constants.localize("SCSockets.Consumption.Gem.Prompt", "Consume Socketed Gem"),
      hint: SocketConsumptionService.#format(
        "SCSockets.Consumption.Gem.PromptHint",
        { cost, target: summary.label, available: summary.available },
        `Destroys ${cost} socketed gem(s): ${summary.label} (${summary.available} available).`
      ),
      warn: simplifiedCost > summary.available
    };
  }

  /* -------------------------------------------- */
  /*  Post-use gem removal                        */
  /* -------------------------------------------- */

  static #onPreConsumption = (activity) => {
    // A new use always starts from a clean pending set for this activity.
    SocketConsumptionService.#pendingGemRemovals.delete(SocketConsumptionService.#keyFor(activity));
    SocketConsumptionService.#purgeStale();
  };

  static #onPostUse = (activity) => {
    const key = SocketConsumptionService.#keyFor(activity);
    const pending = SocketConsumptionService.#pendingGemRemovals.get(key);
    SocketConsumptionService.#pendingGemRemovals.delete(key);
    if (!pending?.slotIndexes?.length) {
      return;
    }

    void SocketConsumptionService.#consumeGems(activity?.item, pending.slotIndexes);
  };

  static async #consumeGems(item, slotIndexes) {
    for (const slotIndex of slotIndexes) {
      try {
        await SocketService.removeGem(item, slotIndex, {
          mode: SocketService.REMOVE_GEM_MODE_DELETE,
          bypassPermission: true,
          notify: false
        });
      } catch (error) {
        console.error(`[${Constants.MODULE_ID}] failed to consume socketed gem at slot ${slotIndex}:`, error);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  static #requireSpec(target) {
    const spec = parseSocketTarget(target.target);
    if (!spec) {
      throw SocketConsumptionService.#consumptionError(Constants.localize(
        "SCSockets.Notifications.InvalidConsumptionTarget",
        "This socket consumption target is not configured."
      ));
    }
    return spec;
  }

  /**
   * Reads the slots as seen by this consumption target: if an earlier target in the
   * same use already queued a slots update, chain on top of it.
   */
  static #currentSlots(item, updates) {
    const flagPath = SocketConsumptionService.#slotsFlagPath();
    const existing = (Array.isArray(updates?.item) ? updates.item : [])
      .find((update) => update?._id === item?.id && update[flagPath]);
    return existing ? existing[flagPath] : SocketStore.peekSlots(item);
  }

  static #writeSlotsUpdate(item, updates, updatedSlots) {
    const flagPath = SocketConsumptionService.#slotsFlagPath();
    if (!Array.isArray(updates.item)) {
      updates.item = [];
    }
    const existing = updates.item.find((update) => update?._id === item?.id);
    if (existing) {
      existing[flagPath] = updatedSlots;
    } else {
      updates.item.push({ _id: item.id, [flagPath]: updatedSlots });
    }
  }

  static #slotsFlagPath() {
    return `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;
  }

  static #describeChargeTarget(target, spec) {
    const slots = SocketStore.peekSlots(target.item);
    const sourceSlotIndex = getActivitySourceSlotIndex(target.activity);
    const plan = spec
      ? GemResourceService.planChargeConsumption(slots, spec, 0, { sourceSlotIndex })
      : null;

    let available = 0;
    let resource = spec?.resourceKey ?? "";
    if (plan?.ok) {
      const indices = SocketConsumptionService.#candidateIndices(slots, spec, sourceSlotIndex);
      for (const index of indices) {
        const slotResource = GemResourceService.getSlotResource(slots[index]);
        if (!slotResource) {
          continue;
        }
        if (spec.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY
          && slotResource.key.toLowerCase() !== String(spec.resourceKey ?? "").toLowerCase()) {
          continue;
        }
        available += slotResource.value;
        // "Any gem" may mix different resources; keep the generic label there.
        if (spec.mode !== SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM) {
          resource ||= slotResource.key;
        }
      }
    }

    return {
      available,
      resource: resource || Constants.localize("SCSockets.Consumption.Charge.GenericResource", "socketed charges")
    };
  }

  static #describeGemTarget(target, spec) {
    const slots = SocketStore.peekSlots(target.item);
    const sourceSlotIndex = getActivitySourceSlotIndex(target.activity);
    const indices = spec ? SocketConsumptionService.#candidateIndices(slots, spec, sourceSlotIndex) : [];
    const available = indices.filter((index) => GemResourceService.slotHasGem(slots[index])).length;

    let label;
    if (spec?.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT) {
      label = Constants.localize("SCSockets.Consumption.Target.SourceSlot", "Source gem (this activity)");
    } else if (spec?.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT) {
      label = SocketConsumptionService.#format(
        "SCSockets.Consumption.Target.SlotShort",
        { slot: (spec.slotIndex ?? 0) + 1 },
        `slot ${(spec.slotIndex ?? 0) + 1}`
      );
    } else if (spec?.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME) {
      label = spec.gemName;
    } else if (spec?.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH) {
      label = SocketConsumptionService.#format(
        "SCSockets.Consumption.Target.NameMatch",
        { pattern: spec.gemNamePattern },
        `gems matching "${spec.gemNamePattern}"`
      );
    } else if (spec?.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM) {
      label = Constants.localize("SCSockets.Consumption.Target.AnyGem", "any socketed gem (slot order)");
    } else {
      label = target.target || "—";
    }

    return { available, label };
  }

  static #candidateIndices(slots, spec, sourceSlotIndex) {
    if (spec.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT) {
      return Number.isInteger(sourceSlotIndex) ? [sourceSlotIndex] : [];
    }
    if (spec.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT) {
      return Number.isInteger(spec.slotIndex) && spec.slotIndex < slots.length ? [spec.slotIndex] : [];
    }
    if (spec.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME) {
      const wanted = String(spec.gemName ?? "").trim().toLowerCase();
      return slots.reduce((matches, slot, index) => {
        const name = String(ItemResolver.getSlotGemMeta(slot)?.name ?? "").trim().toLowerCase();
        if (wanted.length && name === wanted) {
          matches.push(index);
        }
        return matches;
      }, []);
    }
    if (spec.mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH) {
      return slots.reduce((matches, slot, index) => {
        if (matchesGemNamePattern(spec.gemNamePattern, ItemResolver.getSlotGemMeta(slot)?.name)) {
          matches.push(index);
        }
        return matches;
      }, []);
    }
    return slots.map((_, index) => index);
  }

  static #consumptionError(message) {
    const ConsumptionError = globalThis.dnd5e?.dataModels?.activity?.ConsumptionError;
    return ConsumptionError ? new ConsumptionError(message) : new Error(message);
  }

  static #keyFor(activity) {
    return activity?.uuid ?? `${activity?.item?.uuid ?? "unknown"}#${activity?.id ?? "unknown"}`;
  }

  static #purgeStale() {
    const now = Date.now();
    for (const [key, entry] of SocketConsumptionService.#pendingGemRemovals.entries()) {
      if (now - entry.createdAt > SocketConsumptionService.PENDING_TTL_MS) {
        SocketConsumptionService.#pendingGemRemovals.delete(key);
      }
    }
  }

  static #format(key, data = {}, fallback = key) {
    const i18n = game?.i18n;
    const hasTranslation = typeof i18n?.has === "function" ? i18n.has(key, { strict: true }) : false;
    if (hasTranslation && typeof i18n?.format === "function") {
      return i18n.format(key, data);
    }
    return fallback;
  }
}
