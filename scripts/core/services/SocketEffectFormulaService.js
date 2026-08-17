import { Constants } from "../Constants.js";
import { SocketRollDataService } from "./SocketRollDataService.js";

const EMPTY_COUNTS = Object.freeze({ total: 0, gems: 0, empty: 0 });

/**
 * Resolves `@sc.sockets.*` inside Active Effect change values.
 *
 * Effect changes are resolved against *actor* roll data, which has no notion of
 * "the item that granted this effect". A transferred effect is never copied to
 * the actor though — `Actor#allApplicableEffects` yields the item's own effect —
 * so the owning item is reachable through `effect.parent` while the change is
 * being applied. This service rewrites the socket paths into literal numbers
 * there, before the change reaches the system:
 * - `@sc.sockets.total|gems|empty` — sockets on the item that grants the effect
 * - `@sc.sockets.item.total|gems|empty` — explicit spelling of the same scope
 * - `@sc.sockets.actor.total|gems|empty` — the same counts across the actor
 *
 * Rewriting the value instead of extending the replacement data keeps Foundry
 * v13 and v14 identical: v13 does not resolve `@` paths in effect changes at
 * all, and v14 only resolves them against actor roll data.
 *
 * dnd5e's attribution tooltips re-evaluate the stored change value on their own,
 * outside this path, so they are corrected separately in `correctAttributions`.
 */
export class SocketEffectFormulaService {
  /**
   * `@sc.sockets[.actor|.item].total|gems|empty`. The scope segment is optional
   * and defaults to the item carrying the effect. A trailing word character or
   * dot rejects the match: a longer path such as `@sc.sockets.gems.max` is not
   * something this module publishes, and half-substituting it into `2.max` would
   * turn a typo into a silently wrong number.
   */
  static TOKEN_PATTERN = /@sc\.sockets(?:\.(actor|item))?\.(total|gems|empty)(?![\w.])/gi;

  static #HAS_TOKEN = /@sc\.sockets\b/i;

  static #activated = false;

  static #attributionsActivated = false;

  static activate() {
    if (game?.system?.id !== "dnd5e") {
      return;
    }

    SocketEffectFormulaService.#activateChanges();
    SocketEffectFormulaService.#activateAttributions();
  }

  static #activateChanges() {
    if (SocketEffectFormulaService.#activated) {
      return;
    }

    // v14 routes every change through the static `applyChange`; v13 has no such
    // entry point and calls `apply` on the effect itself.
    const modern = (game?.release?.generation ?? 0) > 13;
    const EffectClass = globalThis.CONFIG?.ActiveEffect?.documentClass;
    const owner = modern ? EffectClass : EffectClass?.prototype;
    const method = modern ? "applyChange" : "apply";
    const original = owner?.[method];
    if (typeof original !== "function") {
      console.warn(
        `[${Constants.MODULE_ID}] ActiveEffect.${method} was not found; socket formulas in effects are unavailable.`
      );
      return;
    }

