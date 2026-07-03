import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { buildSocketDescriptionEntries } from "../scripts/core/helpers/socketDescriptionEntries.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";

describe("buildSocketDescriptionEntries", () => {
  let enrichCalls;

  beforeEach(() => {
    enrichCalls = [];
    installFoundryStubs({
      textEditorImplementation: {
        async enrichHTML(description, options) {
          enrichCalls.push({
            description,
            options
          });
          return `<section>${description}</section>`;
        }
      }
    });
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("builds enriched entries for visible empty slots and gems", async () => {
    const item = {
      isOwner: true,
      getRollData() {
        return {
          source: "item-roll-data"
        };
      }
    };

    const entries = await buildSocketDescriptionEntries(
      item,
      [
        {
          name: "Hidden Slot",
          slotConfig: {
            hidden: true,
            description: "should not render",
            color: "123456"
          }
        },
        {
          name: "Open Slot",
          slotConfig: {
            description: "slot description",
            color: "abc"
          }
        },
        {
          name: "Socketed Ruby",
          gem: {
            name: "Ruby",
            img: "icons/ruby.webp"
          },
          _gemData: {
            name: "Ruby",
            img: "icons/ruby.webp",
            socketDescription: "gem description",
            data: "{\"name\":\"Ruby\"}"
          }
        },
        {
          name: "Socketed Battery Gem",
          gem: {
            name: "Battery Gem",
            img: "icons/battery.webp"
          },
          _gemData: {
            name: "Battery Gem",
            img: "icons/battery.webp",
            socketDescription: "battery description",
            data: JSON.stringify({
              name: "Battery Gem",
              img: "icons/battery.webp",
              flags: {
                "sc-simple-sockets": {
                  gemResource: {
                    key: "battery",
                    value: 10,
                    max: 10,
                    destroyOnEmpty: true
                  }
                }
              }
            })
          }
        }
      ]
    );

    assert.equal(entries.length, 3);
    assert.deepEqual(entries[0], {
      name: "Open Slot",
      img: Constants.SOCKET_SLOT_IMG,
      description: "<section>slot description</section>",
      isEmptySlot: true,
      slotColor: "#AABBCC",
      resourceLabel: ""
    });
    assert.deepEqual(entries[1], {
      name: "Ruby",
      img: "icons/ruby.webp",
      description: "<section>gem description</section>",
      isEmptySlot: false,
      slotColor: "",
      resourceLabel: ""
    });
    assert.deepEqual(entries[2], {
      name: "Battery Gem",
      img: "icons/battery.webp",
      description: "<section>battery description</section>",
      isEmptySlot: false,
      slotColor: "",
      resourceLabel: "(10/10 battery)"
    });

    assert.equal(enrichCalls.length, 3);
    assert.deepEqual(
      enrichCalls.map((call) => call.description),
      ["slot description", "gem description", "battery description"]
    );

    for (const call of enrichCalls) {
      assert.equal(call.options.secrets, true);
      assert.equal(call.options.relativeTo, item);
      assert.deepEqual(call.options.rollData, {
        source: "item-roll-data"
      });
    }
  });
});
