import { Constants } from "./Constants.js";
import { SheetExtension } from "./SheetExtension.js";
import { GemCriteria } from "../domain/gems/GemCriteria.js";

export class GemSheetExtension extends SheetExtension {

  static #activitiesPatched = false;

  #criteria;
  #condition;

  constructor({
    sheetClass = dnd5e.applications.item.ItemSheet5e,
    criteria = GemCriteria
  } = {}) {
    super(sheetClass);
    this.#criteria = criteria;
    this.#condition = this.#resolveCondition(criteria);
  }

  /**
     * Returns the criteria collaborator used to determine gem eligibility.
     * @returns {{ definition: object }}
     */
  get criteria() {
    return this.#criteria;
  }

  /**
     * Returns the predicate used to determine if the effects tab should render.
     * @returns {(item: Item|object) => boolean}
     */
  get condition() {
    return this.#condition;
  }

  applyChanges() {
    this.updateTabCondition("effects", this.#condition, { mode: "or" });
    this.#registerGemTargetFilter();
    const Sheet = this.sheetClass;
    const activityTab = Array.isArray(Sheet.TABS)
      ? Sheet.TABS.find((tab) => tab?.tab === "activities")
      : null;
    const previousCondition = (typeof activityTab?.condition === "function")
      ? activityTab.condition
      : () => true;
    this.updateTabCondition(
      "activities",
      (item) => {
        if (item?.type === Constants.ITEM_TYPE_LOOT) {
          return this.#condition(item);
        }
        return previousCondition(item);
      },
      { mode: "replace" }
    );
    this.#ensureActivitiesWrapper();
  }

  #registerGemTargetFilter() {
    const partId = "sc-sockets-gem-target-filter";
    this.addPart({
      id: partId,
      tab: "details",
      template: `modules/${this.moduleId}/templates/gem-target-filter.hbs`
    });

    this.addContext(partId, (sheet) => {
      const item = sheet?.item;
      const isGem = GemCriteria.matches(item);
      const stored = this.#getStoredAllowedTypes(item);
      const selected = stored.length ? stored : [Constants.GEM_ALLOWED_TYPES_ALL];
      const selectedMap = Object.fromEntries(selected.map((value) => [value, true]));
      const options = this.#applySelectionToOptions(this.#buildGemTargetOptions(), selectedMap);
      const node = sheet?.element?.querySelector?.(`[data-application-part="${partId}"]`);
      const isActive =
        node?.classList?.contains?.("active") ||
        sheet?.tabGroups?.primary === "details" ||
        sheet?._activeTab?.primary === "details";
      return {
        gemTargetFilter: {
          isGem,
          editable: !!(sheet?.isEditable && isGem),
          label: Constants.localize("SCSockets.GemTargetTypes.Label", "Allowed Item Types"),
          hint: Constants.localize("SCSockets.GemTargetTypes.Hint", "Choose which item subtypes can receive this gem."),
          selectId: `${partId}-select`,
          options,
          selected,
          selectedMap,
          allValue: Constants.GEM_ALLOWED_TYPES_ALL,
          part: {
            id: partId,
            tab: "details",
            group: "primary",
            cssClass: isActive ? "active" : ""
          }
        }
      };
    });
  }

  #resolveCondition(criteria) {
    if (!criteria) {
      return this.makeItemCondition();
    }

    if (typeof criteria?.matches === "function") {
      return (item) => criteria.matches(item);
    }

    if (typeof criteria?.matcher === "function") {
      return (item) => criteria.matcher(item);
    }

