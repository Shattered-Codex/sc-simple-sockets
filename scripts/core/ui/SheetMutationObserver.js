/** One observer and animation-frame queue per root, shared by UI decorators. */
export class SheetMutationObserver {
  static #roots = new WeakMap();

  static subscribe(root, key, render, { relevant = () => true, attributes = [], dispose } = {}) {
    if (!root) return;
    let state = this.#roots.get(root);
    if (!state) {
      state = { subscribers: new Map(), pending: new Set(), frame: null };
      state.observer = typeof MutationObserver === "function"
        ? new MutationObserver((records) => this.#enqueue(root, state, records)) : null;
      this.#roots.set(root, state);
    }
    this.#enqueue(root, state, (state.observer?.takeRecords() ?? []));
    state.subscribers.set(key, { render, relevant, attributes, dispose });
    this.#observe(root, state);
  }

  static #observe(root, state) {
    state.observer?.disconnect();
    const attributes = [...new Set([...state.subscribers.values()].flatMap((entry) => entry.attributes))];
    state.observer?.observe(root, {
      childList: true, subtree: true,
      ...(attributes.length ? { attributes: true, attributeFilter: attributes } : {})
    });
  }

  static #enqueue(root, state, records) {
    if (!records.length) return;
    for (const [key, subscriber] of state.subscribers) {
      if (records.some(subscriber.relevant)) this.schedule(root, key);
    }
  }

  static schedule(root, key) {
    const state = this.#roots.get(root);
    if (!state?.subscribers.has(key)) return;
    state.pending.add(key);
    if (state.frame !== null) return;
    const request = globalThis.requestAnimationFrame ?? ((callback) => setTimeout(callback, 16));
    state.frame = request(() => {
      if (!root.isConnected) {
        for (const key of [...state.subscribers.keys()]) this.unsubscribe(root, key);
        return;
      }
      this.#enqueue(root, state, (state.observer?.takeRecords() ?? []));
      state.frame = null;
      const pending = [...state.pending];
      state.pending.clear();
      state.observer?.disconnect();
      try {
        for (const key of pending) state.subscribers.get(key)?.render();
      } finally {
        if (state.subscribers.size) this.#observe(root, state);
      }
    });
  }

  static unsubscribe(root, key) {
    const state = this.#roots.get(root);
    if (!state) return;
    const entry = state.subscribers.get(key);
    state.subscribers.delete(key);
    state.pending.delete(key);
    if (!state.subscribers.size) {
      if (state.frame !== null) (globalThis.cancelAnimationFrame ?? clearTimeout)(state.frame);
      state.observer?.disconnect();
      this.#roots.delete(root);
    } else {
      this.#enqueue(root, state, (state.observer?.takeRecords() ?? []));
      this.#observe(root, state);
    }
    entry?.dispose?.();
  }
}
