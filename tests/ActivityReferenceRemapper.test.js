import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ActivityReferenceRemapper } from "../scripts/core/services/ActivityReferenceRemapper.js";

describe("ActivityReferenceRemapper", () => {
  test("remaps sc-chain child ids after socket activity transfer", () => {
    const sourceActivities = [{
      id: "source-chain",
      type: "sc-chain",
      chain: { activityIds: "source-damage, source-effect" }
    }];
    const idMap = new Map([
      ["source-chain", "host-chain"],
      ["source-damage", "host-damage"],
      ["source-effect", "host-effect"]
    ]);

    assert.deepEqual(ActivityReferenceRemapper.buildUpdateData(sourceActivities, idMap), {
      "system.activities.host-chain.chain.activityIds": "host-damage\nhost-effect"
    });
  });

  test("remaps conditional-chain node activity ids and preserves empty decision nodes", () => {
    globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };
    const sourceActivities = [{
      id: "source-flow",
      type: "sc-conditional-chain",
      flow: {
        nodes: [
          { nodeId: "start", activityId: "source-child" },
          { nodeId: "decision", activityId: "" }
        ]
      }
    }];
    const idMap = new Map([
      ["source-flow", "host-flow"],
      ["source-child", "host-child"]
    ]);

    assert.deepEqual(ActivityReferenceRemapper.buildUpdateData(sourceActivities, idMap), {
      "system.activities.host-flow.flow.nodes": [
        { nodeId: "start", activityId: "host-child" },
        { nodeId: "decision", activityId: "" }
      ]
    });
    delete globalThis.foundry;
  });

  test("removes references to source activities that were not transferred", () => {
    globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value) } };
    const sourceActivities = [
      {
        id: "source-chain",
        type: "sc-chain",
        chain: { activityIds: "source-child, external-child" }
      },
      {
        id: "source-flow",
        type: "sc-conditional-chain",
        flow: { nodes: [{ nodeId: "step", activityId: "source-child" }] }
      },
      { id: "source-child", type: "unsupported" }
    ];
    const idMap = new Map([
      ["source-chain", "host-chain"],
      ["source-flow", "host-flow"]
    ]);

    assert.deepEqual(ActivityReferenceRemapper.buildUpdateData(sourceActivities, idMap), {
      "system.activities.host-chain.chain.activityIds": "external-child",
      "system.activities.host-flow.flow.nodes": [{ nodeId: "step", activityId: "" }]
    });
    delete globalThis.foundry;
  });
});
