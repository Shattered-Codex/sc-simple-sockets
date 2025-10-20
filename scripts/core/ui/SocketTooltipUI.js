import { SocketService } from "../services/SocketService.js";
import { ActorGemBadges } from "./ActorGemBadges.js";

export class SocketTooltipUI {
  static #handler = null;

  static activate() {
    if (SocketTooltipUI.#handler) {
      return;
    }

    SocketTooltipUI.#handler = (sheet, html) => SocketTooltipUI.#onRender(sheet, html);
    Hooks.on("renderItemSheet5e", SocketTooltipUI.#handler);
  }

  static deactivate() {
    if (!SocketTooltipUI.#handler) {
      return;
    }

    Hooks.off("renderItemSheet5e", SocketTooltipUI.#handler);
    SocketTooltipUI.#handler = null;
  }

  static #onRender(sheet, html) {
    SocketTooltipUI.refresh(sheet, html);
  }

  static refresh(sheet, html) {
    const item = sheet?.item;
    if (!item) {
      return;
    }

    const root = SocketTooltipUI.#rootOf(html ?? sheet?.element);
    if (!root) {
      return;
    }

    const rows = root.querySelectorAll?.('[data-dropzone="socket-slot"][data-index]');
    if (!rows?.length) {
      return;
    }

    const slots = SocketService.getSlots(item);
    rows.forEach((row) => {
      const index = Number(row.dataset.index);
      if (!Number.isInteger(index) || index < 0) {
        return;
      }

      const slot = slots[index];
      if (!slot) {
        return;
      }

      const target = row.querySelector(".socket-name");
      if (!target) {
        return;
      }

      const label = slot?.gem?.name ?? slot?.name ?? ActorGemBadges.emptySlotLabel();
      ActorGemBadges.applyTooltip(target, slot, label);
    });
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
