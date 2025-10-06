export class DragHelper {
  /**
   * Enables drag-and-drop on elements matching the selector.
   * @param {HTMLElement} root - Root element of the sheet
   * @param {string} selector - CSS selector for drop zones
   * @param {Function} onDrop - Callback with { event, element, data, index }
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
          // fallback: ignore errors
        }

        const index = Number(el.dataset.index);
        onDrop?.({ event: ev, element: el, data, index });
      });
    }
  }
}
