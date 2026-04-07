import { Constants } from "../Constants.js";

export class ItemSheetSync {
  static #active = false;
  static #updateHandler = null;

  static activate() {
    if (ItemSheetSync.#active) {
      return;
    }

    ItemSheetSync.#updateHandler = (item, changes) => {
      if (!ItemSheetSync.hasSocketUpdate(changes)) {
        return;
      }
      ItemSheetSync.refreshOpenSheets(item);
    };

    Hooks.on("updateItem", ItemSheetSync.#updateHandler);
    ItemSheetSync.#active = true;
  }

  static resolve(item) {
    if (!item?.id) {
      return item ?? null;
    }

    const root = ItemSheetSync.#resolveRootItem(item);

    const byUuid = ItemSheetSync.#resolveByUuid(root?.uuid);
    if (byUuid) {
      return byUuid;
    }

    const embedded = root?.parent?.items?.get?.(root.id);
    if (embedded) {
      return embedded;
    }

    const actorItem = root?.actor?.items?.get?.(root.id);
    if (actorItem) {
      return actorItem;
    }

    const worldItem = game?.items?.get?.(root.id);
    if (worldItem) {
      return worldItem;
    }

    return root ?? item;
  }

  static syncSheetDocument(sheet, item) {
    const next = ItemSheetSync.resolve(item);
    if (!sheet || !next) {
      return next ?? null;
    }

    try {
      if (sheet.document !== next) {
        sheet.document = next;
      }
    } catch {
      // Some sheet implementations may not expose a writable document property.
    }

    try {
      if (sheet.object?.documentName === "Item" && sheet.object !== next) {
        sheet.object = next;
      }
    } catch {
      // Keep going if the sheet object is not writable.
    }

    return next;
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

  static refreshOpenSheets(item) {
    const current = ItemSheetSync.resolve(item);
    if (!current) {
      return;
    }

    for (const app of ItemSheetSync.#collectOpenSheets(current)) {
      ItemSheetSync.syncSheetDocument(app, current);
      app.render(true);
    }
  }

  static #collectOpenSheets(item) {
    const apps = new Set();

    const applicationInstances = foundry?.applications?.instances;
    const instances = applicationInstances instanceof Map
      ? Array.from(applicationInstances.values())
      : Array.isArray(applicationInstances)
        ? applicationInstances
        : applicationInstances && typeof applicationInstances === "object"
          ? Object.values(applicationInstances)
          : [];

    for (const app of [...Object.values(ui?.windows ?? {}), ...instances]) {
      if (!app?.rendered || typeof app?.render !== "function") {
        continue;
      }

      const document = app.document ?? app.object ?? app.item ?? null;
      if (ItemSheetSync.#matchesItem(document, item)) {
        apps.add(app);
      }
    }

    return apps;
  }

  static #matchesItem(candidate, item) {
    if (!candidate || !item) {
      return false;
    }

    if (candidate === item || candidate?.uuid === item.uuid) {
      return true;
    }

    if (candidate?.documentName !== "Item" || candidate?.id !== item.id) {
      return false;
    }

    return (candidate.parent?.uuid ?? null) === (item.parent?.uuid ?? null);
  }

  static #resolveRootItem(item) {
    let current = item ?? null;
    const visited = new Set();

    while (current?.documentName === "Item" && current?.parent?.documentName === "Item") {
      const key = current.uuid ?? current.id ?? null;
      if (key && visited.has(key)) {
        break;
      }
      if (key) {
        visited.add(key);
      }
      current = current.parent;
    }

    return current ?? item ?? null;
  }

  static #resolveByUuid(uuid) {
    if (typeof uuid !== "string" || !uuid.length) {
      return null;
    }

    try {
      const syncResolved = typeof fromUuidSync === "function" ? fromUuidSync(uuid, { strict: false }) : null;
      if (syncResolved?.documentName === "Item") {
        return syncResolved;
      }
    } catch {
      // Fall through to collection lookups.
    }

    return null;
  }
}
