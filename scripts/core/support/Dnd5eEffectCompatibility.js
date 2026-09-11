/**
 * Normalizes Active Effect changes and dnd5e attribution operations.
 *
 * Foundry v14 changes use `type`, even with dnd5e 5.3. Attribution consumers
 * in dnd5e 5.3 still expect `mode`; dnd5e 6 expects `type`.
 */
export class Dnd5eEffectCompatibility {
  static isAdditiveChange(change) {
    if (typeof change?.type === "string") return change.type === "add";

    return change?.mode === 2;
  }

  /**
   * Returns the additive operation shape consumed by the installed dnd5e.
   *
   * @returns {object} A `type` (dnd5e 6.x) or `mode` (dnd5e 5.x) property.
   */
  static getAttributionOperation() {
    const systemMajor = Number.parseInt(globalThis.game?.system?.version ?? "", 10);
    return systemMajor >= 6 ? { type: "add" } : { mode: 2 };
  }
}
