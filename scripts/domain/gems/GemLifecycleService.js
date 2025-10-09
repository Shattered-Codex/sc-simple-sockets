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

  async handleItemUpdated(item, changes) {
    if (!GemCriteria.hasTypeUpdate(changes)) {
      return;
    }

    if (!GemCriteria.matches(item)) {
      await this.activityStore.stash(item);
      await this.activityStore.removeAll(item);
      await this.effectStore.stash(item);
      await this.effectStore.removeAll(item);
      return;
    }

    await this.activityStore.restore(item);
    await this.effectStore.restore(item);
  }

  handlePreCreate(item, data) {
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
