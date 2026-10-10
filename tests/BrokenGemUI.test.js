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
    takeRecords() { return []; }
    observe() { this.disconnected = false; }
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
    assert.equal(observers[0].disconnected, false);
    hooks.get("closeApplicationV2")(sheet);
    assert.equal(observers[0].disconnected, true);
    assert.equal(removed, true);
  } finally {
    globalThis.Hooks = originalHooks;
    globalThis.MutationObserver = originalObserver;
  }
});

test("explicit overlay refresh still runs without MutationObserver", async () => {
  const { SheetMutationObserver } = await import('../scripts/core/ui/SheetMutationObserver.js');
  const observer = globalThis.MutationObserver;
  globalThis.MutationObserver = undefined;
  let passes = 0;
  const root = { isConnected: true };
  try {
    SheetMutationObserver.subscribe(root, BrokenGemUI, () => passes++);
    SheetMutationObserver.schedule(root, BrokenGemUI);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(passes, 1);
    SheetMutationObserver.unsubscribe(root, BrokenGemUI);
    SheetMutationObserver.subscribe(root, BrokenGemUI, () => passes++);
    SheetMutationObserver.schedule(root, BrokenGemUI);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(passes, 2);
  } finally {
    SheetMutationObserver.unsubscribe(root, BrokenGemUI);
    globalThis.MutationObserver = observer;
  }
});
