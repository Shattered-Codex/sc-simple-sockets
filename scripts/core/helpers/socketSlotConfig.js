import { Constants } from "../Constants.js";

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === "true" || value === "1" || value === "on";
}

export function normalizeSlotColor(value) {
  const raw = String(value ?? "").trim();
  if (!raw.length) {
    return "";
  }

  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized)) {
    return "";
  }

  if (normalized.length === 3) {
    return `#${normalized.split("").map((char) => `${char}${char}`).join("").toUpperCase()}`;
  }

  return `#${normalized.toUpperCase()}`;
}

/**
 * Sanitizes the artwork configured for an empty socket. Anything that is not a
 * usable image reference falls back to "" so the module default is used.
 */
export function normalizeSlotFrameImg(value) {
  const raw = String(value ?? "").trim();
  if (!raw.length || /^(javascript|vbscript):/i.test(raw)) {
    return "";
  }
  return raw;
}

/**
 * Per-slot DC override for the gem removal check: a number or a deterministic
 * formula. Blank inherits the global DC.
 */
export function normalizeSlotRemovalCheckDc(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return typeof value === "string" ? value.trim() : "";
}

/** Per-slot failure outcome override. Blank inherits the global outcome. */
export function normalizeSlotRemovalCheckFailure(value) {
  return Constants.normalizeRemovalFailureOutcome(value);
}

export function normalizeSlotConfig(config = {}) {
  const normalized = {
    name: normalizeText(config?.name),
    condition: normalizeText(config?.condition),
    description: normalizeText(config?.description),
    color: normalizeSlotColor(config?.color),
    frameImg: normalizeSlotFrameImg(config?.frameImg),
    hidden: normalizeBoolean(config?.hidden),
    deleteGemOnRemoval: normalizeBoolean(config?.deleteGemOnRemoval)
  };

  // The removal check overrides are stored only when set, so slots that do not
  // use them keep exactly the data they had before the feature existed.
  const removalCheckDc = normalizeSlotRemovalCheckDc(config?.removalCheckDc);
  if (removalCheckDc.length) {
    normalized.removalCheckDc = removalCheckDc;
  }
  const removalCheckFailure = normalizeSlotRemovalCheckFailure(config?.removalCheckFailure);
  if (removalCheckFailure.length) {
    normalized.removalCheckFailure = removalCheckFailure;
  }

  return normalized;
}

export function getSlotRemovalCheckDc(slot) {
  return getSlotConfig(slot).removalCheckDc ?? "";
}

export function getSlotRemovalCheckFailure(slot) {
  return getSlotConfig(slot).removalCheckFailure ?? "";
}

export function getSlotConfig(slot) {
  return normalizeSlotConfig(slot?.slotConfig);
}

/**
 * Artwork shown while the slot is empty: the per-slot image when configured,
 * otherwise the module default socket frame.
 */
export function resolveSlotFrameImg(slot) {
  return getSlotConfig(slot).frameImg || Constants.SOCKET_SLOT_IMG;
}

export function hasCustomSlotFrameImg(slot) {
  return Boolean(getSlotConfig(slot).frameImg);
}

export function isSlotHidden(slot) {
  return getSlotConfig(slot).hidden;
}

export function canUserSeeSlot(slot, user = globalThis.game?.user) {
  return !isSlotHidden(slot) || Boolean(user?.isGM);
}

export function hasSlotConfigDescription(slot) {
  return String(getSlotConfig(slot).description ?? "").trim().length > 0;
}
