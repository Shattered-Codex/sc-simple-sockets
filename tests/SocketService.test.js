import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
import { SocketService } from "../scripts/core/services/SocketService.js";
import { SocketSlot } from "../scripts/core/model/SocketSlot.js";
import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor, createTestItem } from "./support/testDocuments.js";

describe("SocketService", () => {
  beforeEach(() => {
    installFoundryStubs({
      isGM: true,
      settings: {
        [`${Constants.MODULE_ID}.editSocketPermission`]: 0,
        [`${Constants.MODULE_ID}.maxSockets`]: 6,
        [`${Constants.MODULE_ID}.deleteGemOnRemoval`]: false,
        [`${Constants.MODULE_ID}.socketableItemTypes`]: ["weapon", "equipment"],
        [`${Constants.MODULE_ID}.${Constants.SETTING_GEM_LOOT_SUBTYPES}`]: ["gem"]
      }
    });
    globalThis.CONST.USER_ROLES = {
      NONE: 0,
      PLAYER: 1,
      TRUSTED: 2,
      ASSISTANT: 3,
      GAMEMASTER: 4
    };
  });

  afterEach(() => {
    clearFoundryStubs();
  });

  test("adds a gem to a socket and consumes it from actor inventory", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [SocketSlot.makeDefault()]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");
    const gemItem = createTestItem({
      id: "gem-1",
      name: "Ruby",
      type: "loot",
      actor,
      parent: actor,
      system: {
        quantity: 1,
        type: {
          value: "gem"
        },
        activities: {
          contents: []
        }
      }
    });
    actor.items.set(gemItem.id, gemItem);

    await SocketService.addGem(hostItem, 0, gemItem);

    const slot = hostItem.flags[Constants.MODULE_ID].sockets[0];
    assert.equal(slot.gem.name, "Ruby");
    assert.equal(slot._slot, 0);
    assert.equal(actor.items.has("gem-1"), false);
  });

  test("removes a gem from a socket and returns it to inventory", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{
              ...SocketSlot.makeDefault(),
              gem: {
                name: "Ruby",
                img: "icons/ruby.webp"
              },
              img: "icons/ruby.webp",
              _gemData: {
                name: "Ruby",
                img: "icons/ruby.webp",
                data: "{\"name\":\"Ruby\",\"type\":\"loot\",\"system\":{\"quantity\":1,\"type\":{\"value\":\"gem\"}}}"
              }
            }]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    await SocketService.removeGem(hostItem, 0);

    const slot = hostItem.flags[Constants.MODULE_ID].sockets[0];
    assert.equal(slot.gem, null);
    const returnedGem = actor.items.find((item) => item.name === "Ruby");
    assert.ok(returnedGem);
    assert.equal(returnedGem.system.quantity, 1);
  });

  test("removes transferred activities and active effects when removing a socket with contents", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: {
          activities: {
            "activity-1": {
              _id: "activity-1",
              id: "activity-1",
              name: "Ruby Burst",
              type: "utility",
              flags: {
                [Constants.MODULE_ID]: {
                  [Constants.FLAG_SOURCE_GEM]: {
                    uuid: "Actor.actor-1.Item.gem-1",
                    slot: 0,
                    sourceId: "source-1"
                  }
                }
              }
            }
          }
        },
        effects: [{
          id: "effect-1",
          name: "Ruby Buff",
          flags: {
            [Constants.MODULE_ID]: {
              [Constants.FLAG_SOURCE_GEM]: {
                slot: 0,
                sourceId: "effect-source-1",
                type: "base"
              }
            }
          }
        }],
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{
              ...SocketSlot.makeDefault(),
              gem: {
                name: "Ruby",
                img: "icons/ruby.webp"
              },
              img: "icons/ruby.webp",
              _gemData: {
                name: "Ruby",
                img: "icons/ruby.webp",
                data: "{\"name\":\"Ruby\",\"type\":\"loot\",\"system\":{\"quantity\":1,\"type\":{\"value\":\"gem\"}}}"
              }
            }],
            [Constants.FLAG_SOCKET_ACTIVITIES]: {
              0: {
                gemName: "Ruby",
                gemImg: "icons/ruby.webp",
                gemUuid: "Actor.actor-1.Item.gem-1",
                activityIds: ["activity-1"],
                activityMeta: {
                  "activity-1": {
                    sourceId: "source-1",
                    hostActivityId: "activity-1",
                    slot: 0,
                    gemName: "Ruby",
                    gemImg: "icons/ruby.webp",
                    gemUuid: "Actor.actor-1.Item.gem-1",
                    activityName: "Ruby Burst"
                  }
                }
              }
            }
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    await SocketService.removeSlotWithContents(hostItem, 0);

    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets.length, 0);
    assert.deepEqual(hostItem.system.activities, {});
    assert.deepEqual(hostItem.effects.contents, []);
    assert.equal(
      hostItem.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES]?.[0] ?? null,
      null
    );
  });

  test("removes residual transferred activities and active effects when removing an empty socket", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: {
          activities: {
            "activity-1": {
              _id: "activity-1",
              id: "activity-1",
              name: "Ruby Burst",
              type: "utility",
              flags: {
                [Constants.MODULE_ID]: {
                  [Constants.FLAG_SOURCE_GEM]: {
                    uuid: "Actor.actor-1.Item.gem-1",
                    slot: 0,
                    sourceId: "source-1"
                  }
                }
              }
            }
          }
        },
        effects: [{
          id: "effect-1",
          name: "Ruby Buff",
          flags: {
            [Constants.MODULE_ID]: {
              [Constants.FLAG_SOURCE_GEM]: {
                slot: 0,
                sourceId: "effect-source-1",
                type: "base"
              }
            }
          }
        }],
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [SocketSlot.makeDefault()],
            [Constants.FLAG_SOCKET_ACTIVITIES]: {
              0: {
                gemName: "Ruby",
                gemImg: "icons/ruby.webp",
                gemUuid: "Actor.actor-1.Item.gem-1",
                activityIds: ["activity-1"],
                activityMeta: {
                  "activity-1": {
                    sourceId: "source-1",
                    hostActivityId: "activity-1",
                    slot: 0,
                    gemName: "Ruby",
                    gemImg: "icons/ruby.webp",
                    gemUuid: "Actor.actor-1.Item.gem-1",
                    activityName: "Ruby Burst"
                  }
                }
              }
            }
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    await SocketService.removeSlotWithContents(hostItem, 0);

    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets.length, 0);
    assert.deepEqual(hostItem.system.activities, {});
    assert.deepEqual(hostItem.effects.contents, []);
    assert.equal(
      hostItem.flags[Constants.MODULE_ID][Constants.FLAG_SOCKET_ACTIVITIES]?.[0] ?? null,
      null
    );
  });

  test("rolls back slot removal when removing the slot fails after returning the gem", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{
              ...SocketSlot.makeDefault(),
              gem: {
                name: "Ruby",
                img: "icons/ruby.webp"
              },
              img: "icons/ruby.webp",
              _gemData: {
                name: "Ruby",
                img: "icons/ruby.webp",
                data: "{\"name\":\"Ruby\",\"type\":\"loot\",\"system\":{\"quantity\":1,\"type\":{\"value\":\"gem\"}}}"
              }
            }]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    let updateCount = 0;
    const originalUpdate = actor.updateEmbeddedDocuments.bind(actor);
    actor.updateEmbeddedDocuments = async (documentName, updates, options) => {
      updateCount += 1;
      if (updateCount === 2) {
        throw new Error("remove slot failed");
      }
      return originalUpdate(documentName, updates, options);
    };

    await assert.rejects(
      SocketService.removeSlotWithContents(hostItem, 0),
      /remove slot failed/
    );

    const restoredSlot = hostItem.flags[Constants.MODULE_ID].sockets[0];
    assert.equal(restoredSlot.gem.name, "Ruby");
    assert.equal(actor.items.find((item) => item.name === "Ruby"), undefined);
  });

  test("denies gem removal without module permission unless bypass is explicit", async () => {
    clearFoundryStubs();
    installFoundryStubs({
      isGM: false,
      settings: {
        [`${Constants.MODULE_ID}.editSocketPermission`]: 4,
        [`${Constants.MODULE_ID}.deleteGemOnRemoval`]: false,
        [`${Constants.MODULE_ID}.socketableItemTypes`]: ["weapon", "equipment"],
        [`${Constants.MODULE_ID}.${Constants.SETTING_GEM_LOOT_SUBTYPES}`]: ["gem"]
      },
      user: {
        id: "player-1",
        isGM: false,
        hasRole() {
          return false;
        }
      }
    });
    globalThis.CONST.USER_ROLES = {
      NONE: 0,
      PLAYER: 1,
      TRUSTED: 2,
      ASSISTANT: 3,
      GAMEMASTER: 4
    };

    const actor = createTestActor({
      items: [{
        id: "host-1",
        name: "Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{
              ...SocketSlot.makeDefault(),
              gem: {
                name: "Ruby",
                img: "icons/ruby.webp"
              },
              img: "icons/ruby.webp",
              _gemData: {
                name: "Ruby",
                img: "icons/ruby.webp",
                data: "{\"name\":\"Ruby\",\"type\":\"loot\",\"system\":{\"quantity\":1,\"type\":{\"value\":\"gem\"}}}"
              }
            }]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    const denied = await SocketService.removeGem(hostItem, 0);
    assert.equal(denied.success, false);
    assert.equal(denied.reason, "permission-denied");
    assert.equal(hostItem.flags[Constants.MODULE_ID].sockets[0].gem.name, "Ruby");

    const allowed = await SocketService.removeGem(hostItem, 0, {
      bypassPermission: true
    });
    assert.equal(allowed.success, true);
    assert.equal(allowed.changed, true);
  });
});
