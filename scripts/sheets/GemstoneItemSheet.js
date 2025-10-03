import { Constants } from "../core/Constants.js";

export class GemstoneItemSheet extends dnd5e.applications.item.ItemSheet5e {

  static qualifies(item) {
    if (!item || item.type !== Constants.ITEM_TYPE_LOOT) {
      return false;
    }

    return foundry.utils.getProperty(item, "system.type.value") === Constants.ITEM_SUBTYPE_GEM;
  }

  static TABS = [
    ...super.TABS,
    {
      tab: "effects",
      label: "DND5E.ITEM.SECTIONS.Effects",
      condition: (item) => this.qualifies(item)
    },
  ];

  static async apply(item) {
    const current = item.getFlag("core", "sheetClass");
    if (current !== Constants.SHEET_ID) {
      await item.setFlag("core", "sheetClass", Constants.SHEET_ID);
    }
  }

  static registerSheet() {
    foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, Constants.MODULE_ID, this, {
      types: [Constants.ITEM_TYPE_LOOT],
      label: "Gem Sheet (Effects)",
      makeDefault: false
    });
  }

}
