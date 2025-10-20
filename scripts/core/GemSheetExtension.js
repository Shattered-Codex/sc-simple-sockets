import { Constants } from "./Constants.js";
import { SheetExtension } from "./SheetExtension.js";
import { GemCriteria } from "../domain/gems/GemCriteria.js";
import { GemTargetFilterBuilder } from "../domain/gems/GemTargetFilterBuilder.js";

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

  /**
   * Determines whether the provided item qualifies as a gem according to the configured criteria.
   * @param {Item|object} item
   * @returns {boolean}
   */
  isGem(item) {
    return this.#condition(item);
  }

  /**
   * Produces the context consumed by the gem target filter template.
   * @param {ItemSheet} sheet
   * @param {Object} [options]
   * @param {string} [options.partId]
   * @param {string} [options.tab="details"]
   * @param {string} [options.group="primary"]
   * @param {boolean} [options.includeHints=true]
   * @returns {object}
   */
  buildGemTargetFilterContext(sheet, {
    partId,
    tab = "details",
    group = "primary",
    includeHints = true
  } = {}) {
    const item = sheet?.item ?? null;
    const isActive = partId ? this.#isPartActive(sheet, partId, tab) : false;

    return GemTargetFilterBuilder.buildContext(item, {
      editable: sheet?.isEditable,
      selectId: partId ? `${partId}-select` : undefined,
      part: partId ? {
        id: partId,
        tab,
        group,
        cssClass: isActive ? "active" : ""
      } : undefined,
      includeHints
    });
  }

  #registerGemTargetFilter() {
    const partId = "sc-sockets-gem-target-filter";
    this.addPart({
      id: partId,
      tab: "details",
      template: `modules/${this.moduleId}/templates/gem-target-filter.hbs`
    });

    this.addContext(partId, (sheet) => {
      const filter = this.buildGemTargetFilterContext(sheet, { partId });
      return {
        gemTargetFilter: filter
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

  #isPartActive(sheet, partId, tab) {
    if (!sheet) {
      return false;
    }
    const node = sheet.element?.querySelector?.(`[data-application-part="${partId}"]`);
    if (node?.classList?.contains?.("active")) {
      return true;
    }
    if (sheet.tabGroups?.primary === tab) {
      return true;
    }
    if (sheet._activeTab?.primary === tab) {
      return true;
    }
    return false;
  }
}
