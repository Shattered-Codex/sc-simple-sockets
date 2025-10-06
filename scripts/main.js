import { Constants } from "./core/Constants.js";
import { SheetExtension } from "./core/SheetExtension.js";
import { GemSheetExtension } from "./core/GemSheetExtension.js";
import { ItemSocketExtension } from "./core/ItemSocketExtension.js";
import { EffectHandler } from "./handlers/EffectHandler.js";
import { ActorGemBadges } from "./core/ui/ActorGemBadges.js";


const gemSheet = new GemSheetExtension();
const itemSocketSheet = new ItemSocketExtension();

Hooks.once("init", async function() {
  const roles = Object.keys(CONST.USER_ROLES)

  game.settings.register(Constants.MODULE_ID, "editSocketPermission", {
    name: "Edit Socket Permission",
    hint: "The minimum role required to add/remove sockets from items.",
    scope: "world",
    config: true,
    type: String,
    choices: roles,
    default: CONST.USER_ROLES.PLAYER,
  });
})

Hooks.once("setup", () => {
  console.log(`${Constants.MODULE_ID} | setup`);
  console.log("HELLO WORLD");
  gemSheet.applyChanges();
  itemSocketSheet.applyChanges();
  ActorGemBadges.init();

});


Hooks.on("updateItem", async (item, changes) => {
  const typeChanged =
    changes?.type === "loot" ||
    changes?.system?.type?.value !== undefined ||
    changes?.system?.type?.subtype !== undefined;

  if (!typeChanged) return;

  const isGem = SheetExtension.qualifies(item, GemSheetExtension.getRules());

  if (!isGem) {
    await EffectHandler.stash(item);
    await EffectHandler.removeAll(item);
  } else {
    await EffectHandler.restore(item);
  }

});


// Em setup/init do seu módulo:
Hooks.on("preCreateItem", (item, data) => {
  // Apenas loot do subtipo gem
  const isGem = item.type === "loot" && foundry.utils.getProperty(data, "system.type.value") === "gem";
  if (!isGem) return;

  // Se vierem efeitos no payload de criação, normalize-os
  const incoming = Array.isArray(data.effects) ? data.effects : [];
  if (incoming.length) {
    for (const ef of incoming) {
      ef.transfer = false;
      ef.disabled = true;
    }
    // Grava na fonte do documento pendente
    item.updateSource({ effects: incoming });
  }



});
