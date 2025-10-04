// GemSheetExtension.js
import { SheetExtension } from "./SheetExtension.js";
import { Constants } from "./Constants.js";

export class GemSheetExtension extends SheetExtension {
  constructor() {
    super(dnd5e.applications.item.ItemSheet5e);
  }

  static getRules() {
    return {
      types: Constants.ITEM_TYPE_LOOT,
      subtype: Constants.ITEM_SUBTYPE_GEM
    };
  }

  applyChanges() {
    this.updateTabCondition(
      "effects",
      this.makeItemCondition(GemSheetExtension.getRules()),
      { mode: "or" }
    );

  }


}
