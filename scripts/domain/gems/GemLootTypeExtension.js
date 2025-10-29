import { Constants } from "../../core/Constants.js";
import { ModuleSettings } from "../../core/settings/ModuleSettings.js";

export class GemLootTypeExtension {
  static #ensured = false;
  static #setupHooked = false;
  static #registeredKeys = new Map();

  static ensure() {
    if (GemLootTypeExtension.#apply()) {
      GemLootTypeExtension.#ensured = true;
      return;
    }

    if (GemLootTypeExtension.#setupHooked) {
      return;
    }

    GemLootTypeExtension.#setupHooked = true;
    Hooks.once("ready", () => {
      GemLootTypeExtension.#setupHooked = false;
      GemLootTypeExtension.ensure();
    });
  }

  static getAvailableLootSubtypes() {
    if (!GemLootTypeExtension.#ensured) {
      GemLootTypeExtension.ensure();
    }

    const lootTypes = CONFIG?.DND5E?.lootTypes;
    if (!lootTypes) return [];

    const customEntries = ModuleSettings.getCustomLootSubtypes();
    const customMap = new Map(customEntries.map((entry) => [entry.key.toLowerCase(), entry]));

    return Object.entries(lootTypes)
      .map(([value, label]) => {
        const normalized = String(value ?? "").toLowerCase();
        const resolvedLabel = GemLootTypeExtension.#resolveLabel(label, value);
        const custom = customMap.get(normalized);
        return {
          value,
          label: custom?.label ?? resolvedLabel,
          isCustom: customMap.has(normalized)
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined));
  }

  static #apply() {
    const config = CONFIG?.DND5E;
    if (!config) {
      return false;
    }

    config.lootTypes ??= {};

    const desired = ModuleSettings.getCustomLootSubtypes();
    const desiredMap = new Map();
    for (const entry of desired) {
      const key = typeof entry?.key === "string" ? entry.key.trim() : "";
      if (!key.length) continue;
      const lower = key.toLowerCase();
      const label = (typeof entry?.label === "string" && entry.label.trim().length)
        ? entry.label.trim()
        : GemLootTypeExtension.#formatLabelFromKey(key);
      desiredMap.set(lower, { key, label });
    }

    for (const [lower, storedKey] of Array.from(GemLootTypeExtension.#registeredKeys.entries())) {
      if (!desiredMap.has(lower)) {
        delete config.lootTypes[storedKey];
        GemLootTypeExtension.#registeredKeys.delete(lower);
      }
    }

    for (const { key, label } of desiredMap.values()) {
      config.lootTypes[key] = {
        ...(typeof config.lootTypes[key] === "object" ? config.lootTypes[key] : {}),
        label
      };
      GemLootTypeExtension.#registeredKeys.set(key.toLowerCase(), key);
    }

    return true;
  }

  static #resolveLabel(source, fallback) {
    if (typeof source === "string") {
      const localized = game?.i18n?.localize?.(source);
      if (localized && localized !== source) {
        return localized;
      }
      return source;
    }
    if (source && typeof source === "object") {
      const ref = source.label ?? source.name ?? fallback;
      return GemLootTypeExtension.#resolveLabel(ref, fallback);
    }
    if (fallback) {
      return String(fallback);
    }
    return "";
  }

  static #formatLabelFromKey(key) {
    if (!key) return "Custom";
    const formatted = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!formatted.length) return "Custom";
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
}
