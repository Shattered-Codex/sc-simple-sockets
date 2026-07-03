import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { clearFoundryStubs, installFoundryStubs } from "./support/foundryStubs.js";
import { createTestActor } from "./support/testDocuments.js";

let originalDnd5e;
let originalFromUuid;
let originalFromUuidSync;

function installScMoreActivitiesStubs() {
  foundry.utils.mergeObject = (original = {}, other = {}, { inplace = true } = {}) => {
    const target = inplace ? original : { ...(original ?? {}) };

    for (const [key, value] of Object.entries(other ?? {})) {
      if (
        value
        && typeof value === "object"
        && !Array.isArray(value)
        && target[key]
        && typeof target[key] === "object"
        && !Array.isArray(target[key])
      ) {
        target[key] = foundry.utils.mergeObject(target[key], value, { inplace: false });
        continue;
      }

      target[key] = value;
    }

    return target;
  };

  class BaseActivityData {
    static defineSchema() {
      return {};
    }
  }

  class ActivitySheet {
    static DEFAULT_OPTIONS = {};
    static PARTS = {
      effect: {
        templates: []
      }
    };

    async _prepareEffectContext(context) {
      return context;
    }
  }

  class StringField {
    constructor(options = {}) {
      this.options = options;
    }
  }

  class BooleanField {
    constructor(options = {}) {
      this.options = options;
    }
  }

  class SchemaField {
    constructor(schema = {}) {
      this.schema = schema;
    }
  }

  foundry.data = {
    fields: {
      BooleanField,
      SchemaField,
      StringField
    }
  };

  foundry.applications.api = {
    ApplicationV2: class {},
    DialogV2: {
      async confirm() {
        return false;
      }
    },
    HandlebarsApplicationMixin: (Base) => class extends Base {}
  };

  globalThis.dnd5e = {
    applications: {
      activity: {
        ActivitySheet
      }
    },
    dataModels: {
      activity: {
        BaseActivityData
      }
    },
    documents: {
      activity: {
        ActivityMixin: (Base) => class extends Base {
          static LOCALIZATION_PREFIXES = [];
          static metadata = {};

          static availableForItem() {
            return true;
          }

          async use() {
            return {};
          }
        }
      }
    }
  };
}

describe("ScMoreActivitiesIntegration", () => {
  beforeEach(() => {
    originalDnd5e = globalThis.dnd5e;
    originalFromUuid = globalThis.fromUuid;
    originalFromUuidSync = globalThis.fromUuidSync;

    installFoundryStubs({
      isGM: true
    });

    installScMoreActivitiesStubs();
  });

  afterEach(() => {
    clearFoundryStubs();

    if (originalDnd5e === undefined) {
      delete globalThis.dnd5e;
    } else {
      globalThis.dnd5e = originalDnd5e;
    }

    if (originalFromUuid === undefined) {
      delete globalThis.fromUuid;
    } else {
      globalThis.fromUuid = originalFromUuid;
    }

    if (originalFromUuidSync === undefined) {
      delete globalThis.fromUuidSync;
    } else {
      globalThis.fromUuidSync = originalFromUuidSync;
    }
  });

  test("keeps extract-gem valid when the target item still resolves but the activity uuid does not", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          "sc-simple-sockets": {
            sockets: [{
              name: "Ruby",
              img: "icons/ruby.webp",
              gem: {
                name: "Ruby",
                img: "icons/ruby.webp"
              },
              _gemData: {
                name: "Ruby",
                img: "icons/ruby.webp",
                data: "{\"name\":\"Ruby\",\"type\":\"loot\",\"system\":{\"quantity\":1}}"
              }
            }]
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    globalThis.fromUuid = async (uuid) => {
      if (uuid === "Actor.actor-1.Item.host-1") {
        return hostItem;
      }
      if (uuid === "Actor.actor-1.Item.consumable-1.Activity.extract-1") {
        return null;
      }
      return null;
    };

    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { SocketService } = await import("../scripts/core/services/SocketService.js");

    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalRemoveGem = SocketAPI.removeGem;

    SocketAPI.getItemSlots = async (itemUuid, options = {}) => {
      assert.equal(itemUuid, hostItem.uuid);
      assert.equal(options.includeSnapshots, true);
      return [{
        slotIndex: 0,
        hasGem: true,
        slot: {
          gem: {
            name: "Ruby",
            img: "icons/ruby.webp"
          }
        }
      }];
    };

    SocketAPI.removeGem = async (itemUuid, slotIndex, options = {}) => {
      assert.equal(itemUuid, hostItem.uuid);
      assert.equal(slotIndex, 0);
      assert.equal(options.bypassPermission, true);
      assert.equal(options.mode, SocketService.REMOVE_GEM_MODE_KEEP);
      assert.equal(options.notify, false);
      assert.equal(options.render, false);

      return {
        success: true,
        changed: true,
        reason: "gem-removed"
      };
    };

    try {
      const result = await ScMoreActivitiesIntegration.handleQuery({
        activityUuid: "Actor.actor-1.Item.consumable-1.Activity.extract-1",
        itemUuid: hostItem.uuid,
        mode: "keep",
        operation: "extract-gem",
        requestUserId: "test-user",
        slotIndex: 0
      });

      assert.equal(result.ok, true);
      assert.equal(result.changed, true);
      assert.equal(result.reason, "gem-removed");
      assert.equal(result.message, "Extracted a socketed gem from Socketed Sword.");
    } finally {
      SocketAPI.getItemSlots = originalGetItemSlots;
      SocketAPI.removeGem = originalRemoveGem;
    }
  });
});
