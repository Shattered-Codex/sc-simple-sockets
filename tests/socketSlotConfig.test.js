import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  canUserSeeSlot,
  getSlotConfig,
  hasSlotConfigDescription,
  isSlotHidden,
  normalizeSlotColor,
  normalizeSlotConfig
} from "../scripts/core/helpers/socketSlotConfig.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("socketSlotConfig helpers", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("normalizeSlotColor accepts 3 and 6 digit hex values", () => {
    assert.equal(normalizeSlotColor("abc"), "#AABBCC");
    assert.equal(normalizeSlotColor(" #12ef45 "), "#12EF45");
    assert.equal(normalizeSlotColor(""), "");
    assert.equal(normalizeSlotColor("not-a-color"), "");
  });

  test("normalizeSlotConfig coerces text, booleans, and color values", () => {
    assert.deepEqual(
      normalizeSlotConfig({
        name: " Ruby Slot ",
        condition: null,
        description: 123,
        color: "0f0",
        hidden: "on",
        deleteGemOnRemoval: 1
      }),
      {
        name: " Ruby Slot ",
        condition: "",
        description: "",
        color: "#00FF00",
        hidden: true,
        deleteGemOnRemoval: true
      }
    );
  });

  test("slot visibility helpers respect hidden config and gm access", () => {
    const slot = {
      slotConfig: {
        hidden: "true"
      }
    };

    assert.equal(isSlotHidden(slot), true);
    assert.equal(canUserSeeSlot(slot), false);

    globalThis.game.user.isGM = true;
    assert.equal(canUserSeeSlot(slot), true);
  });

  test("description helpers inspect the normalized slot config", () => {
    const slot = {
      slotConfig: {
        description: "  Socket flavor text  ",
        color: "fff"
      }
    };

    assert.deepEqual(getSlotConfig(slot), {
      name: "",
      condition: "",
      description: "  Socket flavor text  ",
      color: "#FFFFFF",
      hidden: false,
      deleteGemOnRemoval: false
    });
    assert.equal(hasSlotConfigDescription(slot), true);
    assert.equal(hasSlotConfigDescription({ slotConfig: { description: "   " } }), false);
  });
});
