import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ModuleSettings } from "../scripts/core/settings/ModuleSettings.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestItem } from "./support/testDocuments.js";

function captureHooks() {
  const hooks = new Map();
  const push = (name, fn) => {
    const list = hooks.get(name) ?? [];
    list.push(fn);
    hooks.set(name, list);
  };

  globalThis.Hooks.on = push;
  globalThis.Hooks.once = push;

  return {
    get(name) {
      return hooks.get(name)?.at(-1) ?? null;
    }
  };
}

async function flushAsyncHooks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("TidyIntegration tab configuration sync", () => {
  let hooks;
  let TidyIntegration;

  beforeEach(async () => {
    installFoundryStubs({
      isGM: true,
      modules: [
        ["tidy5e-sheet", { active: true }]
      ],
      settings: {
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_ENABLE_SOCKET_TAB_FOR_ALL_ITEMS}`]: true,
        [`${Constants.MODULE_ID}.${ModuleSettings.SETTING_SOCKETABLE_ITEM_TYPES}`]: ["weapon", "equipment"]
      }
    });

    class ApplicationV2 {}
    ApplicationV2.DEFAULT_OPTIONS = {};
    globalThis.foundry.applications.api = {
      ApplicationV2,
      FormApplicationV2: ApplicationV2,
      HandlebarsApplicationMixin: (Base) => Base
    };
    globalThis.foundry.utils.mergeObject = (original = {}, other = {}, { inplace = true } = {}) => {
      const target = inplace ? original : { ...(original ?? {}) };
      for (const [key, value] of Object.entries(other ?? {})) {
        if (
          value
          && typeof value === "object"
          && !Array.isArray(value)
          && target[key]
          && typeof target[key] === "object"
          && !Array.isArray(target[key])
        ) {
          target[key] = globalThis.foundry.utils.mergeObject(target[key], value, { inplace: true });
          continue;
        }
        target[key] = value;
      }
      return target;
    };

    hooks = captureHooks();
    ({ TidyIntegration } = await import("../scripts/core/integration/TidyIntegration.js"));
    TidyIntegration.register();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("does not persist Tidy tab selection for unmanaged advancement items", async () => {
    const item = createTestItem({
      id: "feature-1",
      type: "feat",
      system: {
        advancement: {
          size: 1
        }
      }
    });

    hooks.get("createItem")(item);
    await flushAsyncHooks();

    assert.equal(item.getFlag("tidy5e-sheet", "tab-configuration"), undefined);
  });

  test("does not create a minimal Tidy whitelist when runtime tab defaults are unavailable", async () => {
    const item = createTestItem({
      id: "weapon-1",
      type: "weapon"
    });

    hooks.get("createItem")(item);
    await flushAsyncHooks();

    assert.equal(item.getFlag("tidy5e-sheet", "tab-configuration"), undefined);
  });

  test("updates an existing Tidy selection for socketable items", async () => {
    const item = createTestItem({
      id: "weapon-2",
      type: "weapon",
      flags: {
        "tidy5e-sheet": {
          "tab-configuration": {
            selected: ["description", "details"],
            visibilityLevels: {}
          }
        }
      }
    });

    hooks.get("createItem")(item);
    await flushAsyncHooks();

    assert.deepEqual(
      item.getFlag("tidy5e-sheet", "tab-configuration").selected,
      ["description", "details", `${Constants.MODULE_ID}-tidy-sockets`]
    );
  });
});
