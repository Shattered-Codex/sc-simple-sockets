import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketSlot } from "../scripts/core/model/SocketSlot.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("SocketSlot", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("makeDefault normalizes config and falls back to the localized empty name", () => {
    const slot = SocketSlot.makeDefault({
      name: 123,
      color: "0f0",
      hidden: "1"
    });

    assert.deepEqual(slot, {
      gem: null,
      img: Constants.SOCKET_SLOT_IMG,
      name: "Empty",
      slotConfig: {
        name: "",
        condition: "",
        description: "",
        color: "#00FF00",
        hidden: true,
        deleteGemOnRemoval: false
      }
    });
  });

  test("fillFromGem preserves slot config and records gem metadata", () => {
    const prev = {
      name: "Old Slot",
      slotConfig: {
        name: "Ruby Socket",
        color: "f00"
      }
    };
    const gemItem = {
      id: "gem-1",
      name: "Ruby",
      img: "icons/ruby.webp"
    };

    const slot = SocketSlot.fillFromGem(prev, gemItem, { packed: true }, 2);

    assert.deepEqual(slot, {
      name: "Ruby Socket",
      img: "icons/ruby.webp",
      slotConfig: {
        name: "Ruby Socket",
        condition: "",
        description: "",
        color: "#FF0000",
        hidden: false,
        deleteGemOnRemoval: false
      },
      gem: {
        name: "Ruby",
        img: "icons/ruby.webp"
      },
      _srcGemId: "gem-1",
      _gemData: {
        packed: true
      },
      _slot: 2
    });
  });

  test("clearGem removes the gem but keeps the slot config and slot index", () => {
    const prev = {
      gem: {
        name: "Ruby",
        img: "icons/ruby.webp"
      },
      img: "icons/ruby.webp",
      name: "Ruby Socket",
      slotConfig: {
        name: "Ruby Socket",
        color: "f00"
      },
      _slot: 7
    };

    const slot = SocketSlot.clearGem(prev);

    assert.deepEqual(slot, {
      gem: null,
      img: Constants.SOCKET_SLOT_IMG,
      name: "Ruby Socket",
      slotConfig: {
        name: "Ruby Socket",
        condition: "",
        description: "",
        color: "#FF0000",
        hidden: false,
        deleteGemOnRemoval: false
      },
      _slot: 7
    });
  });

  test("applyConfig uses the gem name as fallback when the new config does not define one", () => {
    const prev = {
      gem: {
        name: "Topaz",
        img: "icons/topaz.webp"
      },
      name: "Topaz",
      slotConfig: {
        name: "",
        color: ""
      },
      _slot: 1
    };

    const slot = SocketSlot.applyConfig(prev, { color: "abc", hidden: true });

    assert.deepEqual(slot, {
      gem: {
        name: "Topaz",
        img: "icons/topaz.webp"
      },
      name: "Topaz",
      slotConfig: {
        name: "",
        condition: "",
        description: "",
        color: "#AABBCC",
        hidden: true,
        deleteGemOnRemoval: false
      },
      _slot: 1
    });
  });
});
