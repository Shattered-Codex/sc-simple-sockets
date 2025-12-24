import { Constants } from "../Constants.js";
import { GemDamageService } from "../../domain/gems/GemDamageService.js";

export class DamageRollGemBadges {
  static #handler = null;

  static activate() {
    if (DamageRollGemBadges.#handler) {
      return;
    }
    DamageRollGemBadges.#handler = (app, html) => DamageRollGemBadges.#render(app, html);
    Hooks.on("renderDamageRollConfigurationDialog", DamageRollGemBadges.#handler);
  }

  static deactivate() {
    if (!DamageRollGemBadges.#handler) {
      return;
    }
    Hooks.off("renderDamageRollConfigurationDialog", DamageRollGemBadges.#handler);
    DamageRollGemBadges.#handler = null;
  }

  static #render(app, html) {
    const rolls = app?.rolls;
    if (!Array.isArray(rolls) || !rolls.length) {
      return;
    }

    const root = DamageRollGemBadges.#rootOf(html);
    if (!root) return;

    const items = root.querySelectorAll?.(".formulas li") ?? [];
    if (!items.length) {
      return;
    }

    items.forEach((li, idx) => {
      const roll = rolls[idx];
      const meta = roll?.options?.[Constants.MODULE_ID]?.[GemDamageService.META_KEY];
      if (!Array.isArray(meta) || !meta.length) {
        return;
      }

      const line = li.querySelector(".formula-line");
      if (!line || line.querySelector(".sc-sockets-gem-roll-badges")) {
        return;
      }

      const wrap = document.createElement("div");
      wrap.className = "sc-sockets-gem-roll-badges";

      for (const entry of meta) {
        const badge = document.createElement("div");
        badge.className = "sc-sockets-gem-roll-badge";
        const img = document.createElement("img");
        img.src = entry.gemImg ?? Constants.SOCKET_SLOT_IMG;
        img.alt = entry.gemName ?? "Gem";
        badge.title = DamageRollGemBadges.#buildTooltip(entry);
        badge.appendChild(img);
        wrap.appendChild(badge);
      }

      line.appendChild(wrap);
    });
  }

  static #buildTooltip(entry) {
    const parts = [];
    if (entry?.gemName) {
      parts.push(entry.gemName);
    }
    if (entry?.formula) {
      parts.push(entry.formula);
    }
    if (entry?.type) {
      parts.push(entry.type);
    }
    return parts.join(" • ");
  }

  static #rootOf(html) {
    if (!html) return null;
    if (html.jquery || typeof html.get === "function") {
      return html[0] ?? html.get(0) ?? null;
    }
    if (html instanceof Element || html?.querySelector) {
      return html;
    }
    return null;
  }
}
