import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

let originalDocument;
let originalHTMLElement;
let originalFromUuid;
const TestHTMLElement = globalThis.HTMLElement ?? class {};

class FakeClassList {
  #values = new Set();

  add(...names) {
    for (const name of names) {
      this.#values.add(name);
    }
  }

  remove(...names) {
    for (const name of names) {
      this.#values.delete(name);
    }
  }

  contains(name) {
    return this.#values.has(name);
  }
}

class FakeStyle {
  #values = new Map();

  setProperty(name, value) {
    this.#values.set(name, value);
  }

  removeProperty(name) {
    this.#values.delete(name);
  }
}

class FakeDocumentNode {
  constructor() {
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
  }
}

function datasetKeyFromSelector(selector) {
  const match = /^\[data-([a-z0-9-]+)\]$/i.exec(selector.trim());
  if (!match) return null;
  return match[1].replace(/-([a-z])/g, (_full, char) => char.toUpperCase());
}

class FakeElement extends TestHTMLElement {
  constructor({ dataset = {}, parent = null } = {}) {
    super();
    this.dataset = dataset;
    this.parentElement = parent;
    this.ownerDocument = null;
    this.#clickHandlers = [];
  }

  #clickHandlers;

  matches(selector) {
    return selector
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => {
        const datasetKey = datasetKeyFromSelector(part);
        return datasetKey ? Boolean(this.dataset?.[datasetKey]) : false;
      });
  }

  closest(selector) {
    if (this.matches(selector)) {
      return this;
    }

    return this.parentElement?.closest?.(selector) ?? null;
  }

  querySelector() {
    return null;
  }

  addClickHandler(handler) {
    this.#clickHandlers.push(handler);
  }

  async dispatchLocalEvent(type, event) {
    if (type !== "click") {
      return;
    }

    for (const handler of this.#clickHandlers) {
      await handler(event);
    }
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeDocumentNode();
    this.body = new FakeDocumentNode();
    this.#listeners = new Map();
  }

  #listeners;

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    this.#listeners.set(type, listeners.filter((entry) => entry !== listener));
  }

  createElement() {
    return new FakeDocumentNode();
  }

  async dispatch(type, event) {
    const listeners = [...(this.#listeners.get(type) ?? [])];
    for (const listener of listeners) {
      await listener(event);
      if (event.immediatePropagationStopped) {
        return;
      }
    }

    if (!event.propagationStopped) {
      await event.target?.dispatchLocalEvent?.(type, event);
    }
  }
}

function createEvent(type, target, { button = 0, key = undefined } = {}) {
  return {
    type,
    target,
    button,
    key,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
      this.propagationStopped = true;
    }
  };
}

describe("SelectionController", () => {
  beforeEach(() => {
    originalDocument = globalThis.document;
    originalHTMLElement = globalThis.HTMLElement;
    originalFromUuid = globalThis.fromUuid;

    installFoundryStubs({
      isGM: true
    });

    globalThis.HTMLElement = TestHTMLElement;
  });

  afterEach(() => {
    clearFoundryStubs();

    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }

    if (originalHTMLElement === undefined) {
      delete globalThis.HTMLElement;
    } else {
      globalThis.HTMLElement = originalHTMLElement;
    }

    if (originalFromUuid === undefined) {
      delete globalThis.fromUuid;
    } else {
      globalThis.fromUuid = originalFromUuid;
    }
  });

  test("swallows the follow-up click after selecting an item", async () => {
    const item = {
      documentName: "Item",
      uuid: "Actor.actor-1.Item.host-1",
      name: "Socketed Sword"
    };

    const fakeDocument = new FakeDocument();
    const target = new FakeElement({
      dataset: {
        uuid: item.uuid
      }
    });
    target.ownerDocument = fakeDocument;

    let clickCount = 0;
    target.addClickHandler(() => {
      clickCount += 1;
    });

    globalThis.document = fakeDocument;
    globalThis.fromUuid = async (uuid) => (uuid === item.uuid ? item : null);

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");

    const selectionPromise = SelectionController.selectItem({
      notifications: false
    });

    await fakeDocument.dispatch("pointerdown", createEvent("pointerdown", target));
    const selection = await selectionPromise;
    assert.strictEqual(selection, item);

    await fakeDocument.dispatch("mouseup", createEvent("mouseup", target));
    await fakeDocument.dispatch("click", createEvent("click", target));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(clickCount, 0);
  });
});