    const wrapper = modern
      ? function (wrapped, model, change, ...rest) {
        return wrapped.call(this, model, SocketEffectFormulaService.#rewrite(change?.effect, model, change), ...rest);
      }
      : function (wrapped, doc, change, ...rest) {
        return wrapped.call(this, doc, SocketEffectFormulaService.#rewrite(this, doc, change), ...rest);
      };

    const target = `CONFIG.ActiveEffect.documentClass.${modern ? "" : "prototype."}${method}`;
    let registered = false;
    if (globalThis.libWrapper?.register) {
      try {
        libWrapper.register(Constants.MODULE_ID, target, wrapper, "WRAPPER");
        registered = true;
      } catch (error) {
        console.warn(`[${Constants.MODULE_ID}] libWrapper could not wrap ${target}; patching directly.`, error);
      }
    }

    if (!registered) {
      owner[method] = function (...args) {
        return wrapper.call(this, original, ...args);
      };
    }

    SocketEffectFormulaService.#activated = true;
  }

  /**
   * dnd5e builds its attribution tooltips (actor AC among them) by re-evaluating
   * the raw change values against actor roll data, which cannot know the item
   * scope: an item-scoped count would be reported as the actor total there while
   * the applied bonus is correct. This keeps the breakdown honest.
   */
  static #activateAttributions() {
    if (SocketEffectFormulaService.#attributionsActivated) {
      return;
    }

    const ActorClass = globalThis.dnd5e?.documents?.Actor5e ?? globalThis.CONFIG?.Actor?.documentClass;
    const original = ActorClass?.prototype?._prepareActiveEffectAttributions;
    if (typeof original !== "function") {
      return;
    }

    const correct = function (wrapped, target, ...rest) {
      const attributions = wrapped.call(this, target, ...rest);
      try {
        return SocketEffectFormulaService.correctAttributions(this, target, attributions);
      } catch (error) {
        // A tooltip is never worth breaking over.
        console.warn(`[${Constants.MODULE_ID}] Socket attribution values could not be corrected.`, error);
        return attributions;
      }
    };

    const target = "dnd5e.documents.Actor5e.prototype._prepareActiveEffectAttributions";
    let registered = false;
    if (globalThis.libWrapper?.register && globalThis.dnd5e?.documents?.Actor5e) {
      try {
        libWrapper.register(Constants.MODULE_ID, target, correct, "WRAPPER");
        registered = true;
      } catch (error) {
        console.warn(`[${Constants.MODULE_ID}] libWrapper could not wrap ${target}; patching directly.`, error);
      }
    }

    if (!registered) {
      ActorClass.prototype._prepareActiveEffectAttributions = function (...args) {
        return correct.call(this, original, ...args);
      };
    }

    SocketEffectFormulaService.#attributionsActivated = true;
  }

  /**
   * Replaces the actor-scope evaluation dnd5e performed with the item-scope one
   * for every change this module resolves, leaving the rest of the attribution
   * untouched.
   *
   * The walk is driven by the actor's effects rather than by the attributions
   * dnd5e returned, because dnd5e drops an attribution whose evaluation came out
   * as zero. A value such as `max(0, 2 - @sc.sockets.empty * 2)` collapses to
   * zero against the actor totals while applying a real bonus in the item scope,
   * so those attributions have to be added back here — and an attribution that
   * corrects down to zero has to be dropped, to match how dnd5e builds the list.
   * @param {Actor} actor           Actor the tooltip belongs to.
   * @param {string} target         Data path being attributed.
   * @param {object[]} attributions Attributions dnd5e produced.
   * @returns {object[]} The corrected attributions.
   */
  static correctAttributions(actor, target, attributions) {
    const addMode = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
    const shims = globalThis.CONFIG?.ActiveEffect?.documentClass?.SHIM_FIELDS ?? {};
    const corrected = Array.isArray(attributions) ? [...attributions] : [];
    const byEffect = new Map();
    for (const attribution of corrected) {
      if (attribution?.document) byEffect.set(attribution.document, attribution);
    }

    let rollData = null;
    for (const effect of actor?.allApplicableEffects?.() ?? []) {
      let delta = 0;
      for (const change of effect?.changes ?? []) {
        if ((shims[change.key]?.key ?? change.key) !== target || change.mode !== addMode) continue;
        const resolved = SocketEffectFormulaService.resolveChangeValue(effect, actor, change.value);
        if (resolved === change.value) continue;
        rollData ??= actor.getRollData({ deterministic: true });
        delta += SocketEffectFormulaService.#simplifyBonus(resolved, rollData)
          - SocketEffectFormulaService.#simplifyBonus(change.value, rollData);
      }
      if (!delta) continue;

      const attribution = byEffect.get(effect);
      if (attribution) {
        attribution.value += delta;
        if (!attribution.value) corrected.splice(corrected.indexOf(attribution), 1);
        continue;
      }

      // Absent from the list: dnd5e evaluated the whole effect as zero for this
      // target, so the corrected contribution is the delta itself.
      const label = SocketEffectFormulaService.#attributionLabel(effect, actor);
      if (label) corrected.push({ value: delta, label, document: effect, mode: addMode });
    }

    return corrected;
  }

