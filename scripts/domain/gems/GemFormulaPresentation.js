import { Constants } from "../../core/Constants.js";
import { SocketStore } from "../../core/SocketStore.js";
import { GemDamageService } from "./GemDamageService.js";

/**
 * Builds presentation-only summaries of the extra damage granted by socketed
 * gems so actor sheets can display it in the Formula column. This layer never
 * mutates documents; it derives everything from `GemDamageService.collectGemDamage()`
 * so what is shown always mirrors what actually enters the roll.
 */
export class GemFormulaPresentation {
  /**
   * Collects display-ready entries for the extra gem damage of an item.
   * @param {Item|object|null} item
   * @param {object} [options]
   * @param {string|null} [options.activityType] Override for the resolved activity type.
   * @returns {Array<{gemName: string, gemImg: string, formula: string, typeMode: string, types: string[], typeLabels: string[], typeLabel: string, slot: number|undefined}>}
   */
  static collectEntries(item, { activityType } = {}) {
    if (!GemFormulaPresentation.#supportsItem(item)) {
      return [];
    }

    const resolvedActivityType = activityType !== undefined
      ? activityType
      : GemFormulaPresentation.resolveActivityType(item);

    const raw = GemDamageService.collectGemDamage(item, { activityType: resolvedActivityType });
    return raw.map((entry) => GemFormulaPresentation.#toPresentationEntry(entry));
  }

  /**
   * Whether the item has at least one gem damage entry worth displaying.
   * @param {Item|object|null} item
   * @returns {boolean}
   */
  static hasEntries(item) {
    return GemFormulaPresentation.collectEntries(item).length > 0;
  }

  /**
   * Resolves the activity type used to filter gem damage entries, mirroring
   * what `GemDamageService` receives from the dnd5e pre-roll hooks.
   * @param {Item|object|null} item
   * @returns {string|null}
   */
  static resolveActivityType(item) {
    const activities = GemFormulaPresentation.#activityList(item);
    const hasAttack = activities.some((activity) => (
      String(activity?.type ?? "").trim().toLowerCase() === "attack"
    ));
    if (hasAttack) {
      return "attack";
    }
    // Weapons roll damage through attack activities by default even when the
    // activity list is not populated on the source data.
    if (String(item?.type ?? "").trim().toLowerCase() === "weapon" && !activities.length) {
      return "attack";
    }
    return null;
  }

  /**
   * Sums the flat attack bonus granted by socketed gems, mirroring what
   * `GemDamageService` adds to attack rolls, and keeps the per-gem parts for
   * display purposes.
   * @param {Item|object|null} item
   * @returns {{total: number, parts: Array<{gemName: string, gemImg: string, bonus: number}>}}
   */
  static collectAttackBonus(item) {
    if (!GemFormulaPresentation.#supportsItem(item)) {
      return { total: 0, parts: [] };
    }

    const slots = SocketStore.peekSlots(item);
    const parts = [];
    let total = 0;

    for (const slot of Array.isArray(slots) ? slots : []) {
      const gem = GemDamageService.resolveGemSource(slot);
      if (!gem) continue;
      const raw = GemDamageService.readFlag(gem, Constants.FLAG_GEM_ATTACK_BONUS);
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      const bonus = Math.floor(value);
      total += bonus;
      if (bonus !== 0) {
        parts.push({
          gemName: gem.name ?? slot?.name ?? Constants.localize("SCSockets.GemDetails.ExtraDamage.Label", "Gem"),
          gemImg: gem.img ?? slot?.img ?? Constants.SOCKET_SLOT_IMG,
          bonus
        });
      }
    }

    return { total, parts };
  }

  /**
   * Formats a flat bonus with an explicit sign, e.g. `+2` / `-1`.
   * @param {number} value
   * @returns {string}
   */
  static formatSignedBonus(value) {
    const numeric = Number(value) || 0;
    return numeric < 0 ? String(numeric) : `+${numeric}`;
  }

  /**
   * Builds the tooltip HTML listing each gem's attack bonus contribution.
   * @param {Array<{gemName: string, gemImg: string, bonus: number}>} parts
   * @returns {string}
   */
  static buildAttackBonusTooltip(parts) {
    if (!Array.isArray(parts) || !parts.length) {
      return "";
    }

    const title = GemFormulaPresentation.#escapeHTML(
      Constants.localize("SCSockets.GemFormula.AttackBonusTooltipTitle", "Gem attack bonus")
    );

    const rows = parts.map((part) => {
      const name = GemFormulaPresentation.#escapeHTML(part.gemName);
      const bonus = GemFormulaPresentation.#escapeHTML(GemFormulaPresentation.formatSignedBonus(part.bonus));
      const img = part.gemImg
        ? `<img class="sc-sockets-gem-formula-tooltip-img" src="${GemFormulaPresentation.#escapeHTML(part.gemImg)}" alt="${name}">`
        : "";
      return `<li class="sc-sockets-gem-formula-tooltip-row">${img}` +
        `<span class="sc-sockets-gem-formula-tooltip-name">${name}</span>` +
        `<span class="sc-sockets-gem-formula-tooltip-formula">${bonus}</span></li>`;
    }).join("");

    return `<div class="sc-sockets-gem-formula-tooltip-content">` +
      `<header class="sc-sockets-gem-formula-tooltip-title">${title}</header>` +
      `<ul class="sc-sockets-gem-formula-tooltip-list">${rows}</ul></div>`;
  }

