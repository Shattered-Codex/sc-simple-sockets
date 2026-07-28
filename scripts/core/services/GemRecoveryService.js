import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { ItemResolver } from "../ItemResolver.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";

/**
 * Restores gem resource charges when their recovery period triggers.
 *
 * dnd5e recovery only touches native item/activity uses, so gem charges
 * (stored in flags inside slot snapshots and on loose gem items) are
 * recovered here, mirroring the native periods:
 * - Rests (dnd5e.restCompleted): the rest type's recoverPeriods plus the
 *   day/dawn/dusk periods when the rest starts a new day, matching
 *   Actor5e._getRestItemUsesRecovery. Runs after the system applies its own
 *   rest updates because recovery formulas may contain dice, which cannot be
 *   rolled inside the synchronous preRestCompleted hook.
 * - Combat (dnd5e.postCombatRecovery): initiative, turnStart, turnEnd, and
 *   turn periods, per combatant, after the system's own combat recovery.
 * - Recharge: a manual d6 check against the configured threshold, rolled from
 *   the gem sheet or the Socket Descriptions die button.
 */
export class GemRecoveryService {
  static #registered = false;

  static register() {
    if (GemRecoveryService.#registered) {
      return;
    }
    GemRecoveryService.#registered = true;

    Hooks.once("init", () => {
      if (game?.system?.id !== "dnd5e") {
        return;
      }
      Hooks.on("dnd5e.restCompleted", (actor, _result, config) => {
        GemRecoveryService.recoverRestCharges(actor, config).catch((error) => {
          console.error(`[${Constants.MODULE_ID}] gem rest recovery failed:`, error);
        });
      });
      Hooks.on("dnd5e.postCombatRecovery", (combatant, periods) => {
        GemRecoveryService.recoverCombatCharges(combatant?.actor, periods).catch((error) => {
          console.error(`[${Constants.MODULE_ID}] gem combat recovery failed:`, error);
        });
      });
    });
  }

  static restPeriods(config) {
    const restConfig = globalThis.CONFIG?.DND5E?.restTypes?.[config?.type];
    const periods = new Set(restConfig?.recoverPeriods ?? []);
    if (config?.newDay) {
      periods.add("day").add("dawn").add("dusk");
    }
    return periods;
  }

  static async recoverRestCharges(actor, config) {
    return GemRecoveryService.#recoverActorGems(actor, GemRecoveryService.restPeriods(config));
  }

  static async recoverCombatCharges(actor, periods) {
    return GemRecoveryService.#recoverActorGems(actor, new Set(periods ?? []));
  }

  static async #recoverActorGems(actor, periods) {
    if (!periods.size) {
      return;
    }

