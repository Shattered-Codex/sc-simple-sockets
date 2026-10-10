import { Constants } from "../Constants.js";
import {
  getSlotCheckRarityDcs,
  getSlotInsertionCheckDc,
  getSlotInsertionCheckFailure,
  getSlotInsertionCheckType
} from "../helpers/socketSlotConfig.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { GemCheckService } from "./GemCheckService.js";
import { GemConcealmentService } from "../../domain/gems/GemConcealmentService.js";

/**
 * Optional check a player must pass to socket a gem, the mirror of
 * `GemRemovalCheckService`.
 *
 * The feature is opt-in through the module settings. The global settings pick
 * the check, the DC and what a failure does to the gem; a slot can override
 * the check, the DC and the failure outcome. A resolved DC of 0 means the slot needs no
 * check.
 */
export class GemInsertionCheckService {
  /**
   * Whether a check could apply to this host and user at all. It is cheap, so
   * callers can leave before resolving the gem when the feature is off.
   */
  static applies({ hostItem = null, user = globalThis.game?.user } = {}) {
    if (!ModuleSettings.isGemInsertionCheckEnabled()) {
      return false;
    }
    if (user?.isGM && !ModuleSettings.doesGemInsertionCheckApplyToGm()) {
      return false;
    }
    // Without an actor there is nobody to roll: world and compendium items are
    // edited freely.
    return Boolean(hostItem?.actor);
  }

  /**
   * Decides whether socketing `gemItem` into `slot` requires a check right now.
   * Returns `{ required: false }` or `{ required: true, actor, check, dc, failure, gem }`.
   */
  static plan({ hostItem = null, slot = null, gemItem = null, user = globalThis.game?.user } = {}) {
    const slotCheck = getSlotInsertionCheckType(slot);
    if (
      !gemItem
      || slotCheck === GemCheckService.TYPE_NONE
      || !GemInsertionCheckService.applies({ hostItem, user })
    ) {
      return { required: false };
    }

    const dc = GemInsertionCheckService.resolveDc({ hostItem, slot, gem: gemItem });
    if (!Number.isFinite(dc) || dc <= 0) {
      return { required: false };
    }

    return {
      required: true,
      actor: hostItem.actor,
      check: GemCheckService.parseCheckId(slotCheck || ModuleSettings.getGemInsertionCheckType()),
      dc,
      failure: GemInsertionCheckService.resolveFailureOutcome(slot),
      gem: gemItem,
      // The roll is posted to chat, so an unidentified gem is not named there.
      concealed: GemConcealmentService.isEnabled() && GemConcealmentService.isUnidentified(gemItem)
    };
  }

  /** The slot override when set and resolvable, otherwise the global DC. */
  static resolveDc({ hostItem = null, slot = null, gem = null } = {}) {
    const rollData = GemInsertionCheckService.#rollData(hostItem);
    const rarity = getSlotCheckRarityDcs(slot, "insertion");
    if (rarity) {
      return GemCheckService.resolveDc({ mode: GemCheckService.DC_MODE_RARITY, rarity }, { gem });
    }
    const override = getSlotInsertionCheckDc(slot);

    if (override.length) {
      const resolved = GemCheckService.resolveDcFormula(override, { gem, rollData });
      if (resolved !== null) {
        return resolved;
      }
      console.warn(
        `[${Constants.MODULE_ID}] slot insertion DC "${override}" could not be resolved; using the global DC.`
      );
    }

    const resolved = GemCheckService.resolveDc(ModuleSettings.getGemInsertionCheckDcConfig(), { gem, rollData });
    if (resolved !== null) {
      return resolved;
    }

    console.warn(`[${Constants.MODULE_ID}] the global insertion DC formula could not be resolved; using DC ${GemCheckService.DEFAULT_DC}.`);
    return GemCheckService.DEFAULT_DC;
  }

  static resolveFailureOutcome(slot) {
    return getSlotInsertionCheckFailure(slot) || ModuleSettings.getGemInsertionFailureOutcome();
  }

  /**
   * Rolls a planned check.
   * Returns `{ ok: false, reason }` when cancelled, otherwise
   * `{ ok: true, success, total, dc, failure }`.
   */
  static async roll(plan) {
    const gemName = plan?.concealed ? "" : String(plan?.gem?.name ?? "").trim();
    const flavor = gemName.length
      ? game?.i18n?.format?.("SCSockets.InsertionCheck.FlavorNamed", { gem: gemName })
        ?? `Gem socketing: ${gemName}`
      : Constants.localize("SCSockets.InsertionCheck.Flavor", "Gem socketing");

    const result = await GemCheckService.roll({
      actor: plan?.actor ?? null,
      check: plan?.check,
      dc: plan?.dc,
      flavor
    });
    return result.ok ? { ...result, failure: plan?.failure } : result;
  }

  static #rollData(hostItem) {
    try {
      return hostItem?.getRollData?.() ?? hostItem?.actor?.getRollData?.() ?? {};
    } catch {
      return {};
    }
  }
}
