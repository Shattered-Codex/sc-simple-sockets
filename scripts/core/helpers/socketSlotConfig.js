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

export function normalizeSlotConfig(config = {}) {
  return {
    name: normalizeText(config?.name),
    condition: normalizeText(config?.condition),
    description: normalizeText(config?.description),
    color: normalizeSlotColor(config?.color),
    frameImg: normalizeSlotFrameImg(config?.frameImg),
    hidden: normalizeBoolean(config?.hidden),
    deleteGemOnRemoval: normalizeBoolean(config?.deleteGemOnRemoval)
  };
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
