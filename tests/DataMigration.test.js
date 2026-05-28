import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { DataMigration } from "../scripts/core/migration/DataMigration.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

describe("DataMigration", () => {
  let worldLoot;
  let actorLoot;
  let worldSocketed;
  let actor;

  beforeEach(() => {
    worldLoot = createTestItem({
      id: "world-loot",
      name: "World Gem",
      type: "loot",
      system: {
        type: {
          value: "gem"
        }
      }
    });
    worldSocketed = createTestItem({
      id: "world-socketed",
      name: "Socketed Sword",
      type: "weapon",
      includeActivitiesField: true,
      flags: {
        [Constants.MODULE_ID]: {
          sockets: [{
            name: "Old Ruby",
            _gemData: {
              name: "Old Ruby",
              system: {
                quantity: 3,
                description: {
                  value: "<p>old</p>"
                }
              },
              flags: {
                [Constants.MODULE_ID]: {
                  socketDescription: "<p>socket</p>"
                }
              }
            }
          }]
        }
      }
    });
    actor = createTestActor({
      items: [{
        id: "actor-loot",
        name: "Actor Gem",
        type: "loot",
        system: {
          type: {
            value: "gem"
          }
        }
      }]
    });
    actorLoot = actor.items.get("actor-loot");

    installFoundryStubs({
      isGM: true,
      settings: {
        [`${Constants.MODULE_ID}.${Constants.SETTING_GEM_LOOT_SUBTYPES}`]: ["gem"],
        [`${Constants.MODULE_ID}.${DataMigration.SETTING_MIGRATION_VERSION}`]: ""
      },
      items: [worldLoot, worldSocketed],
      actors: [actor]
    });
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("migrates loot fields, gem subtype flags, socket snapshots, and stores the migration version", async () => {
    await DataMigration.run();

    assert.deepEqual(worldLoot.system.activities, {});
    assert.deepEqual(worldLoot.system.uses, {});
    assert.equal(worldLoot.flags[Constants.MODULE_ID][Constants.FLAG_GEM_SUBTYPE], "gem");
    assert.equal(actorLoot.flags[Constants.MODULE_ID][Constants.FLAG_GEM_SUBTYPE], "gem");

    const compact = worldSocketed.flags[Constants.MODULE_ID].sockets[0]._gemData;
    assert.equal(typeof compact.data, "string");
    assert.equal(compact.name, "Old Ruby");

    assert.equal(
      globalThis.game.settings.get(Constants.MODULE_ID, DataMigration.SETTING_MIGRATION_VERSION),
      "2.0.8-gem-subtype-flags"
    );
  });
});
