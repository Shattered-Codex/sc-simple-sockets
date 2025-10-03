// GemSheetExtension.js
import { SheetExtension } from "./SheetExtension.js";
import { Constants } from "./Constants.js";

export class GemSheetExtension extends SheetExtension {
  constructor() {
    super(dnd5e.applications.item.ItemSheet5e);
  }

  static getRules() {
    return { types: "loot", subtype: "gem" };
  }

  applyChanges() {
    this.updateTabCondition(
      "effects",
      this.makeItemCondition(GemSheetExtension.getRules()),
      { mode: "or" }
    );

  }


}
