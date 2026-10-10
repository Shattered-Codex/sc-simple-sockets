import { Constants } from "../../../../Constants.js";
import { GemCheckService } from "../../../../services/GemCheckService.js";
import { InventoryService } from "../../../../services/InventoryService.js";
import { HostOperationQueue } from "../../../../support/HostOperationQueue.js";
import { GemBreakService } from "../../../../../domain/gems/GemBreakService.js";
import { GemCriteria } from "../../../../../domain/gems/GemCriteria.js";
import { ScMoreActivitiesGemPickerApp } from "../../ScMoreActivitiesGemPickerApp.js";

const I18N = "SCSockets.Integrations.ScMoreActivities.GemRepair";

const ACTION_REPAIR = "repair";
const ACTION_BREAK = "break";

/**
 * Repairs broken gems from the inventory of the actor using the activity, or
 * breaks intact ones when the activity is set to break: the user chooses
 * which, up to the amount the activity allows. Each gem is optionally gated by
 * a check whose DC can be fixed, a formula, or looked up by the gem's rarity.
 * The actor owns the gem, so no GM mediation is needed.
 */
export class ScMoreActivitiesGemRepairActivityService {
  /** Warns and returns false when there is no actor or no gem to act on. */
  static ensureRepairable(activity) {
    const actor = ScMoreActivitiesGemRepairActivityService.#getActor(activity);
    if (!actor) {
      ui.notifications?.warn?.(
        Constants.localize(`${I18N}.Warnings.NoActor`, "This activity must be used by an actor.")
      );
      return false;
    }

    if (!ScMoreActivitiesGemRepairActivityService.listTargetGems(activity, actor).length) {
      const breaking = ScMoreActivitiesGemRepairActivityService.resolveAction(activity) === ACTION_BREAK;
      ui.notifications?.warn?.(
        game.i18n?.format?.(`${I18N}.Warnings.${breaking ? "NoIntactGems" : "NoBrokenGems"}`, { actor: actor.name })
          ?? `${actor.name} has no ${breaking ? "gems to break" : "broken gems to repair"}.`
      );
      return false;
    }

    return true;
  }

  /** Activities saved before the option existed have no action and repair. */
  static resolveAction(activity) {
    return activity?.repair?.action === ACTION_BREAK ? ACTION_BREAK : ACTION_REPAIR;
  }

  static listBrokenGems(actor) {
    const items = actor?.items?.contents ?? Array.from(actor?.items ?? []);
    return items.filter((item) => GemCriteria.matches(item) && GemBreakService.isBroken(item));
  }

  static listIntactGems(actor) {
    const items = actor?.items?.contents ?? Array.from(actor?.items ?? []);
    return items.filter((item) => GemCriteria.matches(item)
      && !item[Constants.PROP_SOCKET_SOURCE] && !GemBreakService.isBroken(item));
  }

  /** The gems the activity acts on: broken ones to repair, intact ones to break. */
  static listTargetGems(activity, actor) {
    return ScMoreActivitiesGemRepairActivityService.resolveAction(activity) === ACTION_BREAK
      ? ScMoreActivitiesGemRepairActivityService.listIntactGems(actor)
      : ScMoreActivitiesGemRepairActivityService.listBrokenGems(actor);
  }

  /** How many gems one use may repair or break; null when every gem may be. */
  static resolveLimit(activity) {
    const amount = activity?.repair?.amount ?? {};
    if (amount.mode === "all") {
      return null;
    }
    return Math.max(Math.floor(Number(amount.count)) || 1, 1);
  }

