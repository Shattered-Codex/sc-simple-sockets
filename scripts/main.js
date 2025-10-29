import { Constants } from "./core/Constants.js";
import { GemSheetExtension } from "./core/GemSheetExtension.js";
import { ItemSocketExtension } from "./core/ItemSocketExtension.js";
import { ActorGemBadges } from "./core/ui/ActorGemBadges.js";
import { GemLifecycleService } from "./domain/gems/GemLifecycleService.js";
import { ModuleSettings } from "./core/settings/ModuleSettings.js";
import { LootActivitiesExtension } from "./domain/gems/LootActivitiesExtension.js";
import { GemLootTypeExtension } from "./domain/gems/GemLootTypeExtension.js";
import { ItemActivityBadges } from "./core/ui/ItemActivityBadges.js";
import { TransferFilterUI } from "./core/ui/TransferFilterUI.js";
import { SocketTooltipUI } from "./core/ui/SocketTooltipUI.js";
import { MacroAPI } from "./core/api/MacroAPI.js";
import { TidyIntegration } from "./core/integration/TidyIntegration.js";

const gemSheet = new GemSheetExtension();
const itemSocketSheet = new ItemSocketExtension();
const lifecycle = new GemLifecycleService();
MacroAPI.register();
TidyIntegration.register({
  gemSheetExtension: gemSheet,
  itemSocketExtension: itemSocketSheet
});

Hooks.once("init", async function() {
  console.log(`${Constants.MODULE_ID} | init`);
  
  const settings =  new ModuleSettings();
  await settings.register();

  GemLootTypeExtension.ensure();
  LootActivitiesExtension.ensure();
});

Hooks.once("setup", () => {
  console.log(`${Constants.MODULE_ID} | setup`);

  gemSheet.applyChanges();
  itemSocketSheet.applyChanges();
  ActorGemBadges.activate();
  ItemActivityBadges.activate();
  TransferFilterUI.activate();
  SocketTooltipUI.activate();

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