  /**
   * Builds the tooltip HTML with the full per-gem breakdown. The gem image is
   * always shown so each row stays identifiable; `showImage` only controls
   * whether the gem name is written out next to it.
   * @param {Array} entries Entries from `collectEntries()`.
   * @param {object} [options]
   * @param {boolean} [options.showImage=true] When false, omits the gem name.
   * @returns {string}
   */
  static buildTooltipContent(entries, { showImage = true } = {}) {
    if (!Array.isArray(entries) || !entries.length) {
      return "";
    }

    const title = GemFormulaPresentation.#escapeHTML(
      Constants.localize("SCSockets.GemFormula.TooltipTitle", "Socketed gem damage")
    );

    const rows = entries.map((entry) => {
      const name = GemFormulaPresentation.#escapeHTML(entry.gemName);
      const formula = GemFormulaPresentation.#escapeHTML(entry.formula);
      const type = GemFormulaPresentation.#renderTypeHTML(entry);
      const img = entry.gemImg
        ? `<img class="sc-sockets-gem-formula-tooltip-img" src="${GemFormulaPresentation.#escapeHTML(entry.gemImg)}" alt="${name}">`
        : "";
      const nameHTML = showImage
        ? `<span class="sc-sockets-gem-formula-tooltip-name">${name}</span>`
        : "";
      return `<li class="sc-sockets-gem-formula-tooltip-row">${img}${nameHTML}` +
        `<span class="sc-sockets-gem-formula-tooltip-formula">${formula}</span>` +
        `<span class="sc-sockets-gem-formula-tooltip-type">${type}</span></li>`;
    }).join("");

    return `<div class="sc-sockets-gem-formula-tooltip-content">` +
      `<header class="sc-sockets-gem-formula-tooltip-title">${title}</header>` +
      `<ul class="sc-sockets-gem-formula-tooltip-list">${rows}</ul></div>`;
  }

  /**
   * Builds the plain-text summary used for accessible labels and text tooltips.
   * @param {Array} entries Entries from `collectEntries()`.
   * @returns {string}
   */
  static buildPlainSummary(entries) {
    if (!Array.isArray(entries) || !entries.length) {
      return "";
    }
    return entries
      .map((entry) => `[${entry.gemName}] ${entry.formula} ${entry.typeLabel}`.trim())
      .join(" + ");
  }

  static #toPresentationEntry(entry) {
    const source = entry?.source ?? {};
    const typeMode = entry?.typeMode === "fixed" ? "fixed" : "inherit";
    const types = Array.isArray(entry?.types) ? [...entry.types] : [];
    const typeDetails = typeMode === "fixed"
      ? GemFormulaPresentation.#formatTypeDetails(types)
      : [];
    const typeLabels = typeDetails.length
      ? typeDetails.map((detail) => detail.label)
      : [GemFormulaPresentation.inheritTypeLabel()];

    return {
      gemName: source.name ?? Constants.localize("SCSockets.GemDetails.ExtraDamage.Label", "Gem"),
      gemImg: source.img ?? Constants.SOCKET_SLOT_IMG,
      formula: entry?.formula ?? "",
      typeMode,
      types,
      typeDetails,
      typeLabels,
      typeLabel: typeLabels.join(" / "),
      slot: source.slot
    };
  }

  /**
   * Localized label shown for `inherit` entries when nothing more specific
   * can be resolved safely.
   * @returns {string}
   */
  static inheritTypeLabel() {
    return Constants.localize("SCSockets.GemDetails.ExtraDamage.TypeOptions.Inherit", "Same as host");
  }

  /**
   * Resolves label and icon metadata for a list of fixed damage types.
   * @param {string[]} types
   * @returns {Array<{value: string, label: string, icon: string|null}>}
   */
  static #formatTypeDetails(types) {
    const configuredTypes = CONFIG?.DND5E?.damageTypes ?? {};
    return (Array.isArray(types) ? types : [])
      .filter((type) => type !== Constants.GEM_DAMAGE_INHERIT_TYPE)
      .map((type) => {
        const data = configuredTypes[type];
        let label = type;
        if (typeof data === "string") {
          label = game.i18n?.localize?.(data) ?? data;
        } else if (data?.label) {
          label = game.i18n?.localize?.(data.label) ?? data.label;
        }
        return {
          value: type,
          label,
          icon: typeof data === "object" && typeof data?.icon === "string" && data.icon.length
            ? data.icon
            : null
        };
      })
      .filter((detail) => Boolean(detail.label));
  }

  static #supportsItem(item) {
    const type = String(item?.type ?? "").trim().toLowerCase();
    return type === "weapon" || type === "spell";
  }

  static #activityList(item) {
    const activities = item?.system?.activities;
    if (!activities) {
      return [];
    }
    if (typeof activities.values === "function") {
      return Array.from(activities.values());
    }
    if (Array.isArray(activities)) {
      return activities;
    }
    if (typeof activities === "object") {
      return Object.values(activities);
    }
    return [];
  }

  /**
   * Renders the damage type for a tooltip row as dnd5e damage type icons.
   * Falls back to the text label when no icon metadata is available (inherit).
   * @private
   */
  static #renderTypeHTML(entry) {
    const iconDetails = (entry?.typeDetails ?? []).filter((detail) => detail.icon);
    if (!iconDetails.length) {
      return GemFormulaPresentation.#escapeHTML(entry?.typeLabel ?? "");
    }
    return iconDetails.map((detail) => {
      const label = GemFormulaPresentation.#escapeHTML(detail.label);
      const icon = GemFormulaPresentation.#escapeHTML(detail.icon);
      return `<span data-tooltip aria-label="${label}"><dnd5e-icon src="${icon}"></dnd5e-icon></span>`;
    }).join("");
  }

  static #escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
