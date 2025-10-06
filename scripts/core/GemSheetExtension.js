import { SheetExtension } from "./SheetExtension.js";
import { GemCriteria } from "../domain/gems/GemCriteria.js";

export class GemSheetExtension extends SheetExtension {

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
}


