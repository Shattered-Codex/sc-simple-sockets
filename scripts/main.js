import { Constants } from "./core/Constants.js";
import { GemSheetExtension } from "./core/GemSheetExtension.js";
import { ItemSocketExtension } from "./core/ItemSocketExtension.js";
import { ActorGemBadges } from "./core/ui/ActorGemBadges.js";
import { GemLifecycleService } from "./domain/gems/GemLifecycleService.js";
import { ModuleSettings } from "./core/settings/ModuleSettings.js";
import { ModuleSettingsRegistrar } from "./core/settings/ModuleSettingsRegistrar.js";
import { LootActivitiesExtension } from "./domain/gems/LootActivitiesExtension.js";
import { GemLootTypeExtension } from "./domain/gems/GemLootTypeExtension.js";
import { ItemActivityBadges } from "./core/ui/ItemActivityBadges.js";
import { TransferFilterUI } from "./core/ui/TransferFilterUI.js";
import { SocketTooltipUI } from "./core/ui/SocketTooltipUI.js";
import { MacroAPI } from "./core/api/MacroAPI.js";
import { SocketAPI } from "./core/api/SocketAPI.js";
import { TidyIntegration } from "./core/integration/TidyIntegration.js";
import { GemDetailsUI } from "./core/ui/GemDetailsUI.js";
import { GemSocketDescriptionUI } from "./core/ui/GemSocketDescriptionUI.js";
import { SocketDescriptionsUI } from "./core/ui/SocketDescriptionsUI.js";
import { GemDamageService } from "./domain/gems/GemDamageService.js";
import { DamageRollGemLayout } from "./core/ui/DamageRollGemLayout.js";
import { ActivityTransferService } from "./core/services/ActivityTransferService.js";
import { maybeShowSupportCard } from "./core/support/supportCard.js";
import { DataMigration } from "./core/migration/DataMigration.js";
import { Compatibility } from "./core/support/Compatibility.js";
import { ItemSheetSync } from "./core/support/ItemSheetSync.js";

const gemSheet = new GemSheetExtension();
const itemSocketSheet = new ItemSocketExtension();
const lifecycle = new GemLifecycleService();
MacroAPI.register();
SocketAPI.register();
TidyIntegration.register({
  gemSheetExtension: gemSheet,
  itemSocketExtension: itemSocketSheet
});

Hooks.once("init", async function() {
  if (Constants.isDebugEnabled()) {
    console.log(`${Constants.MODULE_ID} | init`);
  }
  const settings = new ModuleSettingsRegistrar();

  // Everything below runs synchronously before the first `await` so that
  // CONFIG.Item.dataModels.loot is patched and all settings are registered
  // before Foundry creates item instances and before `setup`/`ready` fire.
  // Foundry does NOT await async hook callbacks, so anything after an `await`
  // may execute after later hooks have already run.
  settings.registerSettings();
  GemLootTypeExtension.ensure();
  LootActivitiesExtension.ensure();

  await loadTemplates([
    `modules/${Constants.MODULE_ID}/templates/item-socket-details-toggle.hbs`
  ]);

  await settings.register();
});

Hooks.once("setup", () => {
  if (Constants.isDebugEnabled()) {
    console.log(`${Constants.MODULE_ID} | setup`);
  }

  gemSheet.applyChanges();
  itemSocketSheet.applyChanges();
  ActorGemBadges.activate();
  ItemActivityBadges.activate();
  TransferFilterUI.activate();
  SocketTooltipUI.activate();
  GemDetailsUI.activate();
  GemSocketDescriptionUI.activate();
  SocketDescriptionsUI.activate();
  ItemSheetSync.activate();

});

Hooks.once("ready", async () => {
  if (!Compatibility.isSupportedDnd5eVersion()) {
    const version = Compatibility.getDnd5eVersion() || "unknown";
    const message = `${Constants.MODULE_ID} requires dnd5e ${Compatibility.MINIMUM_DND5E_VERSION}+; current version: ${version}.`;
    console.warn(`[${Constants.MODULE_ID}] ${message}`);
    ui.notifications?.warn?.(message);
  }

  await DataMigration.run();
  await lifecycle.syncGemSubtypeFlags();
  GemDamageService.activate();
  const mode = ModuleSettings.shouldUseGemRollLayout() ? "gem" : "type";
  DamageRollGemLayout.activate({ mode });
  await maybeShowSupportCard();
});

Hooks.on("preUpdateItem", (item, changes, options) => {
  try {
    lifecycle.handlePreUpdate(item, changes, options);
  } catch (e) {
    console.error(`[${Constants.MODULE_ID}] handlePreUpdate failed:`, e);
  }
});

Hooks.on("updateItem", async (item, changes, options) => {
  try {
    await lifecycle.handleItemUpdated(item, changes, options);
    await ActivityTransferService.reconcileDerivedActivities(item, changes, options);
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
