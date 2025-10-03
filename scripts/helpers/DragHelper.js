// helpers/DragHelper.js
export class DragHelper {
  /**
   * Liga DnD em elementos que combinem com o selector.
   * @param {HTMLElement} root - root do sheet
   * @param {string} selector - seletor CSS para as dropzones
   * @param {Function} onDrop - callback com { event, element, data, index }
   */
  static bindDropZones(root, selector, onDrop) {
    if (!root) return;
    const zones = root.querySelectorAll(selector);
    for (const el of zones) {
      el.addEventListener("dragover", (ev) => ev.preventDefault());

      el.addEventListener("drop", async (ev) => {
        ev.preventDefault();

        let data = null;
        try {
          const txt = ev.dataTransfer?.getData("text/plain");
          data = txt ? JSON.parse(txt) : null;
        } catch {
          // fallback: ignora
        }

        const index = Number(el.dataset.index);
        onDrop?.({ event: ev, element: el, data, index });
      });
    }
  }
}
