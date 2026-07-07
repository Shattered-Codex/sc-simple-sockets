import { Constants } from "../../Constants.js";

export const SC_MORE_ACTIVITIES_MODULE_ID = "sc-more-activities";
export const SC_MORE_ACTIVITIES_REGISTER_HOOK = `${SC_MORE_ACTIVITIES_MODULE_ID}.registerActivities`;
export const SC_MORE_ACTIVITIES_QUERY_ID = `${Constants.MODULE_ID}.scMoreActivitiesOperation`;
export const SC_MORE_ACTIVITIES_QUERY_TIMEOUT = 120000;

export const SC_MORE_ACTIVITIES_ACTIVITY_TYPES = Object.freeze({
  GEM_RELOAD: "sc-socket-gem-reload",
  SOCKET_EXTRACTION: "sc-socket-extraction",
  SOCKET_POOL_RECHARGE: "sc-socket-pool-recharge",
  SOCKET_RECHARGE: "sc-socket-recharge",
  SOCKET_SLOT: "sc-socket-slot"
});

export const SC_MORE_ACTIVITIES_GROUP = Object.freeze({
  icon: "fa-solid fa-gem",
  id: Constants.MODULE_ID,
  label: "SCSockets.Integrations.ScMoreActivities.GroupLabel",
  order: 120
});

export const SC_MORE_ACTIVITIES_ICONS = Object.freeze({
  GEM_RELOAD: `modules/${Constants.MODULE_ID}/assets/activity-icons/scma-socket-gem-reload.svg`,
  SOCKET_EXTRACTION: `modules/${Constants.MODULE_ID}/assets/activity-icons/scma-socket-extraction-pincers.svg`,
  SOCKET_POOL_RECHARGE: `modules/${Constants.MODULE_ID}/assets/activity-icons/scma-socket-pool-recharge-energy-tank.svg`,
  SOCKET_RECHARGE: `modules/${Constants.MODULE_ID}/assets/activity-icons/scma-socket-recharge-charging.svg`,
  SOCKET_SLOT: `modules/${Constants.MODULE_ID}/assets/activity-icons/scma-socket-slot-power-ring.svg`
});
