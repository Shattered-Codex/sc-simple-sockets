import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { ItemResolver } from "../scripts/core/ItemResolver.js";
import { SocketUsesUI } from "../scripts/core/ui/SocketUsesUI.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

function makeBoundItem() {
  const source = {
    name: "Cell",
    type: "loot",
    flags: {
      [Constants.MODULE_ID]: {
        [Constants.FLAG_GEM_RESOURCE]: { key: "energy", value: 2, max: 5 }
      }
    }
  };
  const item = createTestItem({
    id: "bound",
    system: { uses: { spent: 99 }, _source: { uses: { max: "@sockets.energy.item" } } },
    flags: {
      [Constants.MODULE_ID]: {
        [Constants.FLAGS.sockets]: [{
          gem: { name: "Cell" },
          _gemData: ItemResolver.compactSnapshot(source)
        }]
      }
    }
  });
  return item;
}

describe("SocketUsesUI", () => {
  beforeEach(() => installFoundryStubs());
  afterEach(() => clearFoundryStubs());

  test("makes Spent read-only and shows its derived numeric value", () => {
    const input = {
      value: "99",
      readOnly: false,
      dataset: {},
      setAttribute(name, value) { this[name] = value; }
    };
    const root = {
      querySelectorAll(selector) {
        return selector.includes("system.uses.spent") ? [input] : [];
      }
    };

    SocketUsesUI.bind({ item: makeBoundItem() }, root);

    assert.equal(input.value, "3");
    assert.equal(input.readOnly, true);
    assert.equal(input["aria-readonly"], "true");
    assert.equal(input.dataset.scSocketsReadonlyUses, "true");
  });

  test("leaves Spent editable for ordinary Limited Uses", () => {
    const item = createTestItem({
      system: { uses: { spent: 1 }, _source: { uses: { max: "3" } } }
    });
    const input = { value: "1", readOnly: false, dataset: {} };
    const root = { querySelectorAll: () => [input] };

    SocketUsesUI.bind({ item }, root);
    assert.equal(input.readOnly, false);
  });

  test("refreshes an open actor sheet as soon as socket-count uses change", () => {
    const actor = createTestActor({
      items: [{
        id: "staff",
        type: "weapon",
        system: { uses: { max: 0, spent: 1, value: 0 } },
        flags: {
          [Constants.MODULE_ID]: {
            [Constants.FLAGS.sockets]: [{ gem: { name: "A" } }, { gem: { name: "B" } }]
          }
        }
      }]
    });
    const item = actor.items.get("staff");
    item._source = { system: { uses: { max: "@sc.sockets.gems", spent: 1 } } };
    const renders = [];
    actor.sheet = { rendered: true, render(force) { renders.push(force); } };

    const state = SocketUsesUI.refreshCountUses(item, {
      [`flags.${Constants.MODULE_ID}.${Constants.FLAGS.sockets}`]: item.getFlag(
        Constants.MODULE_ID,
        Constants.FLAGS.sockets
      )
    });

    assert.deepEqual(state, { poolKey: "gems", max: 2, spent: 1, value: 1 });
    assert.deepEqual(renders, [false]);
  });
});
