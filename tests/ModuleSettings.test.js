import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ModuleSettings } from "../scripts/core/settings/ModuleSettings.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("ModuleSettings", () => {
  beforeEach(() => {
    installFoundryStubs({
      settings: {
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_EDIT_SOCKET}`]: 2,
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES}`]: ["weapon", "container", "Weapon", "equipment"],
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS}`]: false,
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_GEM_LOOT_SUBTYPES}`]: ["gem", "rune"],
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_CUSTOM_LOOT_SUBTYPES}`]: [
          { key: " relic ", label: "" },
          { key: "relic", label: "Duplicate" }
        ]
      }
    });

    globalThis.CONST.USER_ROLES = {
      NONE: 0,
      PLAYER: 1,
      TRUSTED: 2,
      ASSISTANT: 3,
      GAMEMASTER: 4
    };
    globalThis.CONFIG.DND5E = {
      itemTypes: {
        weapon: "Weapon",
        equipment: "Equipment",
        container: "Container"
      }
    };
    globalThis.CONFIG.Item = {
      typeLabels: {
        loot: "Loot"
      },
      dataModels: {
        weapon: {},
        equipment: {},
        loot: {}
      }
    };
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("checks permission by role level for non-GM users", () => {
    const allowedUser = {
      isGM: false,
      hasRole(level) {
        return level === 2;
      }
    };
    const deniedUser = {
      isGM: false,
      hasRole() {
        return false;
      }
    };

    assert.equal(ModuleSettings.canAddOrRemoveSocket(allowedUser), true);
    assert.equal(ModuleSettings.canAddOrRemoveSocket(deniedUser), false);
  });

  test("sanitizes socketable item types and excludes disallowed values", () => {
    assert.deepEqual(ModuleSettings.getSocketableItemTypes(), ["weapon", "equipment"]);
  });

  test("computes socket tab visibility from flags, type, and socket presence", () => {
    const item = {
      type: "weapon",
      getFlag(moduleId, key) {
        if (key === Constants.FLAG_SOCKET_TAB_ENABLED) {
          return true;
        }
        if (key === Constants.FLAGS.sockets) {
          return [];
        }
        return undefined;
      }
    };

    assert.equal(ModuleSettings.isItemSocketTabVisible(item), true);
    assert.equal(ModuleSettings.isItemSocketTabToggleVisible(item), true);
  });

  test("builds available socketable item types from Foundry config", () => {
    assert.deepEqual(
      ModuleSettings.getAvailableSocketableItemTypes().map((entry) => entry.value),
      ["equipment", "loot", "weapon"]
    );
  });

  test("sanitizes custom subtype entries", () => {
    assert.deepEqual(ModuleSettings.getCustomLootSubtypes(), [
      { key: "relic", label: "Relic" }
    ]);
  });
});
