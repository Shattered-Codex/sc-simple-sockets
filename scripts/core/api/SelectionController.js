import { Constants } from "../Constants.js";

const ITEM_SELECTORS = "[data-item-id],[data-document-id],[data-uuid],[data-document-uuid]";
const CURSOR_CLASS = "sc-sockets-target-cursor";

const findApplicationForElement = (element) => {
  const root = element.closest("[data-app-id], [data-appid], .window-app");
  if (!root) return null;

  const appId = root.dataset.appId ?? root.dataset.appid ?? root.id;
  const apps = [...Object.values(ui.windows ?? {})];

  const v2Instances = foundry?.applications?.instances ?? foundry?.applications?.applications;
  if (v2Instances instanceof Map) {
    apps.push(...v2Instances.values());
  } else if (Array.isArray(v2Instances)) {
    apps.push(...v2Instances);
  }

  for (const app of apps) {
    if (!app) continue;
    if (String(app?.appId) === String(appId) || String(app?.id) === String(appId)) {
      return app;
    }
  }
  return null;
};

const resolveItemFromElement = async (element) => {
  if (!element) return null;
  const { dataset } = element;

  const uuid =
    dataset.uuid ??
    dataset.documentUuid ??
    dataset.entryUuid ??
    dataset.actorUuid ??
    dataset.parentUuid ??
    dataset.itemUuid;

  if (uuid && typeof uuid === "string") {
    try {
      const doc = await fromUuid(uuid);
      if (doc?.documentName === "Item") return doc;
      if (doc?.documentName === "Actor" && dataset?.documentId) {
        return doc.items.get(dataset.documentId) ?? null;
      }
    } catch {
      // noop
    }
  }

  const app = findApplicationForElement(element);
  if (!app) return null;
  const itemId = dataset.documentId ?? dataset.itemId;
  if (!itemId) return null;

  if (app?.document?.documentName === "Actor") {
    return app.document.items.get(itemId) ?? null;
  }

  if (app?.document?.documentName === "Item" && app.document.id === itemId) {
    return app.document;
  }

  return game.items?.get(itemId) ?? null;
};

const stopEvent = (event) => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
};

export class SelectionController {
  static CURSOR_CLASS = CURSOR_CLASS;

  static async selectItem(options = {}) {
    const { notifications = true } = options;
    const message = Constants.localize(
      "SCSockets.Macro.AddSocket.SelectPrompt",
      "Click an item to add a socket. Press Esc to cancel."
    );

    if (notifications) {
      ui.notifications?.info?.(message);
    }

    const root = document.documentElement;
    const body = document.body;

    root?.classList.add(CURSOR_CLASS);
    body?.classList.add(CURSOR_CLASS);

    return new Promise((resolve) => {
      let finished = false;

      const finish = (value) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(value);
      };

      const cleanup = () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("mousedown", onPointerDown, true);
        document.removeEventListener("touchstart", onTouchStart, true);
        document.removeEventListener("click", swallowClick, true);
        document.removeEventListener("keydown", onKeyDown, true);
        const docRoot = document.documentElement;
        const docBody = document.body;
        docRoot?.classList.remove(CURSOR_CLASS);
        docBody?.classList.remove(CURSOR_CLASS);
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          finish(null);
        }
      };

      const resolveFromEvent = async (event) => {
        if (event.button !== undefined && event.button !== 0) return null;
        const target = event.target?.closest?.(ITEM_SELECTORS);
        if (!target) return null;
        stopEvent(event);
        return resolveItemFromElement(target);
      };

      const onPointerDown = async (event) => {
        if (finished) return;
        const item = await resolveFromEvent(event);
        if (!item) return;
        finish(item);
      };

      const onTouchStart = async (event) => {
        if (finished) return;
        const item = await resolveFromEvent(event);
        if (!item) return;
        finish(item);
      };

      const swallowClick = (event) => {
        if (finished) return;
        if (event.button !== 0) return;
        const target = event.target?.closest?.(ITEM_SELECTORS);
        if (!target) return;
        stopEvent(event);
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("mousedown", onPointerDown, true);
      document.addEventListener("touchstart", onTouchStart, true);
      document.addEventListener("click", swallowClick, true);
      document.addEventListener("keydown", onKeyDown, true);
    });
  }
}
