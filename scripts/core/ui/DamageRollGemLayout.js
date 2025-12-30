import { Constants } from "../Constants.js";
import { GemDamageService } from "../../domain/gems/GemDamageService.js";

/**
 * Reorganizes the formulas list in the damage roll dialog.
 * Mode "gem": group by gem (with metadata). Mode "type": group by damage type.
 */
export class DamageRollGemLayout {
  static #handler = null;
  static #mode = "gem"; // "gem" | "type"

  static activate({ mode = "gem" } = {}) {
    DamageRollGemLayout.#mode = mode === "type" ? "type" : "gem";
    if (DamageRollGemLayout.#handler) return;
    DamageRollGemLayout.#handler = (app, html) => DamageRollGemLayout.#onRender(app, html);
    Hooks.on("renderDamageRollConfigurationDialog", DamageRollGemLayout.#handler);
  }

  static deactivate() {
    if (!DamageRollGemLayout.#handler) return;
    Hooks.off("renderDamageRollConfigurationDialog", DamageRollGemLayout.#handler);
    DamageRollGemLayout.#handler = null;
  }

  static #onRender(app, html) {
    const root = DamageRollGemLayout.#rootOf(html);
    if (!root) return;

    const list = root.querySelector(".formulas.unlist");
    if (!list || list.dataset.scSocketsLayoutApplied === "true") {
      return;
    }

    const rows = Array.from(list.querySelectorAll(":scope > li"));
    const rolls = Array.isArray(app?.rolls) ? app.rolls : [];
    if (!rows.length || !rolls.length || rows.length !== rolls.length) {
      return;
    }

    // Clean any previous badges.
    root.querySelectorAll(".sc-sockets-gem-roll-badge").forEach((el) => el.remove());

    const grouped = DamageRollGemLayout.#mode === "type"
      ? DamageRollGemLayout.#groupByDamageType(rolls, rows)
      : DamageRollGemLayout.#groupByGem(rolls, rows);
    if (!grouped) return;

    const frag = document.createDocumentFragment();

    if (DamageRollGemLayout.#mode === "type") {
      grouped.forEach(({ meta, rows: typeRows }) => {
        const condensed = DamageRollGemLayout.#condenseRows(typeRows);
        condensed.forEach((row) => frag.appendChild(row));
      });
    } else {
      if (grouped.base.length) {
        grouped.base.forEach((row) => frag.appendChild(row));
      }
      if (grouped.gems.size) {
      grouped.gems.forEach(({ meta, rows: gemRows }) => {
        const box = DamageRollGemLayout.#buildGemBox(gemRows, meta);
        frag.appendChild(box ?? gemRows?.[0]);
      });
    }
    }

    list.replaceChildren(frag);
    list.dataset.scSocketsLayoutApplied = "true";
  }

  static #groupByGem(rolls, rows) {
    if (rolls.length !== rows.length) {
      return null;
    }
    const result = { base: [], gems: new Map() };

    rolls.forEach((roll, idx) => {
      const row = rows[idx];
      const meta = roll?.options?.[Constants.MODULE_ID]?.[GemDamageService.META_KEY];
      if (Array.isArray(meta) && meta.length) {
        meta.forEach((entry, metaIdx) => {
          const key = DamageRollGemLayout.#gemKey(entry, { idx, metaIdx });
          const group = result.gems.get(key) ?? { meta: entry, rows: [] };
          const targetRow = metaIdx === 0 && !group.rows.length ? row : row.cloneNode(true);
          group.rows.push(targetRow);
          result.gems.set(key, group);
        });
      } else {
        result.base.push(row);
      }
    });

    return result;
  }

  static #groupByDamageType(rolls, rows) {
    if (rolls.length !== rows.length) return null;
    const map = new Map();
    rolls.forEach((roll, idx) => {
      const row = rows[idx];
      const type = roll?.options?.type ?? roll?.options?.types?.[0] ?? "unknown";
      const config = DamageRollGemLayout.#damageConfigForType(type);
      const key = type ?? config?.label ?? `type-${idx}`;
      const group = map.get(key) ?? {
        meta: {
          label: config?.label ?? (type === "unknown" ? Constants.localize("DND5E.Formula", "Formula") : String(type)),
          icon: config?.icon ?? null
        },
        rows: []
      };
      group.rows.push(row);
      map.set(key, group);
    });
    return map;
  }

  static #buildGemBox(rows, meta) {
    if (!rows || !rows.length) return null;
    const name = meta?.gemName ?? Constants.localize("SCSockets.GemDetails.ExtraDamage.Label", "Gem");
    const imgSrc = meta?.gemImg ?? Constants.SOCKET_SLOT_IMG;

    const box = document.createElement("li");
    box.className = "sc-sockets-gem-box";

    const fieldset = document.createElement("fieldset");
    fieldset.className = "sc-sockets-gem-fieldset";
    const legend = document.createElement("legend");
    legend.className = "sc-sockets-gem-legend";
    legend.innerHTML = `
      <img src="${imgSrc}" alt="${name}" class="sc-sockets-gem-box__img">
      <span class="sc-sockets-gem-box__title">${name}</span>
    `;
    fieldset.appendChild(legend);

    const content = document.createElement("div");
    content.className = "sc-sockets-gem-box__content";
    rows.forEach((row) => {
      const container = document.createElement("div");
      container.className = "sc-sockets-gem-box__row";
      while (row.firstChild) {
        container.appendChild(row.firstChild);
      }
      content.appendChild(container);
    });
    fieldset.appendChild(content);
    box.appendChild(fieldset);
    return box;
  }

