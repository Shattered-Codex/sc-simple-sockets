import { Constants } from "./Constants.js";

export class SheetExtension {
  // Registry per sheetClass: { installed:boolean, injectors: Map<partId, Set<fn>> }
  static #registry = new WeakMap();

  constructor(sheetClass, { moduleId = Constants.MODULE_ID, blankTemplatePath } = {}) {
    if (typeof sheetClass !== "function") {
      throw new Error("SheetExtension: invalid sheetClass (expected a constructor).");
    }
    this.sheetClass = sheetClass;
    this.moduleId = moduleId;
    this.blankTemplatePath = blankTemplatePath ?? `modules/${moduleId}/templates/_blank-part.hbs`;

    this.#ensurePreparePartContextWrapper();
  }

  /**
   * Checks if an item meets the provided rules.
   * @param {Item} item
   * @param {Object} [opts]
   * @param {string|string[]} [opts.types]                     - Allowed types (item.type).
   * @param {string|string[]|RegExp|Function} [opts.subtype]   - Rule for subtype (value at subtypePath).
   * @param {string} [opts.subtypePath="system.type.value"]    - Subtype path (getProperty).
   * @param {boolean} [opts.caseInsensitive=true]
   * @returns {boolean}
   */
  static qualifies(item, {
    types,
    subtype,
    subtypePath = "system.type.value",
    caseInsensitive = true
  } = {}) {
    if (!item) return false;

    // Types
    if (types && (Array.isArray(types) ? types.length : true)) {
      const allow = Array.isArray(types) ? types : [types];
      const norm = v => (caseInsensitive && typeof v === "string") ? v.toLowerCase() : v;
      if (!allow.map(norm).includes(norm(item.type))) return false;
    }

    // Subtype
    if (typeof subtype !== "undefined") {
      const val = foundry?.utils?.getProperty?.(item, subtypePath);
      const norm = v => (caseInsensitive && typeof v === "string") ? v.toLowerCase() : v;

      if (typeof subtype === "function") return !!subtype(val, item);
      if (subtype instanceof RegExp) return subtype.test(String(val ?? ""));
      if (Array.isArray(subtype)) return new Set(subtype.map(norm)).has(norm(val));
      return norm(val) === norm(subtype);
    }

    return true;
  }

  /**
   * Returns a condition function for a sheet based on item qualification rules.
   * @param {Object} rules - Rules to pass to qualifies().
   * @returns {Function} - Function that takes an item and returns a boolean.
   */
  makeItemCondition(rules) {
    return (item) => SheetExtension.qualifies(item, rules);
  }

  /**
   * Adds a tab to the AppV2 of the given sheet class.
   * @param {Object} def
   * @param {string} def.tab                - Tab ID
   * @param {string} def.label              - Tab label
   * @param {(sheet:any)=>boolean} [def.condition] - If absent, always visible
   */
  addTab({ tab, label, condition } = {}) {
    if (!tab || !label) throw new Error("addTab: 'tab' and 'label' are required.");
    const Sheet = this.sheetClass;
    Sheet.TABS = Array.isArray(Sheet.TABS) ? Sheet.TABS : [];
    const exists = Sheet.TABS.some(t => t?.tab === tab);
    if (!exists) {
      Sheet.TABS.push({
        tab,
        label,
        condition: (typeof condition === "function") ? condition : () => true
      });
    }
  }

  /**
   * Updates the condition of an existing tab.
   * @param {string} tabId
   * @param {Function} predicate
   * @param {Object} [opts]
   * @param {"and"|"or"|"replace"} [opts.mode="and"]
   * @returns {boolean}
   */
  updateTabCondition(tabId, predicate, { mode = "and" } = {}) {
    const Sheet = this.sheetClass;
    Sheet.TABS = Array.isArray(Sheet.TABS) ? Sheet.TABS : [];
    const idx = Sheet.TABS.findIndex(t => t?.tab === tabId);
    if (idx === -1) {
      console.warn(`${Sheet.name}: TAB "${tabId}" not found.`);
      return false;
    }
    const tab = Sheet.TABS[idx];
    const prev = (typeof tab.condition === "function") ? tab.condition : () => true;

    const combined = (mode === "replace") ? predicate
      : (mode === "or") ? (item) => prev(item) || predicate(item)
        : (item) => prev(item) && predicate(item);
    Sheet.TABS[idx] = { ...tab, condition: combined };
    return true;
  }

  /**
   * Registers a PART (no getData). To pass data to the template, use injectContext(partId, fn).
   */
  addPart({ id, tab, template, setup, replace = false } = {}) {
    if (!id || !tab) throw new Error("addPart: 'id' and 'tab' are required.");
    const Sheet = this.sheetClass;
    Sheet.PARTS = Sheet.PARTS ?? {};

    if (replace || !Sheet.PARTS[id]) {
      Sheet.PARTS[id] = {
        id,
        tab,
        template: template || this.blankTemplatePath,
        ...(setup ? { setup } : {})
      };
      return;
    }

    const current = Sheet.PARTS[id];
    const next = { ...current };
    if (template) next.template = template;
    if (tab) next.tab = tab;
    if (setup) next.setup = setup;
    Sheet.PARTS[id] = next;
  }

