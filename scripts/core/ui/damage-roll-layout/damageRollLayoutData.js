import { Constants } from "../../Constants.js";
import { GemDamageService } from "../../../domain/gems/GemDamageService.js";

export function collectRollEntries(rolls, rows) {
  if (!Array.isArray(rolls) || !Array.isArray(rows) || rolls.length !== rows.length) {
    return null;
  }

  const base = [];
  const gems = [];

  rolls.forEach((roll, idx) => {
    const row = rows[idx];
    const metadata = getGemMetadata(roll);

    if (!metadata.length) {
      base.push({
        idx,
        row,
        roll,
        type: getRollType(roll)
      });
      return;
    }

    metadata.forEach((meta, metaIdx) => {
      gems.push({
        idx,
        metaIdx,
        row: metaIdx === 0 ? row : row.cloneNode(true),
        roll,
        meta,
        type: getRollType(roll)
      });
    });
  });

  return {
    base,
    gems,
    all: [...base, ...gems]
  };
}

export function getGemMetadata(roll) {
  const meta = roll?.options?.[Constants.MODULE_ID]?.[GemDamageService.META_KEY];
  return Array.isArray(meta) ? meta : [];
}

export function getRollType(roll) {
  return roll?.options?.type ?? roll?.options?.types?.[0] ?? "unknown";
}

export function buildGemInstanceKey(meta, { idx = 0, metaIdx = 0 } = {}) {
  const uuid = String(meta?.gemUuid ?? "").trim();
  const slot = String(meta?.slot ?? "").trim();
  const img = String(meta?.gemImg ?? "").trim();
  const name = String(meta?.gemName ?? "").trim();

  if (uuid || slot) {
    return `${uuid}:${slot}`;
  }

  return `${img}:${name}:${idx}:${metaIdx}`;
}

export function buildGemTypeKey(meta) {
  const img = String(meta?.gemImg ?? "").trim();
  const name = String(meta?.gemName ?? "").trim();
  return `${img}:${name}`;
}