  static async execute(activity, usageContext = {}) {
    const actor = ScMoreActivitiesGemRepairActivityService.#getActor(activity);
    const gems = ScMoreActivitiesGemRepairActivityService.listTargetGems(activity, actor);
    if (!actor || !gems.length) {
      return usageContext.results;
    }

    const picks = await ScMoreActivitiesGemRepairActivityService.#pickGems(activity, actor, gems);
    if (!picks.length) {
      return usageContext.results;
    }

    const breaking = ScMoreActivitiesGemRepairActivityService.resolveAction(activity) === ACTION_BREAK;
    const changed = [];
    const messages = [];
    let failure = null;
    // Each gem is its own attempt: the DC can depend on the gem, and a stack
    // is handled one unit at a time.
    attempts: for (const { gem, units } of picks) {
      for (let unit = 0; unit < units; unit += 1) {
        const outcome = await ScMoreActivitiesGemRepairActivityService.#attempt(activity, actor, gem, breaking);
        if (outcome.gem) {
          changed.push(outcome.gem);
          messages.push(outcome.message);
          continue;
        }
        failure = outcome;
        if (outcome.aborted) {
          break attempts;
        }
        if (!outcome.message) {
          break;
        }
      }
    }

    if (!changed.length) {
      return { ok: false, reason: failure.reason, ...(failure.message ? { message: failure.message } : {}) };
    }
    return {
      ok: true,
      reason: breaking ? "gem-broken" : "gem-repaired",
      message: messages.join(" "),
      gem: changed[0],
      gems: changed
    };
  }

  static async #attempt(activity, actor, gem, breaking) {
    const check = await ScMoreActivitiesGemRepairActivityService.#performCheck(activity, actor, gem);
    if (!check.ok) {
      return { aborted: true, reason: check.reason };
    }
    if (!check.success) {
      const message = game.i18n?.format?.(`${I18N}.Notifications.${breaking ? "BreakFailed" : "Failed"}`, { name: gem.name })
        ?? `The attempt to ${breaking ? "break" : "repair"} ${gem.name} failed.`;
      ui.notifications?.warn?.(message);
      return { reason: breaking ? "break-check-failed" : "repair-check-failed", message };
    }

