export class ActivityReferenceRemapper {
  static buildUpdateData(sourceActivities, activityIdMap) {
    const idMap = ActivityReferenceRemapper.#normalizeIdMap(activityIdMap);
    const updateData = {};
    const activities = Array.from(sourceActivities ?? []);
    const sourceActivityIds = new Set(
      activities.map((activity) => {
        const source = typeof activity?.toObject === "function" ? activity.toObject() : activity;
        return String(activity?.id ?? source?._id ?? "").trim();
      }).filter(Boolean)
    );

    for (const activity of activities) {
      const source = typeof activity?.toObject === "function" ? activity.toObject() : activity;
      const sourceId = String(activity?.id ?? source?._id ?? "").trim();
      const hostId = idMap.get(sourceId);
      if (!sourceId || !hostId) continue;

      if (source?.type === "sc-chain") {
        const remappedIds = ActivityReferenceRemapper.remapActivityIds(
          source?.chain?.activityIds,
          idMap,
          sourceActivityIds
        );
        updateData[`system.activities.${hostId}.chain.activityIds`] = remappedIds;
      }

      if (source?.type === "sc-conditional-chain" && Array.isArray(source?.flow?.nodes)) {
        updateData[`system.activities.${hostId}.flow.nodes`] = source.flow.nodes.map((node) => ({
          ...foundry.utils.deepClone(node),
          activityId: ActivityReferenceRemapper.remapActivityId(
            node?.activityId,
            idMap,
            sourceActivityIds
          )
        }));
      }
    }

    return updateData;
  }

  static remapActivityIds(value, activityIdMap, sourceActivityIds = new Set()) {
    const idMap = ActivityReferenceRemapper.#normalizeIdMap(activityIdMap);
    return String(value ?? "")
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((activityId) => (
        ActivityReferenceRemapper.remapActivityId(activityId, idMap, sourceActivityIds)
      ))
      .filter(Boolean)
      .join("\n");
  }

  static remapActivityId(value, activityIdMap, sourceActivityIds = new Set()) {
    const activityId = String(value ?? "").trim();
    if (!activityId) return "";
    const remappedId = ActivityReferenceRemapper.#normalizeIdMap(activityIdMap).get(activityId);
    if (remappedId) return remappedId;
    return sourceActivityIds.has(activityId) ? "" : activityId;
  }

  static #normalizeIdMap(value) {
    if (value instanceof Map) return value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return new Map();
    return new Map(Object.entries(value).map(([sourceId, hostId]) => [String(sourceId), String(hostId)]));
  }
}
