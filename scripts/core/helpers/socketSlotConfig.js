function normalizeText(value) {
  return typeof value === "string" ? value : "";
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

export function normalizeSlotConfig(config = {}) {
  return {
    name: normalizeText(config?.name),
    condition: normalizeText(config?.condition),
    description: normalizeText(config?.description),
    color: normalizeSlotColor(config?.color)
  };
}

export function getSlotConfig(slot) {
  return normalizeSlotConfig(slot?.slotConfig);
}

export function hasSlotConfigDescription(slot) {
  return String(getSlotConfig(slot).description ?? "").trim().length > 0;
}
