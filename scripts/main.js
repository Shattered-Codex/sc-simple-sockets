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
import { SocketAPI } from "./core/api/SocketAPI.js";
import { TidyIntegration } from "./core/integration/TidyIntegration.js";
import { GemDetailsUI } from "./core/ui/GemDetailsUI.js";
import { GemSocketDescriptionUI } from "./core/ui/GemSocketDescriptionUI.js";
import { SocketDescriptionsUI } from "./core/ui/SocketDescriptionsUI.js";
import { GemDamageService } from "./domain/gems/GemDamageService.js";
import { DamageRollGemLayout } from "./core/ui/DamageRollGemLayout.js";

const PATREON_SUPPORT_CARD_URL = "https://www.patreon.com/c/shatteredcodex?utm_source=sc-simple-sockets&utm_medium=foundry_module&utm_campaign=support_card";

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
  GemDetailsUI.activate();
  GemSocketDescriptionUI.activate();
  SocketDescriptionsUI.activate();

});

Hooks.once("ready", async () => {
  GemDamageService.activate();
  const mode = ModuleSettings.shouldUseGemRollLayout() ? "gem" : "type";
  DamageRollGemLayout.activate({ mode });
  await ModuleSettings.suppressSupportCardOnModuleUpdate();
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

async function maybeShowSupportCard() {
  if (!game.user?.isGM) return;
  const hasSeen = game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_CARD);
  if (hasSeen) return;

  const userId = game.user?._id ?? game.user?.id ?? game.userId;

  await ChatMessage.create({
    user: userId,
    speaker: ChatMessage.getSpeaker(),
    content: buildSupportCard()
  });

  await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_SUPPORT_CARD, true);
}

function buildSupportCard() {
  const intro = Constants.localize(
    "SCSockets.SupportCard.Intro",
    "Support us on Patreon to keep the project alive."
  );
  const exclusive = Constants.localize(
    "SCSockets.SupportCard.Exclusive",
    "There you can find the exclusive module <strong>SC - More Gems</strong> with 70+ gems and monthly updates. We are also building <strong>SC - Setforge</strong> so you can create item sets."
  );
  const footer = Constants.localize(
    "SCSockets.SupportCard.Footer",
    "This chat card will only be shown once. Enable it again in the settings if needed."
  );
  const patreonLabel = Constants.localize("SCSockets.SupportCard.Link", "Patreon");

  return `
    <div style="padding: 5px;">
      <div style="color: #e7e7e7; padding: 10px; background-color: #212121; border: 3px solid #18c26a; border-radius: 10px;">
        <p style="text-align: center;">
          <a href="${PATREON_SUPPORT_CARD_URL}" target="_blank" rel="noopener">
            <img src="modules/sc-simple-sockets/assets/imgs/shattered-codex.png" alt="Shattered Codex" style="display: block; margin: 0 auto;">
          </a>
        </p>
        <hr>
        <div>
          <p style="text-align: justify;">${intro}</p>
          <p style="text-align: justify;">${exclusive}</p>
          <p style="text-align: center; line-height: 150%;">
            <a href="${PATREON_SUPPORT_CARD_URL}" target="_blank" rel="noopener">${patreonLabel}</a>
          </p>
        </div>
        <hr>
        <div style="font-style: italic;">
          <p style="text-align: justify;">${footer}</p>
        </div>
      </div>
    </div>
  `;
}
