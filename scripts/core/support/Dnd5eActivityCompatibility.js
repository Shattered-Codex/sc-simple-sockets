/**
 * Normalizes activity payload differences between dnd5e 5.x and 6.x.
 */
export class Dnd5eActivityCompatibility {
  /**
   * Repoints an activity effect reference after the effect has been copied to
   * the socket host. dnd5e 5.x resolves the embedded `_id`; dnd5e 6.x prefers
   * the absolute `uuid` when it is present.
   */
  static remapEffectReference(effectReference, effectIdMap, sourceItem) {
    if (!effectReference || typeof effectReference !== "object" || !effectIdMap?.size) {
      return effectReference;
    }

    const sourceId = this.getLocalEffectId(effectReference, sourceItem);
    const createdId = effectIdMap.get(sourceId);
    if (!createdId) {
      return effectReference;
    }

    const remapped = foundry.utils.deepClone(effectReference);
    remapped._id = createdId;
    // The copied effect is embedded locally. Avoid an absolute UUID so the
    // host can be duplicated or moved to another actor without stale links.
    delete remapped.uuid;
    return remapped;
  }

  /** Resolves only references to effects embedded in the source item. */
  static getLocalEffectId(effectReference, sourceItem) {
    const uuid = String(effectReference?.uuid ?? "").trim();
    if (!uuid) {
      return String(effectReference?._id ?? "").trim();
    }

    // UUID references use a synthetic profile _id in dnd5e 6. The full item
    // UUID must match: another item can contain an effect with the same ID.
    if (!sourceItem?.uuid) return "";
    const prefix = `${sourceItem.uuid}.ActiveEffect.`;
    if (!uuid.startsWith(prefix)) return "";
    const id = uuid.slice(prefix.length);
    return id && !id.includes(".") ? id : "";
  }
}
