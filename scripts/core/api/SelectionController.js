import { Constants } from "../Constants.js";

const ITEM_SELECTORS = "[data-item-id],[data-document-id],[data-entry-id],[data-uuid],[data-document-uuid],[data-info-card-entity-uuid]";
const SOCKET_SLOT_SELECTORS = '[data-dropzone="socket-slot"][data-index]';
const CURSOR_CLASS = "sc-sockets-target-cursor";
const EXTRACT_CURSOR_CLASS = "sc-sockets-extract-cursor";

const findRelatedElement = (element, selector) => {
  if (!(element instanceof HTMLElement)) return null;
  return element.matches(selector)
    ? element
    : element.closest(selector) ?? element.querySelector(selector);
};

const getDatasetValue = (element, keys = []) => {
  for (const key of keys) {
    const direct = element?.dataset?.[key];
    if (typeof direct === "string" && direct.length) {
      return direct;
    }
  }

  const related = findRelatedElement(
    element,
    "[data-uuid],[data-document-uuid],[data-entry-uuid],[data-actor-uuid],[data-parent-uuid],[data-item-uuid],[data-info-card-entity-uuid]"
  );
  for (const key of keys) {
    const value = related?.dataset?.[key];
    if (typeof value === "string" && value.length) {
      return value;
    }
  }

  return null;
};

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

  const uuid = getDatasetValue(element, [
    "uuid",
    "documentUuid",
    "entryUuid",
    "actorUuid",
    "parentUuid",
    "itemUuid",
    "infoCardEntityUuid"
  ]);

  if (uuid && typeof uuid === "string") {
    try {
      const doc = await fromUuid(uuid);
      if (doc?.documentName === "Item") return doc;
      if (doc?.documentName === "Actor") {
        const actorItemId = dataset.documentId ?? dataset.itemId ?? dataset.entryId;
        if (actorItemId) {
          return doc.items.get(actorItemId) ?? null;
        }
      }
    } catch {
      // noop
    }
  }

  const app = findApplicationForElement(element);
  if (!app) return null;

  if (app?.document?.documentName === "Item") {
    return app.document;
  }

  if (app?.item?.documentName === "Item") {
    return app.item;
  }

  if (app?.object?.documentName === "Item") {
    return app.object;
  }

  const itemId = dataset.documentId ?? dataset.itemId ?? dataset.entryId;
  if (!itemId) return null;

  if (app?.document?.documentName === "Actor") {
    return app.document.items.get(itemId) ?? null;
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
  static EXTRACT_CURSOR_CLASS = EXTRACT_CURSOR_CLASS;

  static async selectItem(options = {}) {
    return SelectionController.#runSelection({
      ...options,
      cursorClass: options.cursorClass ?? CURSOR_CLASS,
      messageKey: "SCSockets.Macro.AddSocket.SelectPrompt",
      messageFallback: "Click an item to add a socket. Press Esc to cancel.",
      selector: ITEM_SELECTORS,
      resolveSelection: async (target) => resolveItemFromElement(target)
    });
  }

  static async selectSocketSlot(options = {}) {
    return SelectionController.#runSelection({
      ...options,
      cursorClass: options.cursorClass ?? EXTRACT_CURSOR_CLASS,
      messageKey: "SCSockets.Macro.ExtractGem.SelectPrompt",
      messageFallback: "Click a filled socket to extract its gem. Press Esc to cancel.",
      selector: SOCKET_SLOT_SELECTORS,
      resolveSelection: async (target) => {
        const item = await resolveItemFromElement(target);
        const slotIndex = Number(target?.dataset?.index);
        if (!item || !Number.isInteger(slotIndex) || slotIndex < 0) {
          return { item: null, slotIndex: null };
        }
        return { item, slotIndex, element: target };
      }
    });
  }

  static #runSelection({
    notifications = true,
    cursorClass = CURSOR_CLASS,
    messageKey,
    messageFallback,
    selector,
    resolveSelection
  } = {}) {
    const message = Constants.localize(messageKey, messageFallback);
    if (notifications) {
      ui.notifications?.info?.(message);
    }

    const root = document.documentElement;
    const body = document.body;
    root?.classList.add(cursorClass);
    body?.classList.add(cursorClass);

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
        docRoot?.classList.remove(CURSOR_CLASS, EXTRACT_CURSOR_CLASS);
        docBody?.classList.remove(CURSOR_CLASS, EXTRACT_CURSOR_CLASS);
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          finish(null);
        }
      };

      const resolveFromEvent = async (event) => {
        if (event.button !== undefined && event.button !== 0) return null;
        const target = event.target?.closest?.(selector);
        if (!target) return null;
        stopEvent(event);
        return resolveSelection(target);
      };

      const onPointerDown = async (event) => {
        if (finished) return;
        const selection = await resolveFromEvent(event);
        if (selection === null || selection === undefined) return;
        finish(selection);
      };

      const onTouchStart = async (event) => {
        if (finished) return;
        const selection = await resolveFromEvent(event);
        if (selection === null || selection === undefined) return;
        finish(selection);
      };

      const swallowClick = (event) => {
        if (finished) return;
        if (event.button !== 0) return;
        const target = event.target?.closest?.(selector);
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
