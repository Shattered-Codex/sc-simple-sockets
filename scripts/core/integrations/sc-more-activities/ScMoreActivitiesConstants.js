import { Constants } from "../../Constants.js";

export const SC_MORE_ACTIVITIES_MODULE_ID = "sc-more-activities";
export const SC_MORE_ACTIVITIES_REGISTER_HOOK = `${SC_MORE_ACTIVITIES_MODULE_ID}.registerActivities`;
export const SC_MORE_ACTIVITIES_QUERY_ID = `${Constants.MODULE_ID}.scMoreActivitiesOperation`;
export const SC_MORE_ACTIVITIES_QUERY_TIMEOUT = 120000;

export const SC_MORE_ACTIVITIES_ACTIVITY_TYPES = Object.freeze({
  SOCKET_EXTRACTION: "sc-socket-extraction",
  SOCKET_SLOT: "sc-socket-slot"
});

export const SC_MORE_ACTIVITIES_GROUP = Object.freeze({
  icon: "fa-solid fa-gem",
  id: Constants.MODULE_ID,
  label: "SCSockets.Integrations.ScMoreActivities.GroupLabel",
  order: 120
});

export const SC_MORE_ACTIVITIES_ICONS = Object.freeze({
  SOCKET_EXTRACTION: `modules/${Constants.MODULE_ID}/assets/gems/normal-topaz.webp`,
  SOCKET_SLOT: Constants.SOCKET_SLOT_IMG
});
