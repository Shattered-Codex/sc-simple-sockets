import { Constants } from "../Constants.js";

const ITEM_SELECTORS = "[data-item-id],[data-document-id],[data-entry-id],[data-uuid],[data-document-uuid],[data-info-card-entity-uuid]";
const SOCKET_SLOT_SELECTORS = '[data-dropzone="socket-slot"][data-index]';
const CURSOR_CLASS = "sc-sockets-target-cursor";
const EXTRACT_CURSOR_CLASS = "sc-sockets-extract-cursor";
const CURSOR_VARIABLES = Object.freeze({
  [CURSOR_CLASS]: "--sc-sockets-cursor",
  [EXTRACT_CURSOR_CLASS]: "--sc-sockets-extract-cursor"
});
const CURSOR_FALLBACKS = Object.freeze({
  [CURSOR_CLASS]: "crosshair",
  [EXTRACT_CURSOR_CLASS]: "pointer"
});
const MAX_CURSOR_SIZE = 48;

const ROOT_ASSET_PREFIXES = /^(?:modules|systems|worlds|icons|ui|scripts)\//;
const ABSOLUTE_URL_PREFIXES = /^(?:[a-z]+:|\/\/|\/)/i;

const escapeCursorUrl = (value) => String(value ?? "").replace(/["\\\n\r]/g, "\\$&");
const normalizeCursorUrl = (cursorUrl) => {
  const value = String(cursorUrl ?? "").trim();
  if (!value.length) return "";
  if (ABSOLUTE_URL_PREFIXES.test(value)) return value;
  if (ROOT_ASSET_PREFIXES.test(value)) return `/${value}`;
  if (value.startsWith("./assets/")) return `/modules/${Constants.MODULE_ID}/${value.slice(2)}`;
  if (value.startsWith("assets/")) return `/${value}`;
  return value;
};

const buildCursorValue = (value, cursorClass, hotspotX = 16, hotspotY = 16) => {
  const fallback = CURSOR_FALLBACKS[cursorClass] ?? "crosshair";
  return `url("${escapeCursorUrl(value)}") ${hotspotX} ${hotspotY}, ${fallback}`;
};

const rasterizeCursorUrl = async (cursorUrl) => {
  const value = normalizeCursorUrl(cursorUrl);
  if (!value.length) return "";

  const image = new Image();
  image.decoding = "async";

  const loaded = await new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load cursor image: ${value}`));
    image.src = value;
  });

  const width = Number(loaded.naturalWidth ?? loaded.width ?? 0);
  const height = Number(loaded.naturalHeight ?? loaded.height ?? 0);
  if (!width || !height) {
    return buildCursorValue(value, CURSOR_CLASS);
  }

  if (width <= MAX_CURSOR_SIZE && height <= MAX_CURSOR_SIZE) {
    return buildCursorValue(value, CURSOR_CLASS, Math.min(16, width - 1), Math.min(16, height - 1));
  }

  const scale = Math.min(MAX_CURSOR_SIZE / width, MAX_CURSOR_SIZE / height);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return buildCursorValue(value, CURSOR_CLASS);
  }

  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(loaded, 0, 0, targetWidth, targetHeight);
  const dataUrl = canvas.toDataURL("image/png");
  return buildCursorValue(
    dataUrl,
    CURSOR_CLASS,
    Math.min(16, targetWidth - 1),
    Math.min(16, targetHeight - 1)
  );
};

const toCursorValue = async (cursorUrl, cursorClass) => {
  const value = normalizeCursorUrl(cursorUrl);
  if (!value.length) return "";
  try {
    const rasterized = await rasterizeCursorUrl(value);
    if (rasterized.length) {
      return rasterized.replace(
        `, ${CURSOR_FALLBACKS[CURSOR_CLASS] ?? "crosshair"}`,
        `, ${CURSOR_FALLBACKS[cursorClass] ?? "crosshair"}`
      );
    }
  } catch {
    // Fall back to the original URL if rasterization fails.
  }
  return buildCursorValue(value, cursorClass);
};

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
      messageKey: options.messageKey ?? "SCSockets.Macro.AddSocket.SelectPrompt",
      messageFallback: options.messageFallback ?? "Click an item to add a socket. Press Esc to cancel.",
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

  static async #runSelection({
    notifications = true,
    cursorClass = CURSOR_CLASS,
    cursorUrl = "",
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
    const cursorVariable = CURSOR_VARIABLES[cursorClass] ?? CURSOR_VARIABLES[CURSOR_CLASS];
    let customCursorValue = "";
    if (cursorUrl) {
      try {
        customCursorValue = await toCursorValue(cursorUrl, cursorClass);
      } catch {
        customCursorValue = "";
      }
    }

    return new Promise((resolve) => {
      let finished = false;
      let clickCleanupTimeout = null;
      if (customCursorValue) {
        root?.style?.setProperty?.(cursorVariable, customCursorValue);
        body?.style?.setProperty?.(cursorVariable, customCursorValue);
      }
      root?.classList.add(cursorClass);
      body?.classList.add(cursorClass);

      const clearDeferredClickCleanup = () => {
        if (clickCleanupTimeout === null) {
          return;
        }

        clearTimeout(clickCleanupTimeout);
        clickCleanupTimeout = null;
      };

      const removeClickSwallow = () => {
        clearDeferredClickCleanup();
        document.removeEventListener("click", swallowClick, true);
      };

      const finish = (value, { preserveClickSwallow = false } = {}) => {
        if (finished) return;
        finished = true;
        cleanup({ preserveClickSwallow });
        resolve(value);
      };

      const cleanup = ({ preserveClickSwallow = false } = {}) => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("mousedown", onPointerDown, true);
        document.removeEventListener("touchstart", onTouchStart, true);
        document.removeEventListener("pointerup", onInteractionEnd, true);
        document.removeEventListener("mouseup", onInteractionEnd, true);
        document.removeEventListener("touchend", onInteractionEnd, true);
        if (!preserveClickSwallow) {
          removeClickSwallow();
        }
        document.removeEventListener("keydown", onKeyDown, true);
        const docRoot = document.documentElement;
        const docBody = document.body;
        docRoot?.classList.remove(CURSOR_CLASS, EXTRACT_CURSOR_CLASS);
        docBody?.classList.remove(CURSOR_CLASS, EXTRACT_CURSOR_CLASS);
        if (customCursorValue) {
          docRoot?.style?.removeProperty?.(cursorVariable);
          docBody?.style?.removeProperty?.(cursorVariable);
        }
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          finish(null);
        }
      };

      const onInteractionEnd = () => {
        if (!finished) {
          return;
        }

        clearDeferredClickCleanup();
        clickCleanupTimeout = setTimeout(() => {
          clickCleanupTimeout = null;
          removeClickSwallow();
        }, 0);
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
        finish(selection, { preserveClickSwallow: true });
      };

      const onTouchStart = async (event) => {
        if (finished) return;
        const selection = await resolveFromEvent(event);
        if (selection === null || selection === undefined) return;
        finish(selection, { preserveClickSwallow: true });
      };

      const swallowClick = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const target = event.target?.closest?.(selector);
        if (!target) return;
        stopEvent(event);
        if (finished) {
          removeClickSwallow();
        }
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("mousedown", onPointerDown, true);
      document.addEventListener("touchstart", onTouchStart, true);
      document.addEventListener("pointerup", onInteractionEnd, true);
      document.addEventListener("mouseup", onInteractionEnd, true);
      document.addEventListener("touchend", onInteractionEnd, true);
      document.addEventListener("click", swallowClick, true);
      document.addEventListener("keydown", onKeyDown, true);
    });
  }
}
