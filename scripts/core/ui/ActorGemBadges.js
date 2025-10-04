import { Constants } from "../Constants.js";

export class ActorGemBadges {
  static CSS_CLASS = "sc-sockets-badges";
  static FLAG_KEY = "sockets";

  static init() {
    const handlers = [
      "renderActorSheet5e",     // dnd5e padrão (ApplicationV2)
      "renderBaseActorSheet",   // alguns módulos
      "renderActorSheet"        // fallback genérico
    ];
    for (const h of handlers) {
      Hooks.on(h, (sheet, html, ...rest) => this.#onRenderActorSheet(sheet, html, ...rest));
    }
    console.debug(`[${Constants.MODULE_ID}] ActorGemBadges init OK`);
  }

  static #onRenderActorSheet(sheet, html) {
    const actor = sheet?.actor;
    if (!actor) return;

    const root = this.#rootOf(html);
    if (!root) return;

    const socketed = actor.items.filter(i => {
      const sockets = i.getFlag(Constants.MODULE_ID, this.FLAG_KEY);
      return Array.isArray(sockets) && sockets.some(s => s?.gem?.img);
    });

    if (!socketed.length) return;

    for (const item of socketed) {
      const sockets = item.getFlag(Constants.MODULE_ID, this.FLAG_KEY) ?? [];
      const gems = sockets.map(s => s?.gem).filter(Boolean);
      if (!gems.length) continue;

      const cell = this.#findItemNameCell(root, item.id);
      if (!cell) continue;

      // remove bloco anterior (idempotente)
      cell.querySelectorAll(`.${this.CSS_CLASS}[data-item-id="${item.id}"]`).forEach(e => e.remove());

      // monta o bloco
      const wrap = document.createElement("div");
      wrap.className = this.CSS_CLASS;
      wrap.dataset.itemId = item.id;

      for (const gem of gems) {
        const div = document.createElement("div");
        div.className = "gem";

        const img = document.createElement("img");
        img.src = gem.img;
        img.alt = gem.name ?? "Gem";
        img.setAttribute("data-tooltip", gem.name ?? "Gem");
        img.draggable = false;

        div.appendChild(img);
        wrap.appendChild(div);
      }

      cell.appendChild(wrap);
    }

    // debug opcional:
    // console.debug(`[${Constants.MODULE_ID}] gem badges applied`, {actor: actor.name, count: socketed.length});
  }

  /** Normaliza html -> HTMLElement (funciona com jQuery ou HTMLElement) */
  static #rootOf(html) {
    if (!html) return null;
    // jQuery?
    if (html.jquery || typeof html.get === "function") return html[0] ?? html.get(0);
    // HTMLElement?
    if (html instanceof Element || html?.querySelector) return html;
    // alguns temas expõem via sheet.element
    return null;
  }

  /** Tenta localizar a célula de nome do item em diferentes layouts e retorna o primeiro que existir */
  static #findItemNameCell(root, itemId) {
    const selectors = [
      `li.item[data-item-id="${itemId}"] .name`,                              // dnd5e padrão
      `div.item-table-row-container[data-item-id="${itemId}"] .item-table-cell.primary`, // tidy5e-like
      `[data-item-id="${itemId}"] .name`,
      `[data-item-id="${itemId}"] .item-name`
    ];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
}