  /**
   * Registers a function to mutate/return data for the context of the corresponding PART.
   */
  addContext(partId, fn) {
    if (!partId || typeof fn !== "function") {
      throw new Error("addContext: invalid parameters.");
    }
    const rec = this.#getOrCreateRecord();
    let set = rec.injectors.get(partId);
    if (!set) {
      set = new Set();
      rec.injectors.set(partId, set);
    }
    set.add(fn);
  }

  /**
   * Registers actions in the sheet's DEFAULT_OPTIONS.actions.
   * @param {Object} actions
   */
  addActions(actions = {}) {
    const Sheet = this.sheetClass;
    Sheet.DEFAULT_OPTIONS ??= {};
    Sheet.DEFAULT_OPTIONS.actions ??= {};
    foundry.utils.mergeObject(Sheet.DEFAULT_OPTIONS.actions, actions, { inplace: true });
  }

  /**
   * Clones an existing PART to another tab.
   * @param {Object} opts
   * @param {string} opts.fromId
   * @param {string} opts.toId
   * @param {string} opts.tab
   */
  addExistingPartToTab({ fromId, toId, tab } = {}) {
    if (!fromId || !toId || !tab) throw new Error("addExistingPartToTab: 'fromId', 'toId' and 'tab' are required.");
    const Sheet = this.sheetClass;
    Sheet.PARTS = Sheet.PARTS ?? {};
    const base = Sheet.PARTS[fromId];
    if (!base) throw new Error(`addExistingPartToTab: PART "${fromId}" not found in ${Sheet.name}.`);
    const clone = foundry.utils.deepClone(base);
    clone.id = toId;
    clone.tab = tab;
    if (!Sheet.PARTS[toId]) Sheet.PARTS[toId] = clone;
  }

  #getOrCreateRecord() {
    let rec = SheetExtension.#registry.get(this.sheetClass);
    if (!rec) {
      rec = { installed: false, injectors: new Map() };
      SheetExtension.#registry.set(this.sheetClass, rec);
    }
    return rec;
  }

  #ensurePreparePartContextWrapper({ method = "_preparePartContext" } = {}) {
    const rec = this.#getOrCreateRecord();
    if (rec.installed) return;
    rec.installed = true;

    const Cls = this.sheetClass;
    const proto = Cls?.prototype;
    const moduleId = this.moduleId;

    const original = proto?.[method];
    if (typeof original !== "function") {
      console.warn(`[${moduleId}] ${Cls?.name ?? "Sheet"}.prototype.${method} not found – nothing to wrap.`);
      return;
    }

    // Runs the original and then all injectors for the part
    const run = async function (partId, context, options, callOriginal) {
      context = await callOriginal(partId, context, options);
      const { injectors } = SheetExtension.#registry.get(Cls) ?? {};
      const fns = injectors?.get(partId);
      if (fns?.size) {
        for (const fn of fns) {
          const out = await fn(this, context);
          if (out && out !== context && typeof out === "object") {
            foundry.utils.mergeObject(context, out, { inplace: true });
          }
        }
      }
      return context;
    };

    const wrapInvoker = function (wrapped, partId, context, options) {
      return run.call(this, partId, context, options, (...args) => wrapped.call(this, ...args));
    };

    // Attempts to resolve a global string path for libWrapper registration
    const resolveGlobalPath = () => {
      if (globalThis.dnd5e?.applications?.item?.ItemSheet5e === Cls) {
        return `dnd5e.applications.item.ItemSheet5e.prototype.${method}`;
      }
      for (const key of Object.keys(globalThis)) {
        try {
          if (globalThis[key] === Cls) return `${key}.prototype.${method}`;
        } catch { /* ignore problematic getters */ }
      }
      return null;
    };

    const installWithLibWrapperString = () => {
      const targetStr = resolveGlobalPath();
      if (!targetStr) return false;
      libWrapper.register(
        moduleId,
        targetStr,
        function (wrapped, partId, context, options) {
          return wrapInvoker.call(this, wrapped, partId, context, options);
        },
        "WRAPPER"
      );
      return true;
    };

    const install = () => {
      if (globalThis.libWrapper?.register) {
        try {
          const ok = installWithLibWrapperString();
          if (ok) return;
          console.warn(`[${moduleId}] Could not resolve global string path for ${Cls.name}.${method}. Falling back to monkey patch.`);
        } catch (e) {
          console.error(`[${moduleId}] Failed to register libWrapper on ${Cls.name}.${method}`, e);
        }
      }

      // Fallback: safe monkey-patch
      const _orig = original;
      proto[method] = function (partId, context, options) {
        return wrapInvoker.call(this, _orig, partId, context, options);
      };
    };

    if (globalThis.libWrapper) Hooks.once("libWrapper.Ready", install);
    else install();
  }
}
