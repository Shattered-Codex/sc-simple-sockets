import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { Compatibility } from "../scripts/core/support/Compatibility.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("Foundry document deletion compatibility", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => {
    clearFoundryStubs();
    delete globalThis._del;
  });

  for (const path of ["system.activities.activity1", "flags.sc-simple-sockets.gemSubtype"]) {
    test(`deletes ${path} using v13 syntax`, () => {
      game.release = { generation: 13 };
      const update = { name: "Preserved" };
      Compatibility.addDeletion(update, path);
      const index = path.lastIndexOf(".");
      assert.deepEqual(update, {
        name: "Preserved",
        [`${path.slice(0, index)}.-=${path.slice(index + 1)}`]: null
      });
    });

    test(`deletes ${path} using the v14 operator`, () => {
      game.release = { generation: 14 };
      globalThis._del = Object.freeze({});
      const update = { name: "Preserved" };
      Compatibility.addDeletion(update, path);
      assert.deepEqual(Object.keys(update), ["name", path]);
      assert.equal(update[path], globalThis._del);
    });
  }
});