  /**
   * Mirrors how dnd5e labels an attribution and which effects it skips, so an
   * attribution added here is one dnd5e would have shown itself.
   */
  static #attributionLabel(effect, actor) {
    if (effect.disabled || effect.isSuppressed) return null;
    const label = (!effect.origin || effect.origin === actor?.uuid) ? effect.name : effect.sourceName;
    return label || null;
  }

  static #simplifyBonus(value, rollData) {
    const simplify = globalThis.dnd5e?.utils?.simplifyBonus;
    if (typeof simplify === "function") return Number(simplify(value, rollData)) || 0;
    return Number(value) || 0;
  }

  /**
   * @param {ActiveEffect} effect Effect the change belongs to.
   * @param {Document} target     Document the change is being applied to.
   * @param {object} change       Change being applied.
   * @returns {object} The change, or a copy of it with the socket paths resolved.
   */
  static #rewrite(effect, target, change) {
    const value = SocketEffectFormulaService.resolveChangeValue(effect, target, change?.value);
    if (value === change?.value) return change;
    return { ...change, value };
  }

  /**
   * @param {ActiveEffect} effect Effect the change belongs to.
   * @param {Document} target     Document the change is being applied to.
   * @param {*} value             Raw change value.
   * @returns {*} The value with every socket path replaced by its count.
   */
  static resolveChangeValue(effect, target, value) {
    if (typeof value !== "string" || !SocketEffectFormulaService.#HAS_TOKEN.test(value)) {
      return value;
    }

    const item = SocketEffectFormulaService.#resolveItem(effect);
    let itemCounts = null;
    let actorCounts = null;

    const substituted = value.replace(SocketEffectFormulaService.TOKEN_PATTERN, (match, scope, key) => {
      const counts = scope?.toLowerCase() === "actor"
        ? (actorCounts ??= SocketEffectFormulaService.#actorCounts(effect, target, item))
        : (itemCounts ??= item ? SocketRollDataService.countItem(item) : EMPTY_COUNTS);
      return String(counts[key.toLowerCase()] ?? 0);
    });

    if (substituted === value) return value;
    return SocketEffectFormulaService.#simplify(substituted);
  }

  static #actorCounts(effect, target, item) {
    const actor = SocketEffectFormulaService.#resolveActor(effect, target, item);
    if (actor) return SocketRollDataService.countActor(actor);
    // An unowned item is its own actor scope, matching the item roll data.
    return item ? SocketRollDataService.countItem(item) : EMPTY_COUNTS;
  }

  /**
   * The item scope is the item that grants the effect, so an effect sitting
   * directly on the actor has no item scope and counts zero sockets.
   */
  static #resolveItem(effect) {
    if (effect?.parent?.documentName === "Item") return effect.parent;

    // Effects copied onto an actor instead of transferred still point back at
    // the item that granted them, and those are the sockets that matter.
    const origin = effect?.origin;
    if (!origin) return null;
    try {
      const document = globalThis.fromUuidSync?.(origin);
      return document?.documentName === "Item" ? document : null;
    } catch {
      return null;
    }
  }

  static #resolveActor(effect, target, item) {
    if (target?.documentName === "Actor") return target;
    const parent = effect?.parent;
    if (parent?.documentName === "Actor") return parent;
    return target?.actor ?? item?.actor ?? parent?.actor ?? null;
  }

  /**
   * Foundry v13 casts an effect delta with `Number()`, so `"2 * 3"` would become
   * NaN there while v14 evaluates it as a roll. Collapsing a fully resolved
   * expression to a literal keeps both generations identical. Anything still
   * carrying an unresolved `@` path or a die is left for the system to evaluate.
   */
  static #simplify(formula) {
    if (formula.includes("@")) return formula;

    const RollClass = globalThis.foundry?.dice?.Roll ?? globalThis.Roll;
    if (typeof RollClass !== "function") return formula;

    try {
      const roll = new RollClass(formula);
      if (!roll.isDeterministic) return formula;
      const total = roll.evaluateSync().total;
      return Number.isFinite(total) ? String(total) : formula;
    } catch {
      return formula;
    }
  }
}
