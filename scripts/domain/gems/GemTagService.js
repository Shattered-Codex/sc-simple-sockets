import { Constants } from "../../core/Constants.js";

/**
 * Stores gem tags as stable, condition-friendly identifiers.
 */
export class GemTagService {
  static normalizeTag(value) {
    return String(value ?? "")
      .trim()
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "");
  }

  static normalizeTags(values) {
    const entries = GemTagService.#asArray(values);
    return Array.from(new Set(
      entries
        .map((value) => GemTagService.normalizeTag(value))
        .filter(Boolean)
    ));
  }

  static getTags(source) {
    if (Array.isArray(source)) {
      return GemTagService.normalizeTags(source);
    }

    const fromFlag = source?.getFlag?.(Constants.MODULE_ID, Constants.FLAG_GEM_TAGS);
    const fromData = source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_TAGS];
    const fromSource = source?._source?.flags?.[Constants.MODULE_ID]?.[Constants.FLAG_GEM_TAGS];
    return GemTagService.normalizeTags(fromFlag ?? fromData ?? fromSource ?? []);
  }

  static hasTag(source, tag) {
    const normalized = GemTagService.normalizeTag(tag);
    return Boolean(normalized) && GemTagService.getTags(source).includes(normalized);
  }

  static #asArray(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value !== "string" && typeof value[Symbol.iterator] === "function") {
      return Array.from(value);
    }

    if (value && typeof value === "object") {
      return Object.entries(value)
        .filter(([key]) => /^\d+$/.test(key))
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([, entry]) => entry);
    }

    if (typeof value === "string") {
      return value.split(",");
    }

    return [];
  }
}
