import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";

export class DebugTrace {
  static #active = false;
  static #hookHandlers = new Map();

  static activate() {
    if (DebugTrace.#active) {
      return;
    }

    const renderHooks = [
      "renderItemSheet5e",
      "renderActorSheet5e",
      "renderBaseActorSheet",
      "renderItemSheet",
      "renderActorSheet"
    ];

    for (const hookName of renderHooks) {
      const handler = (app) => {
        DebugTrace.log(`hook.${hookName}`, {
          app: DebugTrace.describeApp(app)
        });
      };
      Hooks.on(hookName, handler);
      DebugTrace.#hookHandlers.set(hookName, handler);
    }

    const updateHooks = ["createItem", "updateItem", "deleteItem"];
    for (const hookName of updateHooks) {
      const handler = (item, changes, options) => {
        DebugTrace.log(`hook.${hookName}`, {
          item: DebugTrace.describeItem(item),
          actor: DebugTrace.describeActor(item?.actor ?? item?.parent),
          changes: DebugTrace.describeChanges(changes),
          options: DebugTrace.describeOptions(options)
        });
      };
      Hooks.on(hookName, handler);
      DebugTrace.#hookHandlers.set(hookName, handler);
    }

    DebugTrace.#active = true;
  }

  static isEnabled() {
    return ModuleSettings.isDebugTraceEnabled();
  }

  static log(event, payload = {}) {
    if (!DebugTrace.isEnabled()) {
      return;
    }

    console.log(
      `[${Constants.MODULE_ID}] [trace ${DebugTrace.#timestamp()}] ${event}`,
      DebugTrace.#normalizePayload(payload)
    );
  }

  static render(app, force, reason, payload = {}) {
    DebugTrace.log("ui.render", {
      reason,
      force: Boolean(force),
      app: DebugTrace.describeApp(app),
      ...payload
    });
    app?.render?.(force);
  }

  static bringToTop(app, reason, payload = {}) {
    const before = DebugTrace.describeApp(app);
    DebugTrace.log("ui.bringToTop", {
      reason,
      app: before,
      ...payload
    });

    try {
      app?.bringToTop?.({ force: true, focus: true });
    } catch {
      app?.bringToTop?.();
    }

    DebugTrace.#forceHighestZIndex(app);
    DebugTrace.#focusAppElement(app);

    DebugTrace.log("ui.bringToTop.after", {
      reason,
      before,
      after: DebugTrace.describeApp(app),
      ...payload
    });
  }

  static describeItem(item) {
    if (item?.documentName !== "Item") {
      return null;
    }

    return {
      id: item.id ?? null,
      uuid: item.uuid ?? null,
      name: item.name ?? null,
      type: item.type ?? null,
      actorId: item.actor?.id ?? item.parent?.id ?? null,
      actorName: item.actor?.name ?? item.parent?.name ?? null
    };
  }

  static describeActor(actor) {
    const current = actor?.documentName === "Actor" ? actor : null;
    if (!current) {
      return null;
    }

    return {
      id: current.id ?? null,
      uuid: current.uuid ?? null,
      name: current.name ?? null,
      type: current.type ?? null
    };
  }

  static describeApp(app) {
    if (!app) {
      return null;
    }

    const element = DebugTrace.#resolveElement(app.element);
    const document = app.document ?? app.object ?? app.item ?? null;

    return {
      appId: app.appId ?? app.id ?? null,
      className: app.constructor?.name ?? null,
      title: app.title ?? app.options?.window?.title ?? app.options?.title ?? null,
      rendered: Boolean(app.rendered),
      inlineZIndex: element?.style?.zIndex ?? null,
      computedZIndex: DebugTrace.#readComputedZIndex(element),
      position: DebugTrace.#describePosition(app.position),
      document: DebugTrace.describeDocument(document)
    };
  }

  static describeDocument(document) {
    if (!document) {
      return null;
    }

    if (document.documentName === "Item") {
      return DebugTrace.describeItem(document);
    }

    if (document.documentName === "Actor") {
      return DebugTrace.describeActor(document);
    }

    return {
      documentName: document.documentName ?? null,
      id: document.id ?? null,
      uuid: document.uuid ?? null,
      name: document.name ?? null
    };
  }

