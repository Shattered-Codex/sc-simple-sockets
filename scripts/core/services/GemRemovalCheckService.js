import { Constants } from "../Constants.js";
import { getSlotRemovalCheckDc, getSlotRemovalCheckFailure } from "../helpers/socketSlotConfig.js";
import { ItemResolver } from "../ItemResolver.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { GemCheckService } from "./GemCheckService.js";
import { GemConcealmentService } from "../../domain/gems/GemConcealmentService.js";

/**
 * Optional check a player must pass to pull a gem out of a socket.
 *
 * The feature is opt-in through the module settings. The global settings pick
 * the check, the DC and what a failure does; a slot can override the DC and
 * the failure outcome. A resolved DC of 0 means the slot needs no check.
 */
export class GemRemovalCheckService {
  /**
   * Decides whether removing the gem in `slot` requires a check right now.
   * Returns `{ required: false }` or `{ required: true, actor, check, dc, failure, gem }`.
   */
  static plan({ hostItem = null, slot = null, user = globalThis.game?.user } = {}) {
    const notRequired = { required: false };

    if (!ModuleSettings.isGemRemovalCheckEnabled()) {
      return notRequired;
    }
    if (!slot?.gem && !slot?._gemData) {
      return notRequired;
    }
    if (user?.isGM && !ModuleSettings.doesGemRemovalCheckApplyToGm()) {
      return notRequired;
    }

    // Without an actor there is nobody to roll: world and compendium items are
    // edited freely.
    const actor = hostItem?.actor ?? null;
    if (!actor) {
      return notRequired;
    }

    const gem = ItemResolver.expandSnapshot(slot?._gemData ?? null) ?? null;
    const dc = GemRemovalCheckService.resolveDc({ hostItem, slot, gem });
    if (!Number.isFinite(dc) || dc <= 0) {
      return notRequired;
    }

    return {
      required: true,
      actor,
      check: GemCheckService.parseCheckId(ModuleSettings.getGemRemovalCheckType()),
      dc,
      failure: GemRemovalCheckService.resolveFailureOutcome(slot),
      gem,
      // The roll is posted to chat, so a concealed gem is not named there.
      concealed: GemConcealmentService.isSlotConcealed(hostItem, slot, user)
    };
  }

  /** The slot override when set and resolvable, otherwise the global DC. */
  static resolveDc({ hostItem = null, slot = null, gem = null } = {}) {
    const rollData = GemRemovalCheckService.#rollData(hostItem);
    const override = getSlotRemovalCheckDc(slot);

    if (override.length) {
      const resolved = GemCheckService.resolveDcFormula(override, { gem, rollData });
      if (resolved !== null) {
        return resolved;
      }
      console.warn(
        `[${Constants.MODULE_ID}] slot removal DC "${override}" could not be resolved; using the global DC.`
      );
    }

    const resolved = GemCheckService.resolveDc(ModuleSettings.getGemRemovalCheckDcConfig(), { gem, rollData });
    if (resolved !== null) {
      return resolved;
    }

    console.warn(`[${Constants.MODULE_ID}] the global removal DC formula could not be resolved; using DC ${GemCheckService.DEFAULT_DC}.`);
    return GemCheckService.DEFAULT_DC;
  }

  static resolveFailureOutcome(slot) {
    return getSlotRemovalCheckFailure(slot) || ModuleSettings.getGemRemovalFailureOutcome();
  }

  /**
   * Rolls a planned check.
   * Returns `{ ok: false, reason }` when cancelled, otherwise
   * `{ ok: true, success, total, dc, failure }`.
   */
  static async roll(plan) {
    const gemName = plan?.concealed ? "" : String(plan?.gem?.name ?? "").trim();
    const flavor = gemName.length
      ? game?.i18n?.format?.("SCSockets.RemovalCheck.FlavorNamed", { gem: gemName })
        ?? `Gem removal: ${gemName}`
      : Constants.localize("SCSockets.RemovalCheck.Flavor", "Gem removal");

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
