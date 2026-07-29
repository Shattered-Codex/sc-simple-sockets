/**
 * Per-host promise chains shared by every service that rewrites the sockets
 * flag (socket CRUD, slot configuration, gem recovery), so read-modify-write
 * cycles from different services never interleave on the same item. Keyed by
 * item uuid, which is stable across sheet clones and embedded copies.
 *
 * Consumption writes applied by dnd5e itself (activity usage updates) cannot
 * be routed through here; recovery guards against those with per-slot gem
 * identity and profile checks instead.
 */
export class HostOperationQueue {
  static #queues = new Map();

  static #key(hostItem) {
    return hostItem?.uuid ?? hostItem?.id ?? null;
  }

  static async enqueue(hostItem, task) {
    const key = HostOperationQueue.#key(hostItem);
    if (!key) {
      return task();
    }

    const previous = HostOperationQueue.#queues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => task());
    HostOperationQueue.#queues.set(key, run);
    try {
      return await run;
    } finally {
      if (HostOperationQueue.#queues.get(key) === run) {
        HostOperationQueue.#queues.delete(key);
      }
    }
  }
}
