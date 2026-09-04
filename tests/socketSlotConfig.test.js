import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import {
  canUserSeeSlot,
  getSlotConfig,
  hasCustomSlotFrameImg,
  hasSlotConfigDescription,
  isSlotHidden,
  normalizeSlotColor,
  normalizeSlotConfig,
  normalizeSlotFrameImg,
  resolveSlotFrameImg
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
        frameImg: "  modules/pack/battery-slot.webp  ",
        hidden: "on",
        deleteGemOnRemoval: 1
      }),
      {
        name: " Ruby Slot ",
        condition: "",
        description: "",
        color: "#00FF00",
        frameImg: "modules/pack/battery-slot.webp",
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
      frameImg: "",
      hidden: false,
      deleteGemOnRemoval: false
    });
    assert.equal(hasSlotConfigDescription(slot), true);
    assert.equal(hasSlotConfigDescription({ slotConfig: { description: "   " } }), false);
  });

  test("normalizeSlotFrameImg trims paths and drops script urls", () => {
    assert.equal(normalizeSlotFrameImg(" modules/pack/battery.webp "), "modules/pack/battery.webp");
    assert.equal(normalizeSlotFrameImg(""), "");
    assert.equal(normalizeSlotFrameImg(null), "");
    assert.equal(normalizeSlotFrameImg("javascript:alert(1)"), "");
    assert.equal(normalizeSlotFrameImg("JavaScript:alert(1)"), "");
  });

  test("frame image helpers fall back to the module default socket", () => {
    const custom = { slotConfig: { frameImg: "modules/pack/battery.webp" } };

    assert.equal(resolveSlotFrameImg(custom), "modules/pack/battery.webp");
    assert.equal(hasCustomSlotFrameImg(custom), true);
    assert.equal(resolveSlotFrameImg({ slotConfig: {} }), Constants.SOCKET_SLOT_IMG);
    assert.equal(resolveSlotFrameImg(null), Constants.SOCKET_SLOT_IMG);
    assert.equal(hasCustomSlotFrameImg({ slotConfig: { frameImg: "  " } }), false);
  });
});
