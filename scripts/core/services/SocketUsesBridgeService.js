import { SocketConsumptionService } from "./SocketConsumptionService.js";
import { SocketRollDataService } from "./SocketRollDataService.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";
import {
  CONSUMPTION_TYPE_CHARGE,
  parseSocketTarget
} from "../helpers/socketConsumptionConfig.js";

const WRAPPED = Symbol("sc-simple-sockets.socketUsesBridge");

/**
 * Bridges native dnd5e Item Uses consumption to socket charges when an item's
 * Maximum Uses is exactly bound to a socket pool's capacity.
 */
export class SocketUsesBridgeService {
  static register() {
    Hooks.once("init", () => {
      if (game?.system?.id !== "dnd5e") return;
      const itemUses = globalThis.CONFIG?.DND5E?.activityConsumptionTypes?.itemUses;
      const original = itemUses?.consume;
      if (typeof original !== "function" || original[WRAPPED]) return;

      const wrapped = async function (config, updates) {
        return SocketUsesBridgeService.consumeItemUses(original, this, config, updates);
      };
      Object.defineProperty(wrapped, WRAPPED, { value: true });
      itemUses.consume = wrapped;
    });
  }

  static async consumeItemUses(original, target, config, updates) {
    const item = target?.target ? target?.actor?.items?.get?.(target.target) : target?.item;
    const formula = item?._source?.system?.uses?.max ?? item?.system?._source?.uses?.max;
    const binding = SocketRollDataService.parseUsesFormula(formula);
    if (!item || !binding) {
      return original.call(target, config, updates);
    }

    // An explicit Socketed Charges target owns the deduction. Suppress the
    // automatic itemUses increment so the same charge is not counted twice.
    if (SocketUsesBridgeService.#hasExplicitSocketConsumption(target?.activity, binding.resourceKey)) {
      return;
    }

    const cost = (await target.resolveCost({
      config,
      delta: { item: item.id, keyPath: "system.uses.spent" },
      rolls: updates.rolls
    })).total;
    const spec = {
      mode: "any",
      resourceKey: binding.resourceKey,
      scope: binding.scope
    };

    return SocketConsumptionService.consumeFormulaCharge(
      { activity: target.activity, item },
      config,
      updates,
      { spec, cost }
    );
  }

  static #hasExplicitSocketConsumption(activity, resourceKey) {
    const targets = activity?.consumption?.targets;
    for (const target of targets ? Array.from(targets) : []) {
      if (target?.type !== CONSUMPTION_TYPE_CHARGE) continue;
      const spec = parseSocketTarget(target.target);
      if (!spec?.resourceKey) return true;
      if (GemResourceService.normalizeResourceLookupKey(spec.resourceKey) === resourceKey) return true;
    }
    return false;
  }

}
