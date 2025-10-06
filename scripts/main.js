import { Constants } from "./core/Constants.js";
import { SheetExtension } from "./core/SheetExtension.js";
import { GemSheetExtension } from "./core/GemSheetExtension.js";
import { ItemSocketExtension } from "./core/ItemSocketExtension.js";
import { ActorGemBadges } from "./core/ui/ActorGemBadges.js";
import { GemLifecycleService } from "./domain/gems/GemLifecycleService.js";

const gemSheet = new GemSheetExtension();
const itemSocketSheet = new ItemSocketExtension();
const lifecycle = new GemLifecycleService();

Hooks.once("setup", () => {
  console.log(`${Constants.MODULE_ID} | setup`);

  gemSheet.applyChanges();
  itemSocketSheet.applyChanges();
  ActorGemBadges.activate();

});

Hooks.on("updateItem", async (item, changes) => {
  try {
    await lifecycle.handleItemUpdated(item, changes);
  } catch (e) {
    console.error(`[${Constants.MODULE_ID}] handleItemUpdated failed:`, e);
  }
});

Hooks.on("preCreateItem", (item, data) => {
  try {
    lifecycle.handlePreCreate(item, data);
  } catch (e) {
    console.error(`[${Constants.MODULE_ID}] handlePreCreate failed:`, e);
  }

});
