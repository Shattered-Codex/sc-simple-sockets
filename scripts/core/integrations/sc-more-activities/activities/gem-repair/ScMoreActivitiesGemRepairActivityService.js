import { Constants } from "../../../../Constants.js";
import { GemCheckService } from "../../../../services/GemCheckService.js";
import { InventoryService } from "../../../../services/InventoryService.js";
import { HostOperationQueue } from "../../../../support/HostOperationQueue.js";
import { GemBreakService } from "../../../../../domain/gems/GemBreakService.js";
import { GemCriteria } from "../../../../../domain/gems/GemCriteria.js";
import { ScMoreActivitiesGemPickerApp } from "../../ScMoreActivitiesGemPickerApp.js";

const I18N = "SCSockets.Integrations.ScMoreActivities.GemRepair";

/**
 * Repairs one broken gem from the inventory of the actor using the activity,
 * optionally gated by a check whose DC can be fixed, a formula, or looked up
 * by the gem's rarity. The actor owns the gem, so no GM mediation is needed.
 */
export class ScMoreActivitiesGemRepairActivityService {
  /** Warns and returns false when there is no actor or no broken gem to repair. */
  static ensureRepairable(activity) {
    const actor = ScMoreActivitiesGemRepairActivityService.#getActor(activity);
    if (!actor) {
      ui.notifications?.warn?.(
        Constants.localize(`${I18N}.Warnings.NoActor`, "This activity must be used by an actor.")
      );
      return false;
    }

    if (!ScMoreActivitiesGemRepairActivityService.listBrokenGems(actor).length) {
      ui.notifications?.warn?.(
        game.i18n?.format?.(`${I18N}.Warnings.NoBrokenGems`, { actor: actor.name })
          ?? `${actor.name} has no broken gems to repair.`
      );
      return false;
    }

    return true;
  }

  static listBrokenGems(actor) {
    const items = actor?.items?.contents ?? Array.from(actor?.items ?? []);
    return items.filter((item) => GemCriteria.matches(item) && GemBreakService.isBroken(item));
  }

  static async execute(activity, usageContext = {}) {
    const actor = ScMoreActivitiesGemRepairActivityService.#getActor(activity);
    const gems = ScMoreActivitiesGemRepairActivityService.listBrokenGems(actor);
    if (!actor || !gems.length) {
      return usageContext.results;
    }

    const gem = await ScMoreActivitiesGemRepairActivityService.#pickGem(actor, gems);
    if (!gem) {
      return usageContext.results;
    }

    const check = await ScMoreActivitiesGemRepairActivityService.#performCheck(activity, actor, gem);
    if (!check.ok) {
      return { ok: false, reason: check.reason };
    }
    if (!check.success) {
      const message = game.i18n?.format?.(`${I18N}.Notifications.Failed`, { name: gem.name })
        ?? `The attempt to repair ${gem.name} failed.`;
      ui.notifications?.warn?.(message);
      return { ok: false, reason: "repair-check-failed", message };
    }

    // Re-read the state: the roll dialog may have been open for a while.
    if (!GemBreakService.isBroken(gem)) {
      return { ok: false, reason: "gem-not-broken" };
    }

    const repaired = await ScMoreActivitiesGemRepairActivityService.repairOne(gem);
    if (!repaired) {
      return { ok: false, reason: "gem-not-broken" };
    }
    const message = game.i18n?.format?.(`${I18N}.Notifications.Repaired`, { name: gem.name })
      ?? `${gem.name} was repaired.`;
    ui.notifications?.info?.(message);
    return { ok: true, reason: "gem-repaired", message, gem: repaired };
  }

  /**
   * Repairs a single unit. A stack of broken gems loses one unit, which comes
   * back as an intact gem (stacking with a matching intact gem when possible).
   */
  static async repairOne(gem) {
    const actor = gem?.actor;
    return HostOperationQueue.enqueue(actor ?? gem, async () => {
      const current = actor ? actor.items?.get(gem.id) : gem;
      if (!current || !GemBreakService.isBroken(current)) {
        return null;
      }
      const quantity = Number(current.system?.quantity ?? 1);
      if (!(quantity > 0)) {
        return null;
      }
      if (!actor || quantity <= 1) {
        await GemBreakService.repair(current);
        return current;
      }

      const data = current.toObject();
      delete data._id;
      GemBreakService.clearDataBroken(data);
      await current.update({ "system.quantity": quantity - 1 });
      try {
        const repaired = await InventoryService.returnOne(current, data);
        if (!repaired) {
          throw new Error("The repaired gem could not be returned to the inventory.");
        }
        return repaired;
      } catch (error) {
        await current.update({ "system.quantity": quantity });
        throw error;
      }
    });
  }

  static #getActor(activity) {
    return activity?.actor ?? activity?.item?.actor ?? null;
  }

  static async #pickGem(actor, gems) {
    if (gems.length === 1) {
      return gems[0];
    }

    const picked = await ScMoreActivitiesGemPickerApp.pick({
      title: Constants.localize(`${I18N}.App.Title`, "Choose Gem to Repair"),
      subtitle: game.i18n?.format?.(`${I18N}.App.Subtitle`, { actor: actor.name, count: gems.length })
        ?? `${actor.name} has ${gems.length} broken gems. Choose which one to repair.`,
      gems: gems.map((gem) => {
        const name = String(gem.name ?? "").trim();
        const quantity = Math.max(Number(gem.system?.quantity ?? 1) || 1, 1);
        return {
          ariaLabel: name,
          filterName: name.toLowerCase(),
          img: String(gem.img ?? "").trim(),
          name,
          quantityLabel: quantity > 1 ? `×${quantity}` : "",
          titleText: name,
          uuid: gem.uuid
        };
      })
    });

    return gems.find((gem) => gem.uuid === picked) ?? null;
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
      flavor: game.i18n?.format?.(`${I18N}.RollFlavor`, { gem: gem.name }) ?? `Gem repair: ${gem.name}`
    });
  }
}
