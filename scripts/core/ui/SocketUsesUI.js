import { SocketRollDataService } from "../services/SocketRollDataService.js";

/** Makes dnd5e's numeric uses counters read-only when sockets own the balance. */
export class SocketUsesUI {
  static #handlers = new Map();

  static activate() {
    if (SocketUsesUI.#handlers.size) return;
    for (const hook of ["renderItemSheet5e", "renderItemSheet", "renderActorSheet5e", "renderActorSheet"]) {
      const handler = (sheet, html) => SocketUsesUI.bind(sheet, html);
      Hooks.on(hook, handler);
      SocketUsesUI.#handlers.set(hook, handler);
    }
  }

  static bind(sheet, html) {
    const root = SocketUsesUI.#rootOf(html ?? sheet?.element);
    if (!root) return;

    const item = sheet?.item ?? (sheet?.document?.documentName === "Item" ? sheet.document : null);
    if (item) SocketUsesUI.#lockItemFields(root, item);

    const actor = sheet?.actor ?? (sheet?.document?.documentName === "Actor" ? sheet.document : null);
    if (!actor?.items) return;
    for (const input of root.querySelectorAll('[data-name="system.uses.value"]')) {
      const itemId = input.closest?.("[data-item-id]")?.dataset?.itemId;
      const rowItem = itemId ? actor.items.get?.(itemId) : null;
      if (rowItem && SocketRollDataService.getUsesBindingState(rowItem)) {
        SocketUsesUI.#makeReadonly(input);
      }
    }
  }

  static #lockItemFields(root, item) {
    const state = SocketRollDataService.getUsesBindingState(item);
    if (!state) return;
    for (const input of root.querySelectorAll([
      'input[name="system.uses.spent"]',
      'input[data-tidy-field="system.uses.spent"]',
      '[data-tidy-field="system.uses.spent"] input'
    ].join(","))) {
      input.value = String(state.spent);
      SocketUsesUI.#makeReadonly(input);
    }
  }

  static #makeReadonly(input) {
    input.readOnly = true;
    input.setAttribute?.("aria-readonly", "true");
    input.dataset.scSocketsReadonlyUses = "true";
    input.title = "Managed by socketed gem charges";
  }

  static #rootOf(html) {
    if (html?.querySelectorAll) return html;
    if (html?.[0]?.querySelectorAll) return html[0];
    return null;
  }
}