  static #buildTypeBox(rows, meta) {
    if (!rows || !rows.length) return null;
    const name = meta?.label ?? Constants.localize("DND5E.Formula", "Formula");
    const icon = meta?.icon ?? null;

    const box = document.createElement("li");
    box.className = "sc-sockets-gem-box";

    const fieldset = document.createElement("fieldset");
    fieldset.className = "sc-sockets-gem-fieldset";
    const legend = document.createElement("legend");
    legend.className = "sc-sockets-gem-legend";
    if (icon) {
      const iconEl = document.createElement("dnd5e-icon");
      iconEl.setAttribute("src", icon);
      iconEl.setAttribute("alt", name);
      legend.appendChild(iconEl);
    }
    const title = document.createElement("span");
    title.className = "sc-sockets-gem-box__title";
    title.textContent = name;
    legend.appendChild(title);
    fieldset.appendChild(legend);

    const content = document.createElement("div");
    content.className = "sc-sockets-gem-box__content";
    rows.forEach((row) => {
      const container = document.createElement("div");
      container.className = "sc-sockets-gem-box__row";
      while (row.firstChild) {
        container.appendChild(row.firstChild);
      }
      content.appendChild(container);
    });
    fieldset.appendChild(content);
    box.appendChild(fieldset);
    return box;
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

  static #gemKey(entry, { idx = 0, metaIdx = 0 } = {}) {
    const uuid = entry?.gemUuid ?? "";
    const slot = entry?.slot ?? "";
    const img = entry?.gemImg ?? "";
    const name = entry?.gemName ?? "";
    if (uuid || slot) {
      return `${uuid}:${slot}`;
    }
    return `${img}:${name}:${idx}:${metaIdx}`;
  }

  static #damageConfigForType(type) {
    const all = foundry?.utils?.mergeObject?.(
      CONFIG?.DND5E?.damageTypes ?? {},
      CONFIG?.DND5E?.healingTypes ?? {},
      { inplace: false }
    ) ?? {};
    return all[type];
  }

  /**
   * Combine multiple rows into a single row by concatenating formulas.
   * @param {HTMLLIElement[]} rows
   * @returns {HTMLLIElement[]}
   */
  static #condenseRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const [first, ...rest] = rows;
    const formulas = rows.map((row) => row.querySelector(".formula")?.textContent?.trim()).filter(Boolean);
    const combined = formulas.join(" + ");
    const formulaEl = first.querySelector(".formula");
    if (formulaEl && combined) {
      formulaEl.textContent = combined;
    }
    // Remove extra rows from the DOM to avoid duplicate inputs
    rest.forEach((row) => row.remove());
    return [first];
  }
}