    for (const item of Array.from(actor?.items ?? [])) {
      await GemRecoveryService.#recoverSocketedGems(item, periods);
      await GemRecoveryService.#recoverLooseGem(item, periods);
    }
  }

  static async #recoverSocketedGems(item, periods) {
    const slots = SocketStore.getSlots(item);
    if (!slots.length) {
      return;
    }

    let changed = false;
    const nextSlots = [];
    for (const slot of slots) {
      const resource = GemResourceService.getSlotResource(slot);
      const restored = await GemRecoveryService.#restoredValue(resource, periods, item);
      if (restored === null) {
        nextSlots.push(slot);
        continue;
      }
      nextSlots.push(GemResourceService.withSlotResourceValue(slot, restored));
      changed = true;
    }

    if (changed) {
      await SocketStore.setSlots(item, nextSlots);
    }
  }

  static async #recoverLooseGem(item, periods) {
    if (!GemCriteria.matches(item)) {
      return;
    }

    const resource = GemResourceService.getGemResource(item);
    const restored = await GemRecoveryService.#restoredValue(resource, periods, item);
    if (restored === null) {
      return;
    }

    await item.setFlag(
      Constants.MODULE_ID,
      Constants.FLAG_GEM_RESOURCE,
      { ...resource, value: restored }
    );
  }

  /**
   * Returns the new charge value for the resource, or null when this trigger
   * does not change it (wrong period, nothing to recover/lose, or a bad
   * formula). The recharge period is excluded: it only recovers through its
   * manual d6 check.
   */
  static async #restoredValue(resource, periods, rollSourceItem) {
    const period = resource?.recovery?.period;
    if (!period || period === "recharge" || !periods.has(period)) {
      return null;
    }
    return GemRecoveryService.#profileValue(resource, rollSourceItem);
  }

  /**
   * Applies the recovery profile (mirroring the native dnd5e ones — recoverAll,
   * loseAll, formula) and returns the new charge value, or null for no change.
   */
  static async #profileValue(resource, rollSourceItem) {
    const type = resource.recovery.type;
    if (type === "loseAll") {
      return resource.value > 0 ? 0 : null;
    }
    if (resource.value >= resource.max) {
      return null;
    }
    if (type !== "formula") {
      return resource.max;
    }

    const formula = resource.recovery.formula;
    if (!formula) {
      return null;
    }

    try {
      const RollClass = globalThis.CONFIG?.Dice?.BasicRoll ?? globalThis.Roll;
      if (!RollClass) {
        return null;
      }
      const roll = new RollClass(formula, rollSourceItem?.getRollData?.() ?? {});
      const total = (await roll.evaluate()).total;
      const amount = Math.max(Math.floor(Number(total) || 0), 0);
      if (!amount) {
        return null;
      }
      return Math.min(resource.value + amount, resource.max);
    } catch (error) {
      console.warn(
        `[${Constants.MODULE_ID}] invalid gem recovery formula "${formula}" on "${resource.key}":`,
        error
      );
      return null;
    }
  }

  /* -------------------------------------------- */
  /*  Recharge (manual d6 check)                  */
  /* -------------------------------------------- */

  /** The minimum d6 result for a successful recharge check; defaults to 6. */
  static rechargeThreshold(resource) {
    const parsed = Number.parseInt(resource?.recovery?.threshold, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 6) : 6;
  }

  /**
   * Rolls the recharge check for a gem socketed in the given host item slot
   * and, on a success, applies the configured recovery profile (recover all,
   * lose all, or the rolled formula amount) inside the slot snapshot.
   * @returns {Promise<{roll: Roll, success: boolean, threshold: number}|null>}
   */
  static async rollSlotRecharge(hostItem, slotIndex) {
    const slots = SocketStore.getSlots(hostItem);
    const slot = Number.isInteger(slotIndex) ? slots[slotIndex] : null;
    if (!slot) {
      return null;
    }

    const resource = GemResourceService.getSlotResource(slot);
    const gemName = ItemResolver.getSlotGemMeta?.(slot)?.name ?? slot?.gem?.name ?? resource?.key ?? "";
    const check = await GemRecoveryService.#rollRechargeCheck(resource, hostItem, gemName);
    if (!check) {
      return null;
    }

    if (check.success) {
      const nextValue = await GemRecoveryService.#profileValue(resource, hostItem);
      if (nextValue !== null) {
        slots[slotIndex] = GemResourceService.withSlotResourceValue(slot, nextValue);
        await SocketStore.setSlots(hostItem, slots);
      }
    }
    return check;
  }

  /**
   * Rolls the recharge check for a loose gem item and, on a success, applies
   * the configured recovery profile.
   */
  static async rollItemRecharge(item) {
    const resource = GemResourceService.getGemResource(item);
    const check = await GemRecoveryService.#rollRechargeCheck(resource, item, item?.name ?? "");
    if (!check) {
      return null;
    }

    if (check.success) {
      const nextValue = await GemRecoveryService.#profileValue(resource, item);
      if (nextValue !== null) {
        await item.setFlag(
          Constants.MODULE_ID,
          Constants.FLAG_GEM_RESOURCE,
          { ...resource, value: nextValue }
        );
      }
    }
    return check;
  }

  static async #rollRechargeCheck(resource, rollSourceItem, name) {
    if (resource?.recovery?.period !== "recharge") {
      return null;
    }
    if (resource.value >= resource.max) {
      const i18n = globalThis.game?.i18n;
      const key = "SCSockets.GemDetails.Resource.Recovery.RechargeFull";
      const hasTranslation = typeof i18n?.has === "function" ? i18n.has(key, { strict: true }) : false;
      const message = hasTranslation && typeof i18n?.format === "function"
        ? i18n.format(key, { name })
        : `${name} is already fully charged.`;
      globalThis.ui?.notifications?.info?.(message);
      return null;
    }

    const RollClass = globalThis.CONFIG?.Dice?.BasicRoll ?? globalThis.Roll;
    if (!RollClass) {
      return null;
    }

    const threshold = GemRecoveryService.rechargeThreshold(resource);
    const roll = new RollClass("1d6", rollSourceItem?.getRollData?.() ?? {});
    await roll.evaluate();
    const success = Number(roll.total) >= threshold;

    await GemRecoveryService.#postRechargeMessage(roll, { name, success, rollSourceItem });
    return { roll, success, threshold };
  }

  static async #postRechargeMessage(roll, { name, success, rollSourceItem }) {
    if (typeof roll?.toMessage !== "function") {
      return;
    }

    const result = success
      ? Constants.localize("SCSockets.GemDetails.Resource.Recovery.RechargeSuccess", "Success!")
      : Constants.localize("SCSockets.GemDetails.Resource.Recovery.RechargeFailure", "Failure.");
    const flavorKey = "SCSockets.GemDetails.Resource.Recovery.RechargeFlavor";
    const i18n = globalThis.game?.i18n;
    const hasTranslation = typeof i18n?.has === "function" ? i18n.has(flavorKey, { strict: true }) : false;
    const flavor = hasTranslation && typeof i18n?.format === "function"
      ? i18n.format(flavorKey, { name, result })
      : `${name} recharge check - ${result}`;

    try {
      const actor = rollSourceItem?.actor ?? null;
      await roll.toMessage({
        speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? undefined,
        flavor
      });
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] failed to post gem recharge message:`, error);
    }
  }
}
