import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { ItemResolver } from "../ItemResolver.js";
import { GemCriteria } from "../../domain/gems/GemCriteria.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";
import { HostOperationQueue } from "../support/HostOperationQueue.js";

/**
 * Restores gem resource charges when their recovery period triggers.
 *
 * dnd5e recovery only touches native item/activity uses, so gem charges
 * (stored in flags inside slot snapshots and on loose gem items) are
 * recovered here, mirroring the native periods:
 * - Rests (dnd5e.restCompleted): the rest type's recoverPeriods plus the
 *   explicit recoverShortRestUses/recoverLongRestUses/recoverDailyUses
 *   overrides and the day/dawn/dusk periods when the rest starts a new day,
 *   matching Actor5e._getRestItemUsesRecovery. Runs after the system applies
 *   its own rest updates because recovery formulas may contain dice, which
 *   cannot be rolled inside the synchronous preRestCompleted hook. Known
 *   divergence from native recovery: formulas referencing actor state (HP,
 *   resources, uses) therefore see the post-rest values, not the pre-rest
 *   ones.
 * - Combat (dnd5e.postCombatRecovery): initiative, turnStart, turnEnd, and
 *   turn periods, per combatant, after the system's own combat recovery.
 * - Recharge: a manual d6 check against the configured threshold, rolled from
 *   the gem sheet or the Socket Descriptions die button.
 *
 * Writes follow a plan/apply split: every roll completes first (rolls can wait
 * on dice animations and chat), then the sockets are re-read and only the
 * planned changes are applied to the freshest state — validating the gem's
 * identity and recovery profile per slot — inside the shared per-host queue
 * (HostOperationQueue), so a recovery write cannot clobber socket CRUD or
 * slot-configuration writes made while its rolls were pending.
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
    // Mirror Actor5e._getRestItemUsesRecovery: the rest configuration can force
    // the short/long/daily periods regardless of the rest type's defaults.
    if (config?.recoverShortRestUses) {
      periods.add("sr");
    }
    if (config?.recoverLongRestUses) {
      periods.add("lr");
    }
    if (config?.recoverDailyUses || config?.newDay) {
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

    const changes = [];
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const resource = GemResourceService.getSlotResource(slot);
      const change = await GemRecoveryService.#plannedChange(
        resource,
        periods,
        () => GemRecoveryService.#slotRollData(item, slot)
      );
      if (change) {
        changes.push({ ...change, index, ...GemRecoveryService.#slotIdentity(slot, resource) });
      }
    }

    if (changes.length) {
      await GemRecoveryService.#applySlotChanges(item, changes);
    }
  }

  static async #recoverLooseGem(item, periods) {
    if (!GemCriteria.matches(item)) {
      return;
    }

    const resource = GemResourceService.getGemResource(item);
    const change = await GemRecoveryService.#plannedChange(
      resource,
      periods,
      () => item?.getRollData?.() ?? {}
    );
    if (change) {
      await GemRecoveryService.#applyItemChange(item, resource, change);
    }
  }

  /* -------------------------------------------- */
  /*  Applying planned changes                    */
  /* -------------------------------------------- */

  static #slotIdentity(slot, resource) {
    return {
      resourceKey: resource?.key ?? null,
      gemName: ItemResolver.getSlotGemMeta?.(slot)?.name ?? null,
      gemInstanceId: slot?._gemInstanceId ?? null,
      profile: GemRecoveryService.#profileFingerprint(resource)
    };
  }

  /**
   * Fingerprint of the recovery profile a change was planned against. If the
   * user edits the period, type, formula, threshold, or the gem's maximum
   * while a roll is pending, the stale planned result must not be applied.
   */
  static #profileFingerprint(resource) {
    if (!resource) {
      return null;
    }
    return JSON.stringify({
      period: resource.recovery?.period ?? "",
      type: resource.recovery?.type ?? "",
      formula: resource.recovery?.formula ?? "",
      threshold: resource.recovery?.threshold ?? "",
      max: resource.max ?? null
    });
  }

  /** Whether the slot still holds the gem (and profile) the change was planned for. */
  static #sameGem(slot, resource, change) {
    if (!resource || resource.key !== change.resourceKey) {
      return false;
    }
    if (change.profile !== undefined
      && change.profile !== GemRecoveryService.#profileFingerprint(resource)) {
      return false;
    }
    // The persistent per-socketing id is authoritative when both sides have
    // one; name matching remains as the fallback for slots written before the
    // id existed.
    const instanceId = slot?._gemInstanceId ?? null;
    if (change.gemInstanceId && instanceId) {
      return change.gemInstanceId === instanceId;
    }
    const name = ItemResolver.getSlotGemMeta?.(slot)?.name ?? null;
    return change.gemName === null || name === null || name === change.gemName;
  }

  /** Re-reads the sockets and applies the planned changes to the freshest state. */
  static async #applySlotChanges(hostItem, changes) {
    await GemRecoveryService.#withHostQueue(hostItem, async () => {
      const slots = SocketStore.getSlots(hostItem);
      let changed = false;
      for (const change of changes) {
        const slot = slots[change.index];
        const resource = GemResourceService.getSlotResource(slot);
        if (!slot || !GemRecoveryService.#sameGem(slot, resource, change)) {
          continue;
        }
        const next = GemRecoveryService.#changedValue(resource, change);
        if (next === null) {
          continue;
        }
        slots[change.index] = GemResourceService.withSlotResourceValue(slot, next);
        changed = true;
      }
      if (changed) {
        await SocketStore.setSlots(hostItem, slots);
      }
    });
  }

  static async #applyItemChange(item, plannedResource, change) {
    const fresh = GemResourceService.getGemResource(item);
    if (!fresh || fresh.key !== plannedResource?.key) {
      return;
    }
    if (GemRecoveryService.#profileFingerprint(fresh)
      !== GemRecoveryService.#profileFingerprint(plannedResource)) {
      return;
    }
    const next = GemRecoveryService.#changedValue(fresh, change);
    if (next === null) {
      return;
    }
    await item.setFlag(
      Constants.MODULE_ID,
      Constants.FLAG_GEM_RESOURCE,
      { ...fresh, value: next }
    );
  }

  static async #withHostQueue(hostItem, task) {
    return HostOperationQueue.enqueue(hostItem, task);
  }

  /* -------------------------------------------- */
  /*  Roll data                                   */
  /* -------------------------------------------- */

  /**
   * Roll data for a socketed gem's recovery formula. A temporary document is
   * built from the snapshot so `@item.*` resolves exactly like a loose gem's
   * Item5e.getRollData() (including labels and derived data); the host item's
   * data stays reachable through `@host.*`, and the actor data comes through
   * unchanged.
   */
  static #slotRollData(hostItem, slot) {
    const hostRollData = { ...(hostItem?.getRollData?.() ?? {}) };
    const source = GemResourceService.getSlotGemSource(slot);
    if (!source?.system || typeof source.system !== "object") {
      return hostRollData;
    }

    const rollData = GemRecoveryService.#snapshotRollData(source, hostItem)
      ?? { ...hostRollData, item: foundry.utils.deepClone(source.system) };
    rollData.host = hostRollData.item ?? null;
    return rollData;
  }

  static #snapshotRollData(source, hostItem) {
    const ItemDocument = globalThis.CONFIG?.Item?.documentClass;
    if (typeof ItemDocument !== "function") {
      return null;
    }
    try {
      const gem = new ItemDocument(source, { parent: hostItem?.actor ?? null });
      const rollData = gem.getRollData?.();
      return rollData && typeof rollData === "object" ? { ...rollData } : null;
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] failed to build roll data from gem snapshot`, error);
      return null;
    }
  }

  /* -------------------------------------------- */
  /*  Planning                                    */
  /* -------------------------------------------- */

  /**
   * Returns the planned change for the resource, or null when this trigger
   * does not affect it (wrong period, nothing to recover/lose, or a bad
   * formula). The recharge period is excluded: it only recovers through its
   * manual d6 check.
   */
  static async #plannedChange(resource, periods, getRollData) {
    const period = resource?.recovery?.period;
    if (!period || period === "recharge" || !periods.has(period)) {
      return null;
    }
    return GemRecoveryService.#plannedRecovery(resource, getRollData);
  }

  /**
   * Plans the recovery profile (mirroring the native dnd5e ones — recoverAll,
   * loseAll, formula) as `{mode: "max"|"zero"|"delta", amount?}` or null for
   * no change. Formula amounts apply signed, like UsesField.recoverUses, so a
   * negative total drains charges.
   */
  static async #plannedRecovery(resource, getRollData) {
    const type = resource.recovery.type;
    if (type === "loseAll") {
      return resource.value > 0 ? { mode: "zero" } : null;
    }
    if (type !== "formula") {
      return resource.value < resource.max ? { mode: "max" } : null;
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
      const roll = new RollClass(formula, getRollData?.() ?? {});
      // Mirror UsesField.recoverUses: daily formulas recover a week's worth
      // under the gritty realism rest variant.
      if (["day", "dawn", "dusk"].includes(resource.recovery.period)
        && GemRecoveryService.#isGrittyRest()) {
        roll.alter?.(7, 0, { multiplyNumeric: true });
      }
      const total = (await roll.evaluate()).total;
      const amount = Math.trunc(Number(total) || 0);
      if (!amount) {
        return null;
      }
      return { mode: "delta", amount };
    } catch (error) {
      console.warn(
        `[${Constants.MODULE_ID}] invalid gem recovery formula "${formula}" on "${resource.key}":`,
        error
      );
      return null;
    }
  }

  static #isGrittyRest() {
    try {
      return globalThis.game?.settings?.get?.("dnd5e", "restVariant") === "gritty";
    } catch {
      return false;
    }
  }

  /** New charge value after the planned change, computed against the freshest resource; null for no change. */
  static #changedValue(resource, change) {
    let next;
    if (change.mode === "zero") {
      next = 0;
    } else if (change.mode === "max") {
      next = resource.max;
    } else {
      next = Math.min(Math.max(resource.value + change.amount, 0), resource.max);
    }
    return next === resource.value ? null : next;
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
   * lose all, or the rolled formula amount) inside the slot snapshot. The
   * write validates that the slot still holds the same gem.
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
      const change = await GemRecoveryService.#plannedRecovery(
        resource,
        () => GemRecoveryService.#slotRollData(hostItem, slot)
      );
      if (change) {
        await GemRecoveryService.#applySlotChanges(hostItem, [
          { ...change, index: slotIndex, ...GemRecoveryService.#slotIdentity(slot, resource) }
        ]);
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
      const change = await GemRecoveryService.#plannedRecovery(
        resource,
        () => item?.getRollData?.() ?? {}
      );
      if (change) {
        await GemRecoveryService.#applyItemChange(item, resource, change);
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
