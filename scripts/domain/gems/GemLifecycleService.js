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

  async handleItemUpdated(item, changes, options = {}) {
    if (!GemCriteria.hasTypeUpdate(changes)) {
      return;
    }

    const transition = options?.[Constants.MODULE_ID]?.gemTransition ?? null;
    const isGem = GemCriteria.matches(item);
    const wasGem = transition?.wasGem ?? !isGem;

    if (!wasGem && !isGem) {
      return;
    }

    if (!isGem) {
      await this.activityStore.stash(item);
      await this.activityStore.removeAll(item);
      await this.effectStore.stash(item);
      await this.effectStore.removeAll(item);
      return;
    }

    await this.activityStore.restore(item);
    await this.effectStore.restore(item);
  }

  async syncGemSubtypeFlags() {
    if (!game.user?.isGM) {
      return;
    }

    const items = [
      ...(game.items ?? []),
      ...Array.from(game.actors ?? []).flatMap((actor) => Array.from(actor?.items ?? []))
    ];

    for (const item of items) {
      if (item?.documentName !== "Item") {
        continue;
      }

      const nextSubtype = GemCriteria.resolveGemSubtypeFromType(item);
      const currentSubtype = item.getFlag(Constants.MODULE_ID, Constants.FLAG_GEM_SUBTYPE);

      if (nextSubtype) {
        if (currentSubtype !== nextSubtype) {
          await item.setFlag(Constants.MODULE_ID, Constants.FLAG_GEM_SUBTYPE, nextSubtype);
        }
        continue;
      }

      if (typeof currentSubtype !== "undefined") {
        await item.unsetFlag(Constants.MODULE_ID, Constants.FLAG_GEM_SUBTYPE);
      }
    }
  }

  handlePreUpdate(item, changes, options = {}) {
    if (!GemCriteria.hasTypeUpdate(changes)) {
      return;
    }

    const previous = item?.toObject?.() ?? item;
    const next = foundry.utils.mergeObject(previous, changes, { inplace: false });
    const nextSubtype = GemCriteria.resolveGemSubtypeFromType(next);
    const gemSubtypePath = `flags.${Constants.MODULE_ID}.${Constants.FLAG_GEM_SUBTYPE}`;
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
