import { Constants } from "../../core/Constants.js";
import { GemCriteria } from "./GemCriteria.js";
import { GemActivityStore } from "./GemActivityStore.js";
import { GemEffectStore } from "./GemEffectStore.js";

export class GemLifecycleService {
  constructor({
    activityStore = GemActivityStore,
    effectStore = GemEffectStore
  } = {}) {
    this.activityStore = activityStore;
    this.effectStore = effectStore;
  }

  /**
   * Snapshot owners may set options[MODULE_ID].skipGemLifecycle to replace activities
   * and effects themselves. preUpdate still synchronizes the item's gem identity.
   */
  async handleItemUpdated(item, changes, options = {}) {
    if (
      options?.[Constants.MODULE_ID]?.skipGemLifecycle === true
      || !GemCriteria.hasTypeUpdate(changes)
    ) {
      return;
    }

    const transition = options?.[Constants.MODULE_ID]?.gemTransition ?? null;
    const isGem = GemCriteria.matches(item);
    const wasGem = transition?.wasGem ?? !isGem;

    if (wasGem === isGem) {
      return;
    }

    if (!isGem) {
      await this.activityStore.stash(item);
      await this.activityStore.removeAll(item);
      await this.effectStore.stash(item);
      await this.effectStore.removeAll(item);
      return;
    }

    await this.effectStore.restore(item);
    await this.activityStore.restore(item);
  }

  handlePreUpdate(item, changes, options = {}) {
    if (!GemCriteria.hasTypeUpdate(changes)) {
      return;
    }

    const previous = item?.toObject?.() ?? item;
    const expanded = foundry.utils.expandObject(changes);
    const next = foundry.utils.mergeObject(previous, expanded, {
      inplace: false,
      recursive: options.recursive !== false
    });
    const gemSubtypePath = `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_SUBTYPE}`;
    const replacesContents = options?.[Constants.MODULE_ID]?.skipGemLifecycle === true;
    const typeChanged = ["type", "system.type.value", "system.type.subtype"].some(
      (path) => foundry.utils.getProperty(previous, path) !== foundry.utils.getProperty(next, path)
    );
    // Snapshot owners supply identity explicitly; legacy snapshots derive it from their type.
    let nextSubtype = GemCriteria.resolveGemSubtypeFromType(next);
    if (replacesContents && foundry.utils.hasProperty(expanded, gemSubtypePath)) {
      nextSubtype ??= foundry.utils.getProperty(expanded, gemSubtypePath);
    } else if (!replacesContents && !typeChanged) {
      nextSubtype = GemCriteria.resolveGemSubtype(next);
    }

    // A non-recursive update replaces the entire flags object, including this added flag.
    if (options.recursive === false) {
      changes.flags = foundry.utils.deepClone(next.flags ?? {});
    }
    foundry.utils.setProperty(changes, gemSubtypePath, nextSubtype);
    foundry.utils.setProperty(next, gemSubtypePath, nextSubtype);

    options[Constants.MODULE_ID] ??= {};
    options[Constants.MODULE_ID].gemTransition = {
      wasGem: GemCriteria.matches(previous),
      willBeGem: GemCriteria.matches(next)
    };
  }

  handlePreCreate(item, data) {
    const subtype = GemCriteria.resolveGemSubtypeFromType(data ?? item);
    if (subtype) {
      const path = `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_SUBTYPE}`;
      item.updateSource({ [path]: subtype });
      if (data && typeof data === "object") {
        foundry.utils.setProperty(data, path, subtype);
      }
    }

    const reference = data ?? item;
    if (!GemCriteria.matches(reference)) {
      return;
    }

    const incoming = this.#normalizeEffects(data?.effects);
    if (!incoming.length) {
      return;
    }

    item.updateSource({ effects: incoming });
  }

  #normalizeEffects(effects) {
    if (!Array.isArray(effects) || !effects.length) {
      return [];
    }

    return effects.map((effect) => {
      const data = foundry.utils.deepClone(effect);
      data.transfer = false;
      data.disabled = true;
      return data;
    });
  }
}
