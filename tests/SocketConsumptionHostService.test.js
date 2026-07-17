import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketConsumptionHostService } from "../scripts/core/services/SocketConsumptionHostService.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

const socketsFlag = (count = 1) => ({
  [Constants.MODULE_ID]: {
    [Constants.FLAGS.sockets]: Array.from({ length: count }, () => ({ gem: null }))
  }
});

describe("SocketConsumptionHostService", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => clearFoundryStubs());

  test("resolves only the current item for legacy item scope", () => {
    const actor = createTestActor({ items: [
      { id: "source", flags: socketsFlag() },
      { id: "other", flags: socketsFlag() }
    ] });
    const source = actor.items.get("source");
    const result = SocketConsumptionHostService.resolve(
      { item: source, activity: { item: source } },
      { mode: "any", resourceKey: "energy" }
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.hosts.map((host) => host.item.id), ["source"]);
  });

  test("actorEquipped excludes carried and unequipped socket hosts", () => {
    const actor = createTestActor({ items: [
      { id: "ability", type: "feat" },
      { id: "sword", system: { equipped: true }, flags: socketsFlag() },
      { id: "armor", system: { equipped: false }, flags: socketsFlag() },
      { id: "bag", flags: socketsFlag() }
    ] });
    const source = actor.items.get("ability");
    const result = SocketConsumptionHostService.resolve(
      { item: source, activity: { item: source } },
      { mode: "any", resourceKey: "energy", scope: "actorEquipped" }
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.hosts.map((host) => host.item.id), ["sword"]);
  });

  test("host filter can restrict actor sockets to the source item's Setforge set", () => {
    const actor = createTestActor({ items: [
      { id: "ability", type: "feat", flags: { "sc-setforge": { setId: "dragon" } } },
      { id: "dragon-sword", system: { equipped: true }, flags: {
        ...socketsFlag(),
        "sc-setforge": { setId: "dragon" }
      } },
      { id: "wolf-armor", system: { equipped: true }, flags: {
        ...socketsFlag(),
        "sc-setforge": { setId: "wolf" }
      } }
    ] });
    const source = actor.items.get("ability");
    const result = SocketConsumptionHostService.resolve(
      { item: source, activity: { item: source } },
      {
        mode: "any",
        resourceKey: "energy",
        scope: "actorEquipped",
        filter: "getProperty(item, 'flags.sc-setforge.setId') === getProperty(sourceItem, 'flags.sc-setforge.setId')"
      }
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.hosts.map((host) => host.item.id), ["dragon-sword"]);
  });

  test("returns a controlled failure for an invalid filter", () => {
    const actor = createTestActor({ items: [
      { id: "source", system: { equipped: true }, flags: socketsFlag() }
    ] });
    const source = actor.items.get("source");
    const result = SocketConsumptionHostService.resolve(
      { item: source, activity: { item: source } },
      { mode: "any", resourceKey: "energy", scope: "actorAll", filter: "return (;" }
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid-host-filter");
  });
});
