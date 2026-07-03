import { Constants } from "../Constants.js";

/**
 * Custom dnd5e consumption type keys registered by this module. The type key and the
 * target string are the only data stored in the native consumption schema (both plain
 * StringFields); everything else (gem resources) lives in module flags on the gems.
 */
export const CONSUMPTION_TYPE_CHARGE = "scSocketsCharge";
export const CONSUMPTION_TYPE_GEM = "scSocketsGem";

export const SOCKET_CONSUMPTION_SELECTOR_MODES = Object.freeze({
  SOURCE_SLOT: "sourceSlot",
  ANY: "any",
  ANY_GEM: "anyGem",
  GEM_NAME: "gemName",
  GEM_NAME_MATCH: "gemNameMatch",
  SLOT: "slot"
});

/**
 * Grammar for the consumption target string:
 * - "sourceSlot"             consume from the gem that originated this activity.
 * - "any:<resourceKey>"      consume from any socketed gem providing the resource.
 * - "anyGem"                 consume from any socketed gem, in slot order.
 * - "slot:<index>"           consume from the gem in a specific slot (resource implied).
 * - "gemName:<name>"         consume from socketed gems with exactly this name.
 * - "gemNameMatch:<pattern>" consume from socketed gems whose name matches the pattern.
 * Only "any" needs an explicit resource key because each gem provides a single resource.
 * @param {string} target
 * @returns {{mode: string, resourceKey?: string, slotIndex?: number, gemName?: string, gemNamePattern?: string}|null}
 */
export function parseSocketTarget(target) {
  const raw = String(target ?? "").trim();
  if (!raw.length) {
    return null;
  }

  if (raw === SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT) {
    return { mode: SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT };
  }

  if (raw === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM) {
    return { mode: SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM };
  }

  const separator = raw.indexOf(":");
  const mode = separator === -1 ? raw : raw.slice(0, separator);
  const value = separator === -1 ? "" : raw.slice(separator + 1).trim();

  if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.ANY) {
    return value.length ? { mode, resourceKey: value } : null;
  }

  if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT) {
    const slotIndex = Number(value);
    return Number.isInteger(slotIndex) && slotIndex >= 0 ? { mode, slotIndex } : null;
  }

  if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME) {
    return value.length ? { mode, gemName: value } : null;
  }

  if (mode === SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH) {
    return value.length ? { mode, gemNamePattern: value } : null;
  }

  return null;
}

export function formatSocketTarget({ mode, resourceKey, slotIndex, gemName, gemNamePattern } = {}) {
  switch (mode) {
    case SOCKET_CONSUMPTION_SELECTOR_MODES.SOURCE_SLOT:
    case SOCKET_CONSUMPTION_SELECTOR_MODES.ANY_GEM:
      return mode;
    case SOCKET_CONSUMPTION_SELECTOR_MODES.ANY:
      return `${mode}:${String(resourceKey ?? "").trim()}`;
    case SOCKET_CONSUMPTION_SELECTOR_MODES.SLOT:
      return `${mode}:${Number(slotIndex)}`;
    case SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME:
      return `${mode}:${String(gemName ?? "").trim()}`;
    case SOCKET_CONSUMPTION_SELECTOR_MODES.GEM_NAME_MATCH:
      return `${mode}:${String(gemNamePattern ?? "").trim()}`;
    default:
      return "";
  }
}

/**
 * Matches a gem name against a user-supplied pattern, case-insensitively.
 * "*" is a wildcard for any sequence; a pattern with wildcards must match the whole
 * name. Without wildcards the pattern matches as a substring ("Fire" matches
 * "Greater Fire Gem").
 * @param {string} pattern
 * @param {string} name
 * @returns {boolean}
 */
export function matchesGemNamePattern(pattern, name) {
  const wanted = String(pattern ?? "").trim().toLowerCase();
  const candidate = String(name ?? "").trim().toLowerCase();
  if (!wanted.length || !candidate.length) {
    return false;
  }

  if (!wanted.includes("*")) {
    return candidate.includes(wanted);
  }

  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === "*" ? ".*" : `\\${char}`));
  return new RegExp(`^${escaped}$`).test(candidate);
}

export function getActivitySourceSlotIndex(activity) {
  const sourceGem = activity?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_SOURCE_GEM];
  const slot = Number(sourceGem?.slot);
  return Number.isInteger(slot) && slot >= 0 ? slot : null;
}
