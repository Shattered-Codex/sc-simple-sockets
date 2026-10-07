import assert from "node:assert/strict";
import { test } from "node:test";
import { BrokenGemUI } from "../scripts/core/ui/BrokenGemUI.js";

test("closing a sheet disconnects observers and removes its gem overlays", () => {
  const originalHooks = globalThis.Hooks;
  const originalObserver = globalThis.MutationObserver;
  const hooks = new Map();
  const observers = [];
  globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
  globalThis.MutationObserver = class {
    constructor() { observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  try {
    BrokenGemUI.activate();
    let removed = false;
    const overlay = {
      previousElementSibling: { classList: { remove() {} } },
      remove() { removed = true; }
    };
    const root = {
      isConnected: true,
      querySelectorAll: () => [overlay]
    };
    const sheet = { actor: { items: [] }, element: root };
    BrokenGemUI.render(sheet, root);
    assert.equal(observers.length, 1);
    assert.equal(observers[0].disconnected, undefined);
    hooks.get("closeApplicationV2")(sheet);
    assert.equal(observers[0].disconnected, true);
    assert.equal(removed, true);
  } finally {
    globalThis.Hooks = originalHooks;
    globalThis.MutationObserver = originalObserver;
  }
});
