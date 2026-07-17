import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { buildSocketLayoutContext } from "../scripts/core/helpers/socketLayout.js";
import { ModuleSettings } from "../scripts/core/settings/ModuleSettings.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

function makeGemSource(name, resource, { img = "icons/gem.webp" } = {}) {
  return {
    name,
    img,
    type: "loot",
    system: { quantity: 1, type: { value: "gem" } },
    flags: resource
      ? { [Constants.MODULE_ID]: { [Constants.FLAG_GEM_RESOURCE]: resource } }
      : {}
  };
}

function makeSlot(name, resource, { img = "icons/gem.webp", slotConfig = {} } = {}) {
  const source = makeGemSource(name, resource, { img });
  return {
    gem: { name, img },
    name,
    img,
    slotConfig,
    _gemData: {
      name,
      img,
      description: "",
      socketDescription: "",
      data: JSON.stringify(source)
    }
  };
}

describe("buildSocketLayoutContext", () => {
  beforeEach(() => {
    installFoundryStubs({
      settings: {
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_SOCKET_TAB_LAYOUT}`]: ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_DELETE_ON_REMOVE}`]: false
      },
      translations: {
        "SCSockets.SocketPools.DestroyYes": "Yes",
        "SCSockets.SocketPools.DestroyNo": "No",
        "SCSockets.Tooltips.ShowSlot": "Show this slot to players.",
        "SCSockets.Tooltips.HideSlot": "Hide this slot from players.",
        "SCSockets.Tooltips.ExtractGem": "Extract gem",
        "SCSockets.Tooltips.DestroyGem": "Destroy gem",
        "SCSockets.SocketEmptyName": "Empty"
      }
    });
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("builds visible per-gem resource rows with destroy-at-zero state", () => {
    const context = buildSocketLayoutContext(
      { uuid: "Item.test" },
      {
        sockets: [
          makeSlot("Battery Gem", { key: "battery", max: 10, value: 7, destroyOnEmpty: true }, {
            img: "icons/battery.webp"
          }),
          makeSlot("Mana Stone", { key: "mana", max: 5, value: 5 }, {
            img: "icons/mana.webp",
            slotConfig: { hidden: true }
          }),
          makeSlot("Plain Gem", null, { img: "icons/plain.webp" })
        ]
      }
    );

    assert.equal(context.hasSocketResourceRows, true);
    assert.deepEqual(context.socketResourceRows, [
      {
        slotNumber: 1,
        gemName: "Battery Gem",
        gemImg: "icons/battery.webp",
        resourceKey: "battery",
        value: 7,
        max: 10,
        chargesLabel: "7/10",
        destroyOnEmpty: true,
        destroyAtZeroLabel: "Yes"
      }
    ]);
  });

  test("keeps slot tint behind gems in list and grid layouts", async () => {
    const coloredEmptySlot = {
      name: "Empty Socket",
      slotConfig: { color: "#C44D24" }
    };
    const coloredFilledSlot = makeSlot("Ruby", null, {
      slotConfig: { color: "#C44D24" }
    });

    for (const layout of [
      ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
      ModuleSettings.SOCKET_TAB_LAYOUT_GRID
    ]) {
      await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKET_TAB_LAYOUT, layout);

      const context = buildSocketLayoutContext(
        { uuid: "Item.test" },
        { sockets: [coloredEmptySlot, coloredFilledSlot] }
      );

      assert.equal(context.sockets[0].hasSlotTint, true, `${layout}: empty socket keeps its tint`);
      assert.equal(context.sockets[0].slotColor, "#C44D24");
      assert.equal(context.sockets[1].hasSlotTint, true, `${layout}: filled socket keeps its tint`);
      assert.equal(context.sockets[1].slotColor, "#C44D24");
      assert.equal(context.sockets[1].slotMaskStyle, "--sc-sockets-slot-color:#C44D24;");
    }
  });
});
