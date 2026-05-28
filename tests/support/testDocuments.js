import { deepClone, getProperty, setProperty, TestCollection } from "./foundryStubs.js";

function deleteByPatchPath(target, path) {
  const marker = ".-=";
  const markerIndex = path.indexOf(marker);
  if (markerIndex === -1) {
    return false;
  }

  const basePath = path.slice(0, markerIndex);
  const deleteKey = path.slice(markerIndex + marker.length);
  const parent = getProperty(target, basePath);
  if (parent && typeof parent === "object") {
    delete parent[deleteKey];
  }
  return true;
}

export function applyPatch(target, patch) {
  for (const [path, value] of Object.entries(patch ?? {})) {
    if (path === "_id") {
      continue;
    }

    if (deleteByPatchPath(target, path)) {
      continue;
    }

    setProperty(target, path, deepClone(value));
  }

  return target;
}

export function createEffect(data = {}) {
  const effect = {
    id: data.id ?? data._id ?? randomId("effect"),
    _id: data._id ?? data.id ?? undefined,
    name: data.name ?? "Effect",
    img: data.img ?? "icons/effect.webp",
    flags: deepClone(data.flags ?? {}),
    type: data.type ?? "base",
    disabled: Boolean(data.disabled),
    origin: data.origin ?? null,
    toObject() {
      return deepClone({
        _id: effect.id,
        id: effect.id,
        name: effect.name,
        img: effect.img,
        flags: effect.flags,
        type: effect.type,
        disabled: effect.disabled,
        origin: effect.origin
      });
    }
  };

  return effect;
}

export function createTestItem(data = {}) {
  const item = {
    id: data.id ?? randomId("item"),
    uuid: data.uuid ?? `Item.${data.id ?? randomId("item")}`,
    name: data.name ?? "Item",
    img: data.img ?? "icons/item.webp",
    type: data.type ?? "loot",
    system: deepClone(data.system ?? {}),
    flags: deepClone(data.flags ?? {}),
    actor: data.actor ?? null,
    parent: data.parent ?? data.actor ?? null,
    pack: data.pack ?? null,
    documentName: "Item",
    effects: {
      contents: Array.isArray(data.effects)
        ? data.effects.map((effect) => createEffect(effect))
        : []
    },
    getFlag(moduleId, key) {
      return getProperty(item.flags, `${moduleId}.${key}`);
    },
    async setFlag(moduleId, key, value) {
      setProperty(item.flags, `${moduleId}.${key}`, deepClone(value));
      return value;
    },
    async unsetFlag(moduleId, key) {
      const moduleFlags = item.flags[moduleId];
      if (moduleFlags && typeof moduleFlags === "object") {
        delete moduleFlags[key];
      }
    },
    updateSource(update) {
      applyPatch(item, update);
      return item;
    },
    async update(update) {
      applyPatch(item, update);
      return item;
    },
    toObject() {
      return deepClone({
        _id: item.id,
        id: item.id,
        name: item.name,
        img: item.img,
        type: item.type,
        system: item.system,
        flags: item.flags
      });
    },
    async createEmbeddedDocuments(documentName, payloads) {
      if (documentName !== "ActiveEffect") {
        return [];
      }
      const created = payloads.map((payload) => createEffect(payload));
      item.effects.contents.push(...created);
      return created;
    },
    async deleteEmbeddedDocuments(documentName, ids) {
      if (documentName !== "ActiveEffect") {
        return [];
      }
      item.effects.contents = item.effects.contents.filter((effect) => !ids.includes(effect.id));
      return [];
    },
    createActivity: data.createActivity ?? (async () => null)
  };

  if (!Object.prototype.hasOwnProperty.call(item.system, "activities") && data.includeActivitiesField) {
    item.system.activities = {};
  }

  return item;
}

export function createTestActor(data = {}) {
  const actor = {
    id: data.id ?? randomId("actor"),
    uuid: data.uuid ?? `Actor.${data.id ?? randomId("actor")}`,
    name: data.name ?? "Actor",
    documentName: "Actor",
    items: new TestCollection(),
    async updateEmbeddedDocuments(documentName, updates) {
      if (documentName !== "Item") {
        return [];
      }
      return updates.map((update) => {
        const item = actor.items.get(update._id);
        if (!item) {
          throw new Error(`Missing item ${update._id}`);
        }
        applyPatch(item, update);
        return item;
      });
    },
    async createEmbeddedDocuments(documentName, payloads) {
      if (documentName !== "Item") {
        return [];
      }

      const created = payloads.map((payload) => {
        const item = createTestItem({
          ...payload,
          id: payload.id ?? payload._id ?? randomId("item"),
          actor,
          parent: actor,
          includeActivitiesField: true
        });
        actor.items.set(item.id, item);
        return item;
      });
      return created;
    },
    async deleteEmbeddedDocuments(documentName, ids) {
      if (documentName !== "Item") {
        return [];
      }
      ids.forEach((id) => actor.items.delete(id));
      return [];
    }
  };

  for (const sourceItem of data.items ?? []) {
    const item = sourceItem.actor ? sourceItem : createTestItem({
      ...sourceItem,
      actor,
      parent: actor,
      includeActivitiesField: sourceItem.includeActivitiesField ?? true
    });
    item.actor = actor;
    item.parent = actor;
    actor.items.set(item.id, item);
  }

  return actor;
}

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
