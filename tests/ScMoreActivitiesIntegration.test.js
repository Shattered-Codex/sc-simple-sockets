import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { Constants } from "../scripts/core/Constants.js";
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

function createGemItemSource({
  id,
  uuid = `Actor.actor-1.Item.${id}`,
  name = "Gem",
  quantity = 1,
  allowedTypes = null
} = {}) {
  const moduleFlags = Array.isArray(allowedTypes) && allowedTypes.length
    ? {
      [Constants.FLAG_GEM_ALLOWED_TYPES]: allowedTypes
    }
    : {};

  return {
    id,
    uuid,
    name,
    type: "loot",
    system: {
      quantity,
      type: { value: "gem" }
    },
    flags: Object.keys(moduleFlags).length
      ? {
        [Constants.MODULE_ID]: moduleFlags
      }
      : {}
  };
}

function installTestUsers({
  currentUserId = "gm-1",
  currentIsGM = true,
  extraUsers = []
} = {}) {
  const currentUser = {
    id: currentUserId,
    isGM: currentIsGM,
    hasRole() {
      return false;
    }
  };
  const users = [currentUser, ...extraUsers];

  game.user = currentUser;
  game.userId = currentUser.id;
  game.users = {
    find(callback) {
      return users.find(callback) ?? null;
    },
    get(id) {
      return users.find((user) => user.id === id) ?? null;
    }
  };

  return currentUser;
}

function allowOwner(document, userId = "player-1") {
  document.testUserPermission = (user, permission) => permission === "OWNER" && user?.id === userId;
  return document;
}

