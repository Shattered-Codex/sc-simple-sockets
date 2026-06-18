import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { SC_MORE_ACTIVITIES_ACTIVITY_TYPES, SC_MORE_ACTIVITIES_ICONS } from "../../ScMoreActivitiesConstants.js";
import { ScMoreActivitiesSocketSlotActivityData } from "./ScMoreActivitiesSocketSlotActivityData.js";
import { ScMoreActivitiesSocketSlotActivityService } from "./ScMoreActivitiesSocketSlotActivityService.js";
import { ScMoreActivitiesSocketSlotActivitySheet } from "./ScMoreActivitiesSocketSlotActivitySheet.js";

export class ScMoreActivitiesSocketSlotActivity extends dnd5e.documents.activity.ActivityMixin(ScMoreActivitiesSocketSlotActivityData) {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SCSockets.Integrations.ScMoreActivities.SocketSlot"];

  static metadata = Object.freeze(
    foundry.utils.mergeObject(super.metadata, {
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_SLOT,
      img: SC_MORE_ACTIVITIES_ICONS.SOCKET_SLOT,
      title: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketSlot.Hint",
      sheetClass: ScMoreActivitiesSocketSlotActivitySheet
    }, { inplace: false })
  );

  static defineSchema() {
    return ScMoreActivitiesSocketSlotActivityData.defineSchema();
  }

  static availableForItem(item, ...args) {
    const base = typeof super.availableForItem === "function" ? super.availableForItem(item, ...args) : true;
    return base && ScMoreActivitiesIntegration.isTypeEnabled(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_SLOT
    );
  }

  async use(usage = {}, dialog = {}, message = {}) {
    if (!ScMoreActivitiesIntegration.canUseType(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_SLOT,
      "SCSockets.Integrations.ScMoreActivities.SocketSlot.Title"
    )) {
      return undefined;
    }

    const results = await super.use(usage, dialog, message);
    if (results === undefined) {
      return results;
    }

    return ScMoreActivitiesSocketSlotActivityService.execute(this, { usage, dialog, message, results });
  }
}
