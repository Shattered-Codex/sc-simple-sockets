function splitPath(path) {
  return String(path ?? "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export class TestCollection extends Map {
  [Symbol.iterator]() {
    return this.values();
  }

  find(predicate) {
    for (const value of this.values()) {
      if (predicate(value)) {
        return value;
      }
    }
    return undefined;
  }

  map(callback) {
    return Array.from(this.values()).map(callback);
  }
}

export function deepClone(value) {
  if (value == null) {
    return value;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

export function mergeObject(original = {}, other = {}, { inplace = true } = {}) {
  const target = inplace ? original : deepClone(original ?? {});
  for (const [key, value] of Object.entries(other ?? {})) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && target[key]
      && typeof target[key] === "object"
      && !Array.isArray(target[key])
    ) {
      target[key] = mergeObject(target[key], value, { inplace: true });
      continue;
    }

    target[key] = deepClone(value);
  }
  return target;
}

export function flattenObject(object, prefix = "") {
  const flat = {};
  for (const [key, value] of Object.entries(object ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(flat, flattenObject(value, path));
      continue;
    }
    flat[path] = value;
  }
  return flat;
}

export function getType(value) {
  if (Array.isArray(value)) {
    return "Array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value === "object"
    ? value.constructor?.name ?? "Object"
    : typeof value;
}

export function getProperty(object, path) {
  return splitPath(path).reduce(
    (current, segment) => (current == null ? undefined : current[segment]),
    object
  );
}

export function hasProperty(object, path) {
  const segments = splitPath(path);
  if (!segments.length) {
    return false;
  }

  let current = object;
  for (const segment of segments) {
    if (current == null || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    current = current[segment];
  }

  return true;
}

export function setProperty(object, path, value) {
  const segments = splitPath(path);
  if (!segments.length) {
    return object;
  }

  let current = object;
  while (segments.length > 1) {
    const segment = segments.shift();
    if (!Object.prototype.hasOwnProperty.call(current, segment) || current[segment] == null) {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[segments[0]] = value;
  return object;
}

const managedGlobals = new Map();

function setManagedGlobal(name, value) {
  if (!managedGlobals.has(name)) {
    managedGlobals.set(name, globalThis[name]);
  }

  globalThis[name] = value;
}

export function installFoundryStubs({
  isGM = false,
  settings = {},
  translations = {},
  textEditorImplementation = null,
  items = [],
  actors = [],
  modules = [],
  user = null,
  applications = []
} = {}) {
  const settingsStore = new Map(Object.entries(settings));
  const translationStore = new Map(Object.entries(translations));
  const registeredSettings = new Map(
    Array.from(settingsStore.keys()).map((key) => [key, { key }])
  );
  const itemCollection = new TestCollection(items.map((item) => [item.id, item]));

  setManagedGlobal("foundry", {
    utils: {
      deepClone,
      duplicate: deepClone,
      getProperty,
      getType,
      flattenObject,
      hasProperty,
      mergeObject,
      setProperty,
      debounce(fn) {
        return fn;
      }
    },
    applications: {
      instances: applications,
      ux: {
        TextEditor: textEditorImplementation
          ? { implementation: textEditorImplementation }
          : null
      }
    }
  });

  setManagedGlobal("game", {
    userId: user?.id ?? "test-user",
    user: user ?? {
      id: "test-user",
      isGM,
      hasRole() {
        return false;
      }
    },
    i18n: {
      localize(key) {
        return translationStore.get(key) ?? key;
      },
      has(key) {
        return translationStore.has(key);
      }
    },
    settings: {
      settings: registeredSettings,
      get(moduleId, key) {
        return settingsStore.get(`${moduleId}.${key}`);
      },
      async set(moduleId, key, value) {
        settingsStore.set(`${moduleId}.${key}`, value);
        registeredSettings.set(`${moduleId}.${key}`, { key: `${moduleId}.${key}` });
        return value;
      }
    },
    modules: new Map(modules),
    items: itemCollection,
    actors
  });

  setManagedGlobal("ui", {
    windows: {},
    notifications: {
      warn(message) {
        return message;
      },
      info(message) {
        return message;
      },
      error(message) {
        return message;
      }
    }
  });

  setManagedGlobal("CONFIG", {});
  setManagedGlobal("CONST", {});
  setManagedGlobal("Hooks", {
    on() {},
    off() {},
    once() {},
    callAll() {}
  });

  return {
    itemCollection,
    registeredSettings,
    settingsStore,
    translationStore
  };
}

export function clearFoundryStubs() {
  for (const [name, previousValue] of managedGlobals.entries()) {
    if (previousValue === undefined) {
      delete globalThis[name];
      continue;
    }

    globalThis[name] = previousValue;
  }

  managedGlobals.clear();
}
