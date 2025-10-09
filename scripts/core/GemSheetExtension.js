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
      if (item?.type === Constants.ITEM_TYPE_LOOT && !GemCriteria.matches(item)) {
        return false;
      }
      if (originalResult) {
        return true;
      }
      return GemCriteria.matches(item);
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
}