    // Re-read the state: the roll dialog may have been open for a while.
    const changed = GemBreakService.isBroken(gem) !== breaking
      ? await ScMoreActivitiesGemRepairActivityService.#changeOne(gem, breaking)
      : null;
    if (!changed) {
      return { reason: breaking ? "gem-already-broken" : "gem-not-broken" };
    }
    const message = game.i18n?.format?.(`${I18N}.Notifications.${breaking ? "Broken" : "Repaired"}`, { name: gem.name })
      ?? `${gem.name} was ${breaking ? "broken" : "repaired"}.`;
    ui.notifications?.info?.(message);
    return { gem: changed, message };
  }

  /**
   * Repairs a single unit. A stack of broken gems loses one unit, which comes
   * back as an intact gem (stacking with a matching intact gem when possible).
   */
  static async repairOne(gem) {
    return ScMoreActivitiesGemRepairActivityService.#changeOne(gem, false);
  }

  /** Breaks a single unit, the mirror of `repairOne`. */
  static async breakOne(gem) {
    return ScMoreActivitiesGemRepairActivityService.#changeOne(gem, true);
  }

  static async #changeOne(gem, breaking) {
    const actor = gem?.actor;
    return HostOperationQueue.enqueue(actor ?? gem, async () => {
      const current = actor ? actor.items?.get(gem.id) : gem;
      if (!current || GemBreakService.isBroken(current) === breaking) {
        return null;
      }
      const quantity = Number(current.system?.quantity ?? 1);
      if (!(quantity > 0)) {
        return null;
      }
      if (!actor || quantity <= 1) {
        const changed = breaking ? await GemBreakService.break(current) : await GemBreakService.repair(current);
        return changed ? current : null;
      }

      const data = current.toObject();
      delete data._id;
      if (breaking) {
        GemBreakService.markDataBroken(data);
      } else {
        GemBreakService.clearDataBroken(data);
      }
      await current.update({ "system.quantity": quantity - 1 });
      try {
        const changed = await InventoryService.returnOneLocked(current, data);
        if (!changed) {
          throw new Error("The gem could not be returned to the inventory.");
        }
        return changed;
      } catch (error) {
        await current.update({ "system.quantity": quantity });
        throw error;
      }
    });
  }

  static #getActor(activity) {
    return activity?.actor ?? activity?.item?.actor ?? null;
  }

  /** Always asks which gems to repair or break; resolves to `[{ gem, units }]`. */
  static async #pickGems(activity, actor, gems) {
    const limit = ScMoreActivitiesGemRepairActivityService.resolveLimit(activity);
    const breaking = ScMoreActivitiesGemRepairActivityService.resolveAction(activity) === ACTION_BREAK;
    const text = `${I18N}.${breaking ? "BreakApp" : "App"}`;
    const entries = gems.map((gem) => {
      const name = String(gem.name ?? "").trim();
      const quantity = Math.max(Number(gem.system?.quantity ?? 1) || 1, 1);
      return {
        ariaLabel: name,
        filterName: name.toLowerCase(),
        img: String(gem.img ?? "").trim(),
        name,
        quantityLabel: quantity > 1 ? `×${quantity}` : "",
        titleText: name,
        units: quantity,
        uuid: gem.uuid
      };
    });
    const count = entries.reduce((total, entry) => total + entry.units, 0);

    const picked = await ScMoreActivitiesGemPickerApp.pick({
      title: Constants.localize(`${text}.Title`, breaking ? "Choose Gems to Break" : "Choose Gems to Repair"),
      subtitle: limit === null
        ? game.i18n?.format?.(`${text}.SubtitleAll`, { actor: actor.name, count })
          ?? `${actor.name} has ${count} gems to choose from.`
        : game.i18n?.format?.(`${text}.Subtitle`, { actor: actor.name, count, limit })
          ?? `${actor.name} has ${count} gems to choose from. Choose up to ${limit}.`,
      confirmLabel: Constants.localize(`${text}.Confirm`, breaking ? "Break" : "Repair"),
      confirmIcon: breaking ? "fa-solid fa-gem" : "fa-solid fa-screwdriver-wrench",
      multiple: true,
      limit,
      // Nothing to decide when every broken gem fits in this use. Breaking
      // is never preselected: it should not happen by confirming a default.
      selected: !breaking && (limit === null || count <= limit) ? entries.map((entry) => entry.uuid) : [],
      selectionLabel: (selected, max) => (max === null
        ? game.i18n?.format?.(`${I18N}.App.Selected`, { count: selected }) ?? `${selected} selected`
        : game.i18n?.format?.(`${I18N}.App.SelectedOf`, { count: selected, limit: max })
          ?? `${selected} of ${max} selected`),
      gems: entries
    });

    return (Array.isArray(picked) ? picked : [])
      .map(({ uuid, units }) => ({ gem: gems.find((gem) => gem.uuid === uuid), units }))
      .filter((pick) => pick.gem);
  }

  static #resolveCheck(activity) {
    const config = activity?.repair?.check ?? {};
    const type = String(config.type ?? GemCheckService.TYPE_NONE).trim();
    if (!GemCheckService.CHECK_TYPES.includes(type)) {
      return null;
    }
    return GemCheckService.parseCheckId(
      type === GemCheckService.TYPE_FLAT ? type : `${type}:${String(config[type] ?? "").trim()}`
    );
  }

  static resolveDc(activity, gem) {
    const config = activity?.repair?.check ?? {};
    let rollData = {};
    try {
      rollData = activity?.getRollData?.() ?? activity?.item?.getRollData?.() ?? {};
    } catch {
      rollData = {};
    }

    const dc = GemCheckService.resolveDc({
      mode: config.dcMode,
      value: config.dc,
      formula: config.formula,
      rarity: config.rarity
    }, { gem, rollData });
    if (dc !== null) {
      return dc;
    }

    ui.notifications?.warn?.(
      game.i18n?.format?.(`${I18N}.Warnings.InvalidDcFormula`, {
        formula: String(config.formula ?? ""),
        dc: GemCheckService.DEFAULT_DC
      }) ?? `The repair DC formula could not be resolved; using DC ${GemCheckService.DEFAULT_DC}.`
    );
    return GemCheckService.DEFAULT_DC;
  }

  static async #performCheck(activity, actor, gem) {
    const check = ScMoreActivitiesGemRepairActivityService.#resolveCheck(activity);
    if (!check) {
      return { ok: true, success: true };
    }

    const dc = ScMoreActivitiesGemRepairActivityService.resolveDc(activity, gem);
    if (dc <= 0) {
      return { ok: true, success: true };
    }

    return GemCheckService.roll({
      actor,
      check,
      dc,
      flavor: ScMoreActivitiesGemRepairActivityService.resolveAction(activity) === ACTION_BREAK
        ? game.i18n?.format?.(`${I18N}.BreakRollFlavor`, { gem: gem.name }) ?? `Gem break: ${gem.name}`
        : game.i18n?.format?.(`${I18N}.RollFlavor`, { gem: gem.name }) ?? `Gem repair: ${gem.name}`
    });
  }
}
