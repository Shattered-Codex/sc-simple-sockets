import { Constants } from "../Constants.js";
import { GemCheckService } from "../services/GemCheckService.js";

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

/** Per-slot DC override for the gem insertion check, in the same format. */
export function normalizeSlotInsertionCheckDc(value) {
  return normalizeSlotRemovalCheckDc(value);
}

/**
 * Per-slot override of which check is rolled, as a compact check id ("flat",
 * "tool:jeweler") or "none" for no check. Blank inherits the global check.
 */
export function normalizeSlotCheckType(value) {
  const raw = String(value ?? "").trim();
  if (!raw.length) {
    return "";
  }
  // "none" exempts the slot from the check altogether.
  if ([GemCheckService.TYPE_FLAT, GemCheckService.TYPE_NONE].includes(raw.toLowerCase())) {
    return raw.toLowerCase();
  }
  const check = GemCheckService.parseCheckId(raw);
  return check.type === GemCheckService.TYPE_FLAT ? "" : GemCheckService.formatCheckId(check);
}

/** Per-slot insertion failure outcome override. Blank inherits the global outcome. */
export function normalizeSlotInsertionCheckFailure(value) {
  return Constants.normalizeInsertionFailureOutcome(value);
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

  // The check overrides are stored only when set, so slots that do not
  // use them keep exactly the data they had before the feature existed.
  const removalCheckDc = normalizeSlotRemovalCheckDc(config?.removalCheckDc);
  if (removalCheckDc.length) {
    normalized.removalCheckDc = removalCheckDc;
  }
  const removalCheckFailure = normalizeSlotRemovalCheckFailure(config?.removalCheckFailure);
  if (removalCheckFailure.length) {
    normalized.removalCheckFailure = removalCheckFailure;
  }

  const insertionCheckDc = normalizeSlotInsertionCheckDc(config?.insertionCheckDc);
  if (insertionCheckDc.length) {
    normalized.insertionCheckDc = insertionCheckDc;
  }
  const insertionCheckFailure = normalizeSlotInsertionCheckFailure(config?.insertionCheckFailure);
  if (insertionCheckFailure.length) {
    normalized.insertionCheckFailure = insertionCheckFailure;
  }
  for (const key of ["insertionCheckType", "removalCheckType"]) {
    const type = normalizeSlotCheckType(config?.[key]);
    if (type.length) {
      normalized[key] = type;
    }
  }
  // A slot's own DC is its number or formula above, or a table by gem rarity.
  for (const prefix of ["insertionCheck", "removalCheck"]) {
    if (config?.[`${prefix}DcMode`] === GemCheckService.DC_MODE_RARITY) {
      normalized[`${prefix}DcMode`] = GemCheckService.DC_MODE_RARITY;
      normalized[`${prefix}RarityDcs`] = GemCheckService.normalizeRarityDcs(config?.[`${prefix}RarityDcs`]);
    }
  }

  return normalized;
}

export function getSlotInsertionCheckDc(slot) {
  return getSlotConfig(slot).insertionCheckDc ?? "";
}

/** The slot's DC table by gem rarity for a check ("insertion" or "removal"), or null. */
export function getSlotCheckRarityDcs(slot, check) {
  const config = getSlotConfig(slot);
  return config[`${check}CheckDcMode`] === GemCheckService.DC_MODE_RARITY
    ? config[`${check}CheckRarityDcs`]
    : null;
}

export function getSlotInsertionCheckType(slot) {
  return getSlotConfig(slot).insertionCheckType ?? "";
}

export function getSlotRemovalCheckType(slot) {
  return getSlotConfig(slot).removalCheckType ?? "";
}

export function getSlotInsertionCheckFailure(slot) {
  return getSlotConfig(slot).insertionCheckFailure ?? "";
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
