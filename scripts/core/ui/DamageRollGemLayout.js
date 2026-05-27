import { DamageRollLayoutAdapterRegistry } from "./damage-roll-layout/DamageRollLayoutAdapterRegistry.js";
import { rootOf } from "./damage-roll-layout/damageRollLayoutDom.js";

/**
 * Reorganizes the formulas list in the damage roll dialog.
 */
export class DamageRollGemLayout {
  static #handler = null;
  static #mode = DamageRollLayoutAdapterRegistry.getDefaultMode();

  static activate({ mode } = {}) {
    DamageRollGemLayout.#mode = DamageRollLayoutAdapterRegistry.normalizeMode(mode);
    if (DamageRollGemLayout.#handler) {
      return;
    }

    DamageRollGemLayout.#handler = (app, html) => DamageRollGemLayout.#onRender(app, html);
    Hooks.on("renderDamageRollConfigurationDialog", DamageRollGemLayout.#handler);
  }

  static deactivate() {
    if (!DamageRollGemLayout.#handler) {
      return;
    }

    Hooks.off("renderDamageRollConfigurationDialog", DamageRollGemLayout.#handler);
    DamageRollGemLayout.#handler = null;
  }

  static #onRender(app, html) {
    const root = rootOf(html);
    if (!root) return;

    const list = root.querySelector(".formulas.unlist");
    if (!(list instanceof HTMLElement) || list.dataset.scSocketsLayoutApplied === "true") {
      return;
    }

    const rows = Array.from(list.querySelectorAll(":scope > li"));
    const rolls = Array.isArray(app?.rolls) ? app.rolls : [];
    if (!rows.length || !rolls.length || rows.length !== rolls.length) {
      return;
    }

    root.querySelectorAll(".sc-sockets-gem-roll-badges").forEach((element) => element.remove());

    const adapter = DamageRollLayoutAdapterRegistry.createAdapter(DamageRollGemLayout.#mode);
    const renderedRows = adapter.build({ app, root, list, rows, rolls });
    if (!Array.isArray(renderedRows) || !renderedRows.length) {
      return;
    }

    const fragment = document.createDocumentFragment();
    renderedRows.forEach((row) => fragment.appendChild(row));
    list.replaceChildren(fragment);
    list.dataset.scSocketsLayoutApplied = "true";
  }
}