    const definition = criteria?.definition ?? criteria;
    return this.makeItemCondition(definition);
  }

  #ensureActivitiesWrapper() {
    if (GemSheetExtension.#activitiesPatched) {
      return;
    }

    const evaluate = function (item, originalResult) {
      if (originalResult) {
        return true;
      }

      if (!GemCriteria.matches(item)) {
        return originalResult;
      }

      return true;
    };

    if (globalThis.libWrapper?.register) {
      libWrapper.register(
        Constants.MODULE_ID,
        "dnd5e.applications.item.ItemSheet5e.itemHasActivities",
        function (wrapped, item) {
          const result = wrapped.call(this, item);
          return evaluate(item, result);
        },
        "WRAPPER"
      );
    } else {
      const Sheet = this.sheetClass;
      const original = Sheet.itemHasActivities;
      if (typeof original === "function") {
        Sheet.itemHasActivities = function (item) {
          const result = original.call(this, item);
          return evaluate(item, result);
        };
      }
    }

    GemSheetExtension.#activitiesPatched = true;
  }

  #getStoredAllowedTypes(item) {
    const raw = item?.getFlag(Constants.MODULE_ID, Constants.FLAG_GEM_ALLOWED_TYPES);
    if (!Array.isArray(raw)) {
      return [];
    }
    const unique = new Set();
    for (const value of raw) {
      if (typeof value === "string" && value.trim().length) {
        unique.add(value);
      }
    }
    return Array.from(unique);
  }

  #buildGemTargetOptions() {
    const options = [];

    options.push({
      value: Constants.GEM_ALLOWED_TYPES_ALL,
      label: Constants.localize("SCSockets.GemTargetTypes.AllTypes", "All Types")
    });

    const dnd5e = CONFIG?.DND5E;
    if (!dnd5e) {
      return options;
    }

    const groups = [
      {
        label: Constants.localize("SCSockets.GemTargetTypes.Groups.Weapons", "Weapons"),
        entries: this.#normalizeCollection(dnd5e.weaponTypes),
        prefix: "weapon"
      },
      {
        label: Constants.localize("SCSockets.GemTargetTypes.Groups.Equipment", "Equipment"),
        entries: this.#normalizeCollection(dnd5e.equipmentTypes),
        prefix: "equipment"
      }
    ];

    for (const group of groups) {
      if (!group.entries.length) {
        continue;
      }
      options.push({
        label: group.label,
        options: group.entries
          .map(([key, value]) => ({
            value: `${group.prefix}:${key}`,
            label: this.#localizeConfigLabel(value, key)
          }))
          .sort((a, b) => a.label.localeCompare(b.label, game?.i18n?.lang ?? undefined))
      });
    }

    return options;
  }

  #applySelectionToOptions(options, selectedMap) {
    if (!Array.isArray(options)) return [];
    return options.map((entry) => {
      if (entry?.options) {
        return {
          ...entry,
          options: entry.options.map((opt) => ({
            ...opt,
            selected: !!selectedMap?.[opt.value]
          }))
        };
      }
      return {
        ...entry,
        selected: !!selectedMap?.[entry?.value]
      };
    });
  }

  #normalizeCollection(collection) {
    if (!collection) {
      return [];
    }
    if (collection instanceof Map) {
      return Array.from(collection.entries());
    }
    if (Array.isArray(collection)) {
      return collection.map((value, index) => [String(index), value]);
    }
    if (typeof collection === "object") {
      return Object.entries(collection);
    }
    return [];
  }

  #localizeConfigLabel(value, fallback) {
    if (value && typeof value === "object") {
      if (typeof value.label === "string") {
        return this.#localizeString(value.label, fallback);
      }
      if (typeof value.name === "string") {
        return this.#localizeString(value.name, fallback);
      }
    }
    if (typeof value === "string") {
      return this.#localizeString(value, fallback);
    }
    return this.#formatFallbackLabel(fallback);
  }

  #localizeString(key, fallback) {
    const localized = game?.i18n?.localize?.(key);
    if (localized && localized !== key) {
      return localized;
    }
    return key ?? this.#formatFallbackLabel(fallback);
  }

  #formatFallbackLabel(key) {
    if (!key) return "";
    const formatted = key.replace(/([A-Z])/g, " $1").replace(/[-_:]/g, " ");
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
}