  static describeChanges(changes) {
    if (!changes || typeof changes !== "object") {
      return {
        keys: []
      };
    }

    return {
      keys: Object.keys(changes),
      hasSocketUpdate: DebugTrace.hasSocketUpdate(changes)
    };
  }

  static describeOptions(options) {
    if (!options || typeof options !== "object") {
      return {};
    }

    const described = {};
    for (const key of ["render", "diff", "recursive", "noHook", "keepId"]) {
      if (key in options) {
        described[key] = options[key];
      }
    }

    const moduleOptions = options[Constants.MODULE_ID];
    if (moduleOptions && typeof moduleOptions === "object") {
      described[Constants.MODULE_ID] = foundry?.utils?.deepClone?.(moduleOptions) ?? { ...moduleOptions };
    }

    return described;
  }

  static hasSocketUpdate(changes) {
    if (!changes || typeof changes !== "object") {
      return false;
    }

    const socketsPath = `flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`;
    const hasProperty = foundry?.utils?.hasProperty;
    if (typeof hasProperty === "function" && hasProperty(changes, socketsPath)) {
      return true;
    }

    return Object.keys(changes).some((key) => (
      key === socketsPath || key.startsWith(`${socketsPath}.`)
    ));
  }

  static #timestamp() {
    const now = typeof performance?.now === "function" ? performance.now() : Date.now();
    return Number(now).toFixed(1);
  }

  static #normalizePayload(payload) {
    return payload && typeof payload === "object"
      ? foundry?.utils?.deepClone?.(payload) ?? payload
      : payload;
  }

  static #resolveElement(element) {
    if (!element) {
      return null;
    }
    if (element.jquery || typeof element.get === "function") {
      return element[0] ?? element.get(0) ?? null;
    }
    return element;
  }

  static #forceHighestZIndex(app) {
    const element = DebugTrace.#resolveElement(app?.element);
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const highest = DebugTrace.#highestKnownZIndex();
    const next = highest + 5;

    try {
      if (typeof app?.setPosition === "function") {
        app.setPosition({ zIndex: next });
      }
    } catch {
      // Keep the DOM fallback below.
    }

    element.style.zIndex = String(next);
  }

  static #focusAppElement(app) {
    const element = DebugTrace.#resolveElement(app?.element);
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
    }

    try {
      element.focus({ preventScroll: true });
    } catch {
      try {
        element.focus();
      } catch {
        // Ignore focus failures.
      }
    }
  }

  static #highestKnownZIndex() {
    const values = [];
    const push = (app) => {
      const element = DebugTrace.#resolveElement(app?.element);
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const inline = Number(element.style.zIndex);
      if (Number.isFinite(inline) && inline > 0) {
        values.push(inline);
      }

      const computed = Number(DebugTrace.#readComputedZIndex(element));
      if (Number.isFinite(computed) && computed > 0) {
        values.push(computed);
      }

      const positionZ = Number(app?.position?.zIndex);
      if (Number.isFinite(positionZ) && positionZ > 0) {
        values.push(positionZ);
      }
    };

    for (const app of Object.values(ui?.windows ?? {})) {
      push(app);
    }

    const applicationInstances = foundry?.applications?.instances;
    const instances = applicationInstances instanceof Map
      ? Array.from(applicationInstances.values())
      : Array.isArray(applicationInstances)
        ? applicationInstances
        : applicationInstances && typeof applicationInstances === "object"
          ? Object.values(applicationInstances)
          : [];

    for (const app of instances) {
      push(app);
    }

    return values.length ? Math.max(...values) : 0;
  }

  static #readComputedZIndex(element) {
    if (!element || typeof getComputedStyle !== "function") {
      return null;
    }

    try {
      return getComputedStyle(element).zIndex ?? null;
    } catch {
      return null;
    }
  }

  static #describePosition(position) {
    if (!position || typeof position !== "object") {
      return null;
    }

    return {
      left: position.left ?? null,
      top: position.top ?? null,
      width: position.width ?? null,
      height: position.height ?? null,
      zIndex: position.zIndex ?? null
    };
  }
}
