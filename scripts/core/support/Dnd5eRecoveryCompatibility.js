/**
 * Normalizes the recovery triggers exposed by supported dnd5e releases.
 *
 * dnd5e 5.3 provides a list of triggered periods and always recovers daily
 * uses during a rest. dnd5e 6 instead uses a period-to-occurrence-count map
 * and delegates daily recovery to its calendar unless manual recovery is
 * enabled. Keeping that distinction here prevents recovery-version checks
 * from leaking into the gem recovery service.
 */
export class Dnd5eRecoveryCompatibility {
  static restPeriods(config = {}) {
    const restConfig = globalThis.CONFIG?.DND5E?.restTypes?.[config.type];
    const recovery = Array.from(restConfig?.recoverPeriods ?? []).map((period) => [period, 1]);

    if (config.recoverShortRestUses) {
      recovery.unshift(["sr", 1]);
    }
    if (config.recoverLongRestUses) {
      recovery.unshift(["lr", 1]);
    }
    if ((config.recoverDailyUses || config.newDay) && this.#usesManualDailyRecovery()) {
      const count = this.#dailyRestCount(config);
      recovery.unshift(["day", count], ["dawn", count], ["dusk", count]);
    }

    const periods = new Map(recovery);
    // In 5.3 gritty scaling also applies to daily periods supplied by custom
    // rest types, whether or not the rest explicitly starts a new day.
    if (!this.supportsCalendarRecovery() && this.#isGrittyRest()) {
      for (const period of ["day", "dawn", "dusk"]) {
        if (periods.has(period)) periods.set(period, 7);
      }
    }
    return periods;
  }

  static combatPeriods(periods) {
    return this.#periodCounts(periods);
  }

  static calendarPeriods(deltaTime, options) {
    if (!this.supportsCalendarRecovery() || this.#calendarManualRecovery() || Number(deltaTime) <= 0) {
      return new Map();
    }

    const deltas = options?.dnd5e?.deltas ?? {};
    const periods = new Map();
    for (const [deltaName, period] of globalThis.CONFIG?.DND5E?.calendarDeltasRecoveryMapping ?? []) {
      const count = Number(deltas[deltaName]);
      if (count > 0) {
        periods.set(period, count);
      }
    }
    return periods;
  }

  /** Limits guaranteed positive recovery rolls once they can fill the pool. */
  static async scaleRecoveryRoll(roll, count, max) {
    if (count <= 1) return;
    if (this.supportsCalendarRecovery()) {
      const minimum = Number((await roll.clone().evaluate({ minimize: true })).total);
      // Zero or signed formulas cannot safely use a positive lower bound.
      if (Number.isFinite(minimum) && minimum > 0) {
        count = Math.min(count, Math.max(1, Math.ceil(max / minimum)));
      }
    }
    roll.alter(count, 0, { multiplyNumeric: true });
  }

  static supportsCalendarRecovery() {
    return globalThis.CONFIG?.DND5E?.calendarDeltasRecoveryMapping instanceof Map;
  }

  static #periodCounts(periods) {
    if (periods instanceof Map) {
      return new Map(Array.from(periods, ([period, count]) => [period, Number(count) || 0]));
    }

    const counts = new Map();
    for (const period of periods ?? []) {
      counts.set(period, 1);
    }
    return counts;
  }

  static #usesManualDailyRecovery() {
    return !this.supportsCalendarRecovery() || this.#calendarManualRecovery();
  }

  static #dailyRestCount(config) {
    if (!this.#isGrittyRest()) {
      return 1;
    }

    // dnd5e 5.3 multiplied every daily rest recovery in gritty mode. dnd5e
    // 6 counts the seven days only for a gritty long rest.
    return this.supportsCalendarRecovery() && config.type !== "long" ? 1 : 7;
  }

  static #calendarManualRecovery() {
    const configuration = globalThis.dnd5e?.settings?.calendarConfig
      ?? this.#setting("calendarConfig");
    return configuration?.manualRecovery === true;
  }

  static #isGrittyRest() {
    return this.#setting("restVariant") === "gritty";
  }

  static #setting(key) {
    try {
      return globalThis.game?.settings?.get?.("dnd5e", key);
    } catch {
      return undefined;
    }
  }
}
