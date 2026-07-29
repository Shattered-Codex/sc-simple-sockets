import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { Constants } from "../scripts/core/Constants.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("ItemResolver", () => {
  beforeEach(() => {
    installFoundryStubs();
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("compactSnapshot stores normalized metadata and a quantity-1 payload", () => {
    const compact = ItemResolver.compactSnapshot({
      _id: "item-1",
      name: "Ruby",
      img: "icons/ruby.webp",
      system: {
        quantity: 8,
        description: {
          value: "<p>ruby description</p>"
        }
      },
      flags: {
        "sc-simple-sockets": {
          socketDescription: "<p>socket description</p>"
        }
      }
    });

    assert.equal(compact.name, "Ruby");
    assert.equal(compact.img, "icons/ruby.webp");
    assert.equal(compact.description, "<p>ruby description</p>");
    assert.equal(compact.socketDescription, "<p>socket description</p>");

    const decoded = JSON.parse(compact.data);
    assert.equal(decoded._id, undefined);
    assert.equal(decoded.system.quantity, 1);
  });

  test("compactSnapshot preserves gem tags in the encoded source", () => {
    const compact = ItemResolver.compactSnapshot({
      name: "Venom Shard",
      system: { quantity: 2 },
      flags: {
        [Constants.MODULE_ID]: {
          [Constants.FLAG_GEM_TAGS]: ["poison", "piercing"]
        }
      }
    });

    const decoded = ItemResolver.expandSnapshot(compact);
    assert.deepEqual(
      decoded.flags[Constants.MODULE_ID][Constants.FLAG_GEM_TAGS],
      ["poison", "piercing"]
    );
  });

  test("expandSnapshot decodes stored envelope snapshots and deep clones raw snapshots", () => {
    assert.deepEqual(
      ItemResolver.expandSnapshot({
        data: "{\"name\":\"Ruby\",\"system\":{\"quantity\":1}}"
      }),
      {
        name: "Ruby",
        system: {
          quantity: 1
        }
      }
    );

    const rawSnapshot = {
      name: "Topaz",
      system: {
        quantity: 1
      }
    };
    const expanded = ItemResolver.expandSnapshot(rawSnapshot);

    assert.deepEqual(expanded, rawSnapshot);
    assert.notEqual(expanded, rawSnapshot);
  });

  test("sanitizeSocketSlot rebuilds gem metadata from stored snapshots", () => {
    const slot = ItemResolver.sanitizeSocketSlot(
      {
        name: "",
        img: "icons/old.webp",
        slotConfig: {
          color: "abc",
          hidden: "on"
        },
        _gemData: {
          name: "Sapphire",
          img: "icons/sapphire.webp",
          description: "<p>desc</p>",
          socketDescription: "<p>socket</p>",
          data: "{\"name\":\"Sapphire\"}"
        }
      },
      { slotIndex: 4 }
    );

    assert.equal(typeof slot._gemInstanceId, "string");
    assert.ok(slot._gemInstanceId.length > 0);

    const { _gemInstanceId, ...rest } = slot;
    assert.deepEqual(rest, {
      gem: {
        name: "Sapphire",
        img: "icons/sapphire.webp"
      },
      img: "icons/sapphire.webp",
      name: "Sapphire",
      slotConfig: {
        name: "",
        condition: "",
        description: "",
        color: "#AABBCC",
        hidden: true,
        deleteGemOnRemoval: false
      },
      _gemData: {
        name: "Sapphire",
        img: "icons/sapphire.webp",
        description: "<p>desc</p>",
        socketDescription: "<p>socket</p>",
        data: "{\"name\":\"Sapphire\"}"
      },
      _slot: 4
    });
  });

  test("sanitizeSocketSlot keeps an existing gem instance id and clears it on empty slots", () => {
    const withGem = ItemResolver.sanitizeSocketSlot({
      _gemData: {
        name: "Sapphire",
        img: "icons/sapphire.webp",
        description: "",
        socketDescription: "",
        data: "{\"name\":\"Sapphire\"}"
      },
      _gemInstanceId: "instance-1"
    });
    assert.equal(withGem._gemInstanceId, "instance-1");

    const emptySlot = ItemResolver.sanitizeSocketSlot({
      name: "Empty",
      _gemInstanceId: "instance-1"
    });
    assert.equal(emptySlot._gemInstanceId, null);
  });

  test("getSnapshotMeta reads description and socket description from Foundry-style paths", () => {
    assert.deepEqual(
      ItemResolver.getSnapshotMeta({
        name: "Emerald",
        img: "icons/emerald.webp",
        system: {
          description: {
            value: "<p>emerald description</p>"
          }
        },
        flags: {
          "sc-simple-sockets": {
            socketDescription: "<p>emerald socket</p>"
          }
        }
      }),
      {
        name: "Emerald",
        img: "icons/emerald.webp",
        description: "<p>emerald description</p>",
        socketDescription: "<p>emerald socket</p>"
      }
    );
  });
});
