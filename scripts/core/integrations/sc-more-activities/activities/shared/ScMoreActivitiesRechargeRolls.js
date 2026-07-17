import { Constants } from "../../../../Constants.js";

/**
 * Shared roll logic for the recharge-style activities: the optional
 * ability/skill check gate, the restored-amount formula, and the DC formula.
 * All i18n lives under SCSockets.Integrations.ScMoreActivities.SocketRecharge
 * because the messages are identical for both activities.
 */
export class ScMoreActivitiesRechargeRolls {
  static requiresActor(activity) {
    const type = String(activity?.recharge?.check?.type ?? "none").trim();
    return type === "ability" || type === "skill";
  }

  /**
   * Warns and returns false when a check is configured but no actor is
   * available to roll it. Call before starting the targeting flow.
   */
  static ensureActorForCheck(activity) {
    if (!ScMoreActivitiesRechargeRolls.requiresActor(activity) || activity?.item?.actor) {
      return true;
    }

    ui.notifications?.warn?.(
      Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.NoActor",
        "This activity requires an actor to roll the recharge check."
      )
    );
    return false;
  }

  /**
   * Rolls the configured ability or skill check, if any.
   * Returns { ok: false } when the roll was cancelled, otherwise { ok: true, success }.
   */
  static async performCheck(activity) {
    const type = String(activity?.recharge?.check?.type ?? "none").trim();
    if (type !== "ability" && type !== "skill") {
      return { ok: true, success: true };
    }

    const actor = activity?.item?.actor ?? null;
    if (!actor) {
      return {
        ok: false,
        reason: "no-actor",
        message: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.NoActor",
          "This activity requires an actor to roll the recharge check."
        )
      };
    }

    const dc = ScMoreActivitiesRechargeRolls.resolveCheckDc(activity);
    let rolls = null;

    if (type === "ability") {
      const ability = String(activity?.recharge?.check?.ability ?? "").trim() || "int";
      rolls = await actor.rollAbilityCheck({ ability, target: dc });
    } else {
      const skill = String(activity?.recharge?.check?.skill ?? "").trim() || "arc";
      rolls = await actor.rollSkill({ skill, target: dc });
    }

    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    if (!roll) {
      return { ok: false, reason: "roll-cancelled" };
    }

    return { ok: true, success: roll.isSuccess ?? (Number(roll.total) >= dc) };
  }

  /**
   * Rolls the restored charge amount.
   * Returns null for a full recharge (blank formula), false when the roll failed,
   * otherwise the rolled amount.
   */
  static async rollAmount(activity) {
    const formula = String(activity?.recharge?.formula ?? "").trim();
    if (!formula.length) {
      return null;
    }

    const actor = activity?.item?.actor ?? null;
    try {
      const roll = new Roll(formula, actor?.getRollData?.() ?? {});
      await roll.evaluate();
      await roll.toMessage({
        flavor: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.RollFlavor",
          "Socketed Gem Recharge"
        ),
        speaker: ChatMessage.getSpeaker({ actor })
      });
      return Math.max(Math.trunc(Number(roll.total) || 0), 0);
    } catch (error) {
      ui.notifications?.warn?.(
        game.i18n?.format?.(
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.InvalidFormula",
          { formula }
        ) ?? `The recharge formula "${formula}" could not be rolled.`
      );
      if (Constants.isDebugEnabled()) {
        console.error(`[${Constants.MODULE_ID}] recharge formula roll failed`, error);
      }
      return false;
    }
  }

  /**
   * Resolves the check DC, which may be a flat number or a deterministic
   * formula evaluated against the activity's roll data (e.g. "8 + @prof").
   */
  static resolveCheckDc(activity) {
    const raw = String(activity?.recharge?.check?.dc ?? "").trim();
    if (!raw.length) {
      return 10;
    }

    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return Math.max(Math.trunc(numeric), 0);
    }

    const rollData = activity?.getRollData?.()
      ?? activity?.item?.actor?.getRollData?.()
      ?? {};
    const simplified = dnd5e.utils?.simplifyBonus?.(raw, rollData);
    if (Number.isFinite(simplified) && simplified > 0) {
      return Math.trunc(simplified);
    }

    ui.notifications?.warn?.(
      game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.InvalidDcFormula",
        { formula: raw }
      ) ?? `The check DC formula "${raw}" could not be resolved; using DC 10.`
    );
    return 10;
  }
}