function createReloadActivity({
  actor,
  item,
  uuid = "Actor.actor-1.Item.activity-1.Activity.reload-1"
} = {}) {
  return {
    actor,
    documentName: "Activity",
    item,
    uuid
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
    installTestUsers({
      currentUserId: "gm-1",
      currentIsGM: true,
      extraUsers: [{
        id: "player-1",
        isGM: false,
        hasRole() {
          return false;
        }
      }]
    });
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
    allowOwner(actor);
    allowOwner(hostItem);

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
        requestUserId: "player-1",
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

  test("auto-selects the first compatible gem and slot for gem reload by exact name", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }, {
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{}, {}]
          }
        }
      }, {
        id: "gem-ruby",
        uuid: "Actor.actor-1.Item.gem-ruby",
        name: "Ruby",
        type: "loot",
        system: {
          quantity: 2,
          type: { value: "gem" }
        }
      }, {
        id: "gem-sapphire",
        uuid: "Actor.actor-1.Item.gem-sapphire",
        name: "Sapphire",
        type: "loot",
        system: {
          quantity: 1,
          type: { value: "gem" }
        }
      }]
    });
    const activityItem = actor.items.get("activity-1");
    const hostItem = actor.items.get("host-1");
    const rubyGem = actor.items.get("gem-ruby");
    hostItem.isOwner = true;

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { ModuleSettings } = await import("../scripts/core/settings/ModuleSettings.js");
    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { ScMoreActivitiesGemReloadActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/gem-reload/ScMoreActivitiesGemReloadActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalIsItemSocketableByType = ModuleSettings.isItemSocketableByType;
    const originalReloadGem = ScMoreActivitiesIntegration.reloadGem;

    SelectionController.selectItem = async () => hostItem;
    SocketAPI.getItemSlots = async (itemUuid, options = {}) => {
      assert.equal(itemUuid, hostItem.uuid);
      assert.equal(options.includeSnapshots, true);
      return [{
        slotIndex: 0,
        hasGem: false,
        slot: {}
      }, {
        slotIndex: 1,
        hasGem: false,
        slot: {}
      }];
    };
    ModuleSettings.isItemSocketableByType = () => true;
    ScMoreActivitiesIntegration.reloadGem = async (activity, { item, gemItem, slotIndex }) => {
      assert.equal(activity.item, activityItem);
      assert.equal(item, hostItem);
      assert.equal(gemItem, rubyGem);
      assert.equal(slotIndex, 0);
      return {
        ok: true,
        changed: true,
        message: "Socketed."
      };
    };

    try {
      const result = await ScMoreActivitiesGemReloadActivityService.execute({
        actor,
        item: activityItem,
        reload: {
          gemMode: "name",
          gemQuery: "Ruby",
          slotMode: "ordered"
        }
      }, {
        results: { ok: true }
      });

      assert.deepEqual(result, {
        ok: true,
        changed: true,
        message: "Socketed."
      });
    } finally {
      SelectionController.selectItem = originalSelectItem;
      SocketAPI.getItemSlots = originalGetItemSlots;
      ModuleSettings.isItemSocketableByType = originalIsItemSocketableByType;
      ScMoreActivitiesIntegration.reloadGem = originalReloadGem;
    }
  });

  test("handles reload-gem queries by socketing the selected gem into the chosen empty slot", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }, {
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{}]
          }
        }
      }, {
        id: "gem-ruby",
        uuid: "Actor.actor-1.Item.gem-ruby",
        name: "Ruby",
        type: "loot",
        system: {
          quantity: 1,
          type: { value: "gem" }
        }
      }]
    });
    const activity = createReloadActivity({
      actor,
      item: actor.items.get("activity-1")
    });
    const hostItem = actor.items.get("host-1");
    const rubyGem = actor.items.get("gem-ruby");
    allowOwner(actor);
    allowOwner(hostItem);

    globalThis.fromUuid = async (uuid) => {
      if (uuid === activity.uuid) {
        return activity;
      }
      if (uuid === hostItem.uuid) {
        return hostItem;
      }
      if (uuid === rubyGem.uuid) {
        return rubyGem;
      }
      return null;
    };

    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { SocketService } = await import("../scripts/core/services/SocketService.js");

    const originalMutateSockets = SocketService.mutateSockets;

    SocketService.mutateSockets = async (item, callback, options = {}) => {
      assert.equal(item, hostItem);
      assert.equal(typeof callback, "function");
      assert.equal(options.bypassPermission, true);
      return {
        success: true,
        changed: true,
        reason: "gem-added"
      };
    };

    try {
      const result = await ScMoreActivitiesIntegration.handleQuery({
        activityUuid: activity.uuid,
        gemUuid: rubyGem.uuid,
        itemUuid: hostItem.uuid,
        operation: "reload-gem",
        requestUserId: "player-1",
        slotIndex: 0
      });

      assert.equal(result.ok, true);
      assert.equal(result.changed, true);
      assert.equal(result.reason, "gem-added");
      assert.equal(result.message, "Socketed Ruby into Socketed Sword (slot 1).");
    } finally {
      SocketService.mutateSockets = originalMutateSockets;
    }
  });

  test("routes reloadGem through the local dispatch path when the user can execute the mutation directly", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{}]
          }
        }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby"
      })]
    });
    const hostItem = actor.items.get("host-1");
    const rubyGem = actor.items.get("gem-ruby");
    const activity = createReloadActivity({
      actor,
      item: hostItem
    });
    allowOwner(actor);
    allowOwner(hostItem);
    installTestUsers({
      currentUserId: "player-1",
      currentIsGM: false
    });

    globalThis.fromUuid = async (uuid) => {
      if (uuid === activity.uuid) {
        return activity;
      }
      if (uuid === hostItem.uuid) {
        return hostItem;
      }
      if (uuid === rubyGem.uuid) {
        return rubyGem;
      }
      return null;
    };

    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { SocketService } = await import("../scripts/core/services/SocketService.js");

    const originalCanEditSockets = SocketAPI.canEditSockets;
    const originalMutateSockets = SocketService.mutateSockets;

    SocketAPI.canEditSockets = async (itemUuid, options = {}) => {
      assert.equal(itemUuid, hostItem.uuid);
      assert.equal(options.userId, "player-1");
      return true;
    };
    SocketService.mutateSockets = async (item, callback, options = {}) => {
      assert.equal(item, hostItem);
      assert.equal(typeof callback, "function");
      assert.equal(options.bypassPermission, false);
      return {
        success: true,
        changed: true,
        reason: "gem-added"
      };
    };

    try {
      const result = await ScMoreActivitiesIntegration.reloadGem(activity, {
        item: hostItem,
        gemItem: rubyGem,
        slotIndex: 0
      });

      assert.deepEqual(result, {
        ok: true,
        changed: true,
        reason: "gem-added",
        result: {
          success: true,
          changed: true,
          reason: "gem-added"
        },
        message: "Socketed Ruby into Socketed Sword (slot 1)."
      });
    } finally {
      SocketAPI.canEditSockets = originalCanEditSockets;
      SocketService.mutateSockets = originalMutateSockets;
    }
  });

  test("routes reloadGem through the active GM query when the user cannot mutate sockets directly", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby"
      })]
    });
    const hostItem = actor.items.get("host-1");
    const rubyGem = actor.items.get("gem-ruby");

    const activeGm = {
      id: "gm-1",
      active: true,
      isGM: true,
      async query(queryId, request, options = {}) {
        assert.equal(queryId, registeredQueryId);
        assert.deepEqual(request, {
          activityUuid: "Actor.actor-1.Item.activity-1.Activity.reload-1",
          gemUuid: rubyGem.uuid,
          itemUuid: hostItem.uuid,
          operation: "reload-gem",
          requestUserId: "player-1",
          slotIndex: 1
        });
        assert.equal(typeof options.timeout, "number");
        return {
          ok: true,
          changed: true,
          forwarded: true
        };
      }
    };

    game.user = {
      id: "player-1",
      isGM: false,
      hasRole() {
        return false;
      }
    };
    game.userId = game.user.id;
    game.users = {
      find(callback) {
        return [activeGm].find(callback);
      },
      get(id) {
        if (id === game.user.id) {
          return game.user;
        }
        return id === activeGm.id ? activeGm : null;
      }
    };

    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");

    const originalCanEditSockets = SocketAPI.canEditSockets;
    let registeredQueryId = null;

    SocketAPI.canEditSockets = async () => false;
    CONFIG.queries = {};
    ScMoreActivitiesIntegration.registerQueries();
    [registeredQueryId] = Object.keys(CONFIG.queries);

    try {
      const result = await ScMoreActivitiesIntegration.reloadGem({
        uuid: "Actor.actor-1.Item.activity-1.Activity.reload-1",
        item: hostItem
      }, {
        item: hostItem,
        gemItem: rubyGem,
        slotIndex: 1
      });

      assert.deepEqual(result, {
        ok: true,
        changed: true,
        forwarded: true
      });
    } finally {
      SocketAPI.canEditSockets = originalCanEditSockets;
    }
  });

  test("rejects reload-gem requests when no valid slot index can be resolved", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby"
      })]
    });
    const hostItem = actor.items.get("host-1");
    const rubyGem = actor.items.get("gem-ruby");
    const activity = createReloadActivity({
      actor,
      item: hostItem
    });
    allowOwner(actor);
    allowOwner(hostItem);
    installTestUsers({
      currentUserId: "player-1",
      currentIsGM: false
    });

    globalThis.fromUuid = async (uuid) => {
      if (uuid === activity.uuid) {
        return activity;
      }
      if (uuid === hostItem.uuid) {
        return hostItem;
      }
      if (uuid === rubyGem.uuid) {
        return rubyGem;
      }
      return null;
    };

    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { SocketService } = await import("../scripts/core/services/SocketService.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");

    const originalCanEditSockets = SocketAPI.canEditSockets;
    const originalMutateSockets = SocketService.mutateSockets;
    let mutateCalled = false;

    SocketAPI.canEditSockets = async () => true;
    SocketService.mutateSockets = async () => {
      mutateCalled = true;
      return { ok: true };
    };

    try {
      const result = await ScMoreActivitiesIntegration.reloadGem(activity, {
        item: hostItem,
        gemItem: rubyGem
      });

      assert.equal(mutateCalled, false);
      assert.deepEqual(result, {
        ok: false,
        changed: false,
        reason: "invalid-slot-index",
        message: "Choose a valid empty socket."
      });
    } finally {
      SocketAPI.canEditSockets = originalCanEditSockets;
      SocketService.mutateSockets = originalMutateSockets;
    }
  });

  test("rejects reload-gem requests when the selected document is not a gem", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }, {
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} }
      }, {
        id: "not-a-gem",
        uuid: "Actor.actor-1.Item.not-a-gem",
        name: "Quartz Chunk",
        type: "loot",
        system: {
          quantity: 1,
          type: { value: "treasure" }
        }
      }]
    });
    const activity = createReloadActivity({
      actor,
      item: actor.items.get("activity-1")
    });
    const hostItem = actor.items.get("host-1");
    const nonGemItem = actor.items.get("not-a-gem");
    allowOwner(actor);
    allowOwner(hostItem);

    globalThis.fromUuid = async (uuid) => {
      if (uuid === activity.uuid) {
        return activity;
      }
      if (uuid === hostItem.uuid) {
        return hostItem;
      }
      if (uuid === nonGemItem.uuid) {
        return nonGemItem;
      }
      return null;
    };

    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );

    const result = await ScMoreActivitiesIntegration.handleQuery({
      activityUuid: activity.uuid,
      gemUuid: nonGemItem.uuid,
      itemUuid: hostItem.uuid,
      operation: "reload-gem",
      requestUserId: "player-1",
      slotIndex: 0
    });

    assert.deepEqual(result, {
      ok: false,
      changed: false,
      reason: "gem-not-available",
      message: "The selected gem is no longer available in the source actor inventory."
    });
  });

  test("surfaces SocketService failures when reload-gem cannot add the selected gem", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }, {
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby"
      })]
    });
    const activity = createReloadActivity({
      actor,
      item: actor.items.get("activity-1")
    });
    const hostItem = actor.items.get("host-1");
    const rubyGem = actor.items.get("gem-ruby");
    allowOwner(actor);
    allowOwner(hostItem);

    globalThis.fromUuid = async (uuid) => {
      if (uuid === activity.uuid) {
        return activity;
      }
      if (uuid === hostItem.uuid) {
        return hostItem;
      }
      if (uuid === rubyGem.uuid) {
        return rubyGem;
      }
      return null;
    };

    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { SocketService } = await import("../scripts/core/services/SocketService.js");

    const originalMutateSockets = SocketService.mutateSockets;

    SocketService.mutateSockets = async () => ({
      success: false,
      reason: "socket-blocked",
      message: "Blocked by socket rules."
    });

    try {
      const result = await ScMoreActivitiesIntegration.handleQuery({
        activityUuid: activity.uuid,
        gemUuid: rubyGem.uuid,
        itemUuid: hostItem.uuid,
        operation: "reload-gem",
        requestUserId: "player-1",
        slotIndex: 0
      });

      assert.equal(result.ok, false);
      assert.equal(result.changed, false);
      assert.equal(result.reason, "socket-blocked");
      assert.equal(result.message, "Blocked by socket rules.");
      assert.deepEqual(result.result, {
        success: false,
        reason: "socket-blocked",
        message: "Blocked by socket rules."
      });
    } finally {
      SocketService.mutateSockets = originalMutateSockets;
    }
  });

  test("filters gem reload candidates by match pattern, allowed host types, and slot conditions", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }, {
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: {
          activities: {},
          type: { value: "martial" }
        }
      }, createGemItemSource({
        id: "gem-blocked",
        name: "Greater Fire Gem",
        allowedTypes: ["equipment"]
      }), createGemItemSource({
        id: "gem-good",
        name: "Greater Fire Gem",
        quantity: 2,
        allowedTypes: ["weapon:martial"]
      })]
    });
    const activityItem = actor.items.get("activity-1");
    const hostItem = actor.items.get("host-1");
    const goodGem = actor.items.get("gem-good");

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { ModuleSettings } = await import("../scripts/core/settings/ModuleSettings.js");
    const { SocketSlotConfigService } = await import("../scripts/core/services/SocketSlotConfigService.js");
    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { ScMoreActivitiesGemReloadActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/gem-reload/ScMoreActivitiesGemReloadActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalIsItemSocketableByType = ModuleSettings.isItemSocketableByType;
    const originalEvaluateCondition = SocketSlotConfigService.evaluateCondition;
    const originalReloadGem = ScMoreActivitiesIntegration.reloadGem;
    const evaluatedSlots = [];

    SelectionController.selectItem = async () => hostItem;
    SocketAPI.getItemSlots = async () => [{
      slotIndex: 0,
      hasGem: false,
      slot: {}
    }, {
      slotIndex: 1,
      hasGem: false,
      slot: {}
    }];
    ModuleSettings.isItemSocketableByType = () => true;
    SocketSlotConfigService.evaluateCondition = async ({ slotIndex, gemItem }) => {
      evaluatedSlots.push(`${gemItem.id}:${slotIndex}`);
      return {
        allowed: gemItem === goodGem && slotIndex === 1
      };
    };
    ScMoreActivitiesIntegration.reloadGem = async (activity, { item, gemItem, slotIndex }) => {
      assert.equal(activity.item, activityItem);
      assert.equal(item, hostItem);
      assert.equal(gemItem, goodGem);
      assert.equal(slotIndex, 1);
      return {
        ok: true,
        changed: true,
        message: "Socketed."
      };
    };

    try {
      const result = await ScMoreActivitiesGemReloadActivityService.execute({
        actor,
        item: activityItem,
        reload: {
          gemMode: "match",
          gemQuery: "*fire*",
          slotMode: "ordered"
        }
      }, {
        results: { ok: true }
      });

      assert.deepEqual(evaluatedSlots, [
        "gem-good:0",
        "gem-good:1"
      ]);
      assert.deepEqual(result, {
        ok: true,
        changed: true,
        message: "Socketed."
      });
    } finally {
      SelectionController.selectItem = originalSelectItem;
      SocketAPI.getItemSlots = originalGetItemSlots;
      ModuleSettings.isItemSocketableByType = originalIsItemSocketableByType;
      SocketSlotConfigService.evaluateCondition = originalEvaluateCondition;
      ScMoreActivitiesIntegration.reloadGem = originalReloadGem;
    }
  });

  test("reloads the activity's own item without a selection when target mode is self", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: [{}, {}]
          }
        }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby"
      })]
    });
    const hostItem = actor.items.get("host-1");
    const rubyGem = actor.items.get("gem-ruby");
    hostItem.isOwner = true;

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { ModuleSettings } = await import("../scripts/core/settings/ModuleSettings.js");
    const { SocketSlotConfigService } = await import("../scripts/core/services/SocketSlotConfigService.js");
    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { ScMoreActivitiesGemReloadActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/gem-reload/ScMoreActivitiesGemReloadActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalIsItemSocketableByType = ModuleSettings.isItemSocketableByType;
    const originalEvaluateCondition = SocketSlotConfigService.evaluateCondition;
    const originalReloadGem = ScMoreActivitiesIntegration.reloadGem;
    let selectionAttempted = false;

    SelectionController.selectItem = async () => {
      selectionAttempted = true;
      return null;
    };
    SocketAPI.getItemSlots = async (itemUuid, options = {}) => {
      assert.equal(itemUuid, hostItem.uuid);
      assert.equal(options.includeSnapshots, true);
      return [{
        slotIndex: 0,
        hasGem: false,
        slot: {}
      }];
    };
    ModuleSettings.isItemSocketableByType = () => true;
    SocketSlotConfigService.evaluateCondition = async () => ({ allowed: true });
    ScMoreActivitiesIntegration.reloadGem = async (activity, { item, gemItem, slotIndex }) => {
      assert.equal(activity.item, hostItem);
      assert.equal(item, hostItem);
      assert.equal(gemItem, rubyGem);
      assert.equal(slotIndex, 0);
      return {
        ok: true,
        changed: true,
        message: "Socketed."
      };
    };

    try {
      const result = await ScMoreActivitiesGemReloadActivityService.execute({
        actor,
        item: hostItem,
        reload: {
          gemMode: "prompt",
          slotMode: "ordered",
          targetMode: "self"
        }
      }, {
        results: { ok: true }
      });

      assert.equal(selectionAttempted, false);
      assert.deepEqual(result, {
        ok: true,
        changed: true,
        message: "Socketed."
      });
    } finally {
      SelectionController.selectItem = originalSelectItem;
      SocketAPI.getItemSlots = originalGetItemSlots;
      ModuleSettings.isItemSocketableByType = originalIsItemSocketableByType;
      SocketSlotConfigService.evaluateCondition = originalEvaluateCondition;
      ScMoreActivitiesIntegration.reloadGem = originalReloadGem;
    }
  });

  test("warns without reloading when the self target has no empty sockets", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby"
      })]
    });
    const hostItem = actor.items.get("host-1");
    hostItem.isOwner = true;

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { ModuleSettings } = await import("../scripts/core/settings/ModuleSettings.js");
    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { ScMoreActivitiesGemReloadActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/gem-reload/ScMoreActivitiesGemReloadActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalIsItemSocketableByType = ModuleSettings.isItemSocketableByType;
    const originalReloadGem = ScMoreActivitiesIntegration.reloadGem;
    const originalWarn = ui.notifications.warn;
    const warnings = [];
    let selectionAttempted = false;
    let reloadCalled = false;

    SelectionController.selectItem = async () => {
      selectionAttempted = true;
      return null;
    };
    SocketAPI.getItemSlots = async () => [{
      slotIndex: 0,
      hasGem: true,
      slot: {
        gem: { name: "Sapphire", img: "icons/sapphire.webp" }
      }
    }];
    ModuleSettings.isItemSocketableByType = () => true;
    ScMoreActivitiesIntegration.reloadGem = async () => {
      reloadCalled = true;
      return { ok: true };
    };
    ui.notifications.warn = (message) => {
      warnings.push(message);
      return message;
    };

    try {
      const usageResults = { ok: true, unchanged: true };
      const result = await ScMoreActivitiesGemReloadActivityService.execute({
        actor,
        item: hostItem,
        reload: {
          gemMode: "prompt",
          slotMode: "ordered",
          targetMode: "self"
        }
      }, {
        results: usageResults
      });

      assert.equal(selectionAttempted, false);
      assert.equal(reloadCalled, false);
      assert.strictEqual(result, usageResults);
      assert.deepEqual(warnings, [
        "Socketed Sword has no empty sockets available."
      ]);
    } finally {
      SelectionController.selectItem = originalSelectItem;
      SocketAPI.getItemSlots = originalGetItemSlots;
      ModuleSettings.isItemSocketableByType = originalIsItemSocketableByType;
      ScMoreActivitiesIntegration.reloadGem = originalReloadGem;
      ui.notifications.warn = originalWarn;
    }
  });

  test("opens the gem picker in prompt mode and sockets the picked gem", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }, {
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby",
        quantity: 2
      }), createGemItemSource({
        id: "gem-sapphire",
        name: "Sapphire"
      })]
    });
    const activityItem = actor.items.get("activity-1");
    const hostItem = actor.items.get("host-1");
    const sapphireGem = actor.items.get("gem-sapphire");

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { ModuleSettings } = await import("../scripts/core/settings/ModuleSettings.js");
    const { SocketSlotConfigService } = await import("../scripts/core/services/SocketSlotConfigService.js");
    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { ScMoreActivitiesGemPickerApp } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesGemPickerApp.js"
    );
    const { ScMoreActivitiesGemReloadActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/gem-reload/ScMoreActivitiesGemReloadActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalIsItemSocketableByType = ModuleSettings.isItemSocketableByType;
    const originalEvaluateCondition = SocketSlotConfigService.evaluateCondition;
    const originalReloadGem = ScMoreActivitiesIntegration.reloadGem;
    const originalRender = ScMoreActivitiesGemPickerApp.prototype.render;
    let pickerContextPromise = null;

    SelectionController.selectItem = async () => hostItem;
    SocketAPI.getItemSlots = async () => [{
      slotIndex: 0,
      hasGem: false,
      slot: {}
    }];
    ModuleSettings.isItemSocketableByType = () => true;
    SocketSlotConfigService.evaluateCondition = async () => ({ allowed: true });
    ScMoreActivitiesIntegration.reloadGem = async (activity, { item, gemItem, slotIndex }) => {
      assert.equal(activity.item, activityItem);
      assert.equal(item, hostItem);
      assert.equal(gemItem, sapphireGem);
      assert.equal(slotIndex, 0);
      return {
        ok: true,
        changed: true,
        message: "Socketed."
      };
    };
    ScMoreActivitiesGemPickerApp.prototype.render = function render() {
      pickerContextPromise = this._preparePartContext("body", {}, {});
      this.submit(sapphireGem.uuid);
      return this;
    };

    try {
      const result = await ScMoreActivitiesGemReloadActivityService.execute({
        actor,
        item: activityItem,
        reload: {
          gemMode: "prompt",
          slotMode: "ordered"
        }
      }, {
        results: { ok: true }
      });
      const pickerContext = await pickerContextPromise;

      assert.equal(pickerContext.hasGems, true);
      assert.equal(pickerContext.showFilter, false);
      assert.deepEqual(pickerContext.gems.map((gem) => gem.name), ["Ruby", "Sapphire"]);
      assert.deepEqual(pickerContext.gems.map((gem) => gem.uuid), [
        "Actor.actor-1.Item.gem-ruby",
        "Actor.actor-1.Item.gem-sapphire"
      ]);
      assert.equal(pickerContext.gems[0].quantityLabel, "×2");
      assert.equal(pickerContext.gems[1].quantityLabel, "");
      assert.equal(pickerContext.gems[0].destinationSlot.slotIndex, 0);
      assert.equal(pickerContext.gems[0].destinationLabel, "Will socket into Slot 1");
      assert.equal(
        pickerContext.subtitle,
        "Actor has 2 compatible gems for Socketed Sword. Choose which one to socket."
      );
      assert.deepEqual(result, {
        ok: true,
        changed: true,
        message: "Socketed."
      });
    } finally {
      SelectionController.selectItem = originalSelectItem;
      SocketAPI.getItemSlots = originalGetItemSlots;
      ModuleSettings.isItemSocketableByType = originalIsItemSocketableByType;
      SocketSlotConfigService.evaluateCondition = originalEvaluateCondition;
      ScMoreActivitiesIntegration.reloadGem = originalReloadGem;
      if (originalRender === undefined) {
        delete ScMoreActivitiesGemPickerApp.prototype.render;
      } else {
        ScMoreActivitiesGemPickerApp.prototype.render = originalRender;
      }
    }
  });

  test("shows the gem picker filter only when there are many compatible gems", async () => {
    const { ScMoreActivitiesGemPickerApp } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesGemPickerApp.js"
    );

    const manyGems = Array.from({ length: 7 }, (_, index) => ({
      name: `Gem ${index + 1}`,
      filterName: `gem ${index + 1}`,
      uuid: `Actor.actor-1.Item.gem-${index + 1}`
    }));
    const filteredApp = new ScMoreActivitiesGemPickerApp({ gems: manyGems });
    const filteredContext = await filteredApp._preparePartContext("body", {}, {});

    assert.equal(filteredContext.showFilter, true);
    assert.equal(filteredContext.gems.length, 7);

    const smallApp = new ScMoreActivitiesGemPickerApp({ gems: manyGems.slice(0, 3) });
    const smallContext = await smallApp._preparePartContext("body", {}, {});

    assert.equal(smallContext.showFilter, false);
  });

  test("opens the slot picker in prompt slot mode when multiple compatible slots are available", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }, {
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} }
      }, createGemItemSource({
        id: "gem-ruby",
        name: "Ruby"
      })]
    });
    const hostItem = actor.items.get("host-1");

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { ModuleSettings } = await import("../scripts/core/settings/ModuleSettings.js");
    const { SocketSlotConfigService } = await import("../scripts/core/services/SocketSlotConfigService.js");
    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { ScMoreActivitiesSlotPickerApp } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesSlotPickerApp.js"
    );
    const { ScMoreActivitiesGemReloadActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/gem-reload/ScMoreActivitiesGemReloadActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalIsItemSocketableByType = ModuleSettings.isItemSocketableByType;
    const originalEvaluateCondition = SocketSlotConfigService.evaluateCondition;
    const originalReloadGem = ScMoreActivitiesIntegration.reloadGem;
    const originalRender = ScMoreActivitiesSlotPickerApp.prototype.render;
    let pickerContextPromise = null;
    let reloadCalled = false;
    let renderArgument = null;

    SelectionController.selectItem = async () => hostItem;
    SocketAPI.getItemSlots = async () => [{
      slotIndex: 0,
      hasGem: false,
      slot: {
        name: "Top Socket"
      }
    }, {
      slotIndex: 1,
      hasGem: false,
      slot: {
        name: "Lower Socket"
      }
    }];
    ModuleSettings.isItemSocketableByType = () => true;
    SocketSlotConfigService.evaluateCondition = async () => ({ allowed: true });
    ScMoreActivitiesIntegration.reloadGem = async () => {
      reloadCalled = true;
      return { ok: true };
    };
    ScMoreActivitiesSlotPickerApp.prototype.render = function render(force) {
      renderArgument = force;
      pickerContextPromise = this._preparePartContext("body", {}, {});
      return this;
    };

    try {
      const usageResults = { ok: true, unchanged: true };
      const result = await ScMoreActivitiesGemReloadActivityService.execute({
        actor,
        item: actor.items.get("activity-1"),
        reload: {
          gemMode: "prompt",
          slotMode: "prompt"
        }
      }, {
        results: usageResults
      });
      const pickerContext = await pickerContextPromise;

      assert.equal(renderArgument, true);
      assert.equal(reloadCalled, false);
      assert.strictEqual(result, usageResults);
      assert.equal(pickerContext.hasSlots, true);
      assert.equal(pickerContext.slots.length, 2);
      assert.deepEqual(pickerContext.slots.map((slot) => slot.slotLabel), [
        "Slot 1",
        "Slot 2"
      ]);
      assert.equal(
        pickerContext.subtitle,
        "Socketed Sword has 2 compatible empty slots for Ruby. Choose one."
      );
    } finally {
      SelectionController.selectItem = originalSelectItem;
      SocketAPI.getItemSlots = originalGetItemSlots;
      ModuleSettings.isItemSocketableByType = originalIsItemSocketableByType;
      SocketSlotConfigService.evaluateCondition = originalEvaluateCondition;
      ScMoreActivitiesIntegration.reloadGem = originalReloadGem;
      if (originalRender === undefined) {
        delete ScMoreActivitiesSlotPickerApp.prototype.render;
      } else {
        ScMoreActivitiesSlotPickerApp.prototype.render = originalRender;
      }
    }
  });

  test("warns and returns the original results when a configured gem query is blank", async () => {
    const actor = createTestActor({
      items: [{
        id: "activity-1",
        uuid: "Actor.actor-1.Item.activity-1",
        name: "Gem Loader",
        type: "loot",
        system: { activities: {} }
      }]
    });

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { ScMoreActivitiesGemReloadActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/gem-reload/ScMoreActivitiesGemReloadActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalWarn = ui.notifications.warn;
    const warnings = [];
    let selectionAttempted = false;

    SelectionController.selectItem = async () => {
      selectionAttempted = true;
      return null;
    };
    ui.notifications.warn = (message) => {
      warnings.push(message);
      return message;
    };

    try {
      const usageResults = { ok: true, unchanged: true };
      const result = await ScMoreActivitiesGemReloadActivityService.execute({
        actor,
        item: actor.items.get("activity-1"),
        reload: {
          gemMode: "match",
          gemQuery: "   ",
          slotMode: "ordered"
        }
      }, {
        results: usageResults
      });

      assert.equal(selectionAttempted, false);
      assert.strictEqual(result, usageResults);
      assert.deepEqual(warnings, [
        "Configure a gem name or match pattern before using this activity."
      ]);
    } finally {
      SelectionController.selectItem = originalSelectItem;
      ui.notifications.warn = originalWarn;
    }
  });

  test("recharges the selected pool even when the dialog confirm button is not inside a form", async () => {
    const actor = createTestActor({
      items: [{
        id: "host-1",
        uuid: "Actor.actor-1.Item.host-1",
        name: "Socketed Sword",
        type: "weapon",
        system: { activities: {} },
        flags: {
          [Constants.MODULE_ID]: {
            sockets: []
          }
        }
      }]
    });
    const hostItem = actor.items.get("host-1");

    const { SelectionController } = await import("../scripts/core/api/SelectionController.js");
    const { SocketAPI } = await import("../scripts/core/api/SocketAPI.js");
    const { ModuleSettings } = await import("../scripts/core/settings/ModuleSettings.js");
    const { ScMoreActivitiesIntegration } = await import(
      "../scripts/core/integrations/sc-more-activities/ScMoreActivitiesIntegration.js"
    );
    const { ScMoreActivitiesRechargeRolls } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/shared/ScMoreActivitiesRechargeRolls.js"
    );
    const { ScMoreActivitiesSocketPoolRechargeActivityService } = await import(
      "../scripts/core/integrations/sc-more-activities/activities/socket-pool-recharge/ScMoreActivitiesSocketPoolRechargeActivityService.js"
    );

    const originalSelectItem = SelectionController.selectItem;
    const originalGetItemSlots = SocketAPI.getItemSlots;
    const originalIsItemSocketableByType = ModuleSettings.isItemSocketableByType;
    const originalEnsureActorForCheck = ScMoreActivitiesRechargeRolls.ensureActorForCheck;
    const originalPerformCheck = ScMoreActivitiesRechargeRolls.performCheck;
    const originalRollAmount = ScMoreActivitiesRechargeRolls.rollAmount;
    const originalRechargePool = ScMoreActivitiesIntegration.rechargePool;
    const originalPrompt = foundry.applications.api.DialogV2.prompt;

    SelectionController.selectItem = async () => hostItem;
    SocketAPI.getItemSlots = async () => [{
      slotIndex: 0,
      hasGem: true,
      slot: {
        gem: { name: "Sapphire", img: "icons/sapphire.webp" },
        _gemData: {
          name: "Sapphire",
          img: "icons/sapphire.webp",
          data: JSON.stringify({
            name: "Sapphire",
            flags: {
              [Constants.MODULE_ID]: {
                [Constants.FLAG_GEM_RESOURCE]: {
                  key: "mana",
                  max: 5,
                  value: 1
                }
              }
            }
          })
        }
      }
    }, {
      slotIndex: 1,
      hasGem: true,
      slot: {
        gem: { name: "Ruby", img: "icons/ruby.webp" },
        _gemData: {
          name: "Ruby",
          img: "icons/ruby.webp",
          data: JSON.stringify({
            name: "Ruby",
            flags: {
              [Constants.MODULE_ID]: {
                [Constants.FLAG_GEM_RESOURCE]: {
                  key: "stamina",
                  max: 3,
                  value: 1
                }
              }
            }
          })
        }
      }
    }];
    ModuleSettings.isItemSocketableByType = () => true;
    ScMoreActivitiesRechargeRolls.ensureActorForCheck = () => true;
    ScMoreActivitiesRechargeRolls.performCheck = async () => ({ ok: true, success: true });
    ScMoreActivitiesRechargeRolls.rollAmount = async () => 2;
    ScMoreActivitiesIntegration.rechargePool = async (activity, { item, resourceKey, amount }) => {
      assert.equal(item, hostItem);
      assert.equal(resourceKey, "mana");
      assert.equal(amount, 2);
      return {
        ok: true,
        changed: true,
        message: "Restored charges."
      };
    };
    foundry.applications.api.DialogV2.prompt = async (config) => config.ok.callback(
      {
        currentTarget: {
          ownerDocument: {
            querySelector(selector) {
              return selector === '[name="poolKey"]' ? { value: "mana" } : null;
            }
          }
        }
      },
      {}
    );

    try {
      const result = await ScMoreActivitiesSocketPoolRechargeActivityService.execute({
        item: { actor },
        recharge: {}
      }, {
        results: { ok: true }
      });

      assert.deepEqual(result, {
        ok: true,
        changed: true,
        message: "Restored charges."
      });
    } finally {
      SelectionController.selectItem = originalSelectItem;
      SocketAPI.getItemSlots = originalGetItemSlots;
      ModuleSettings.isItemSocketableByType = originalIsItemSocketableByType;
      ScMoreActivitiesRechargeRolls.ensureActorForCheck = originalEnsureActorForCheck;
      ScMoreActivitiesRechargeRolls.performCheck = originalPerformCheck;
      ScMoreActivitiesRechargeRolls.rollAmount = originalRollAmount;
      ScMoreActivitiesIntegration.rechargePool = originalRechargePool;
      foundry.applications.api.DialogV2.prompt = originalPrompt;
    }
  });
});
