import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { SC_MORE_ACTIVITIES_ACTIVITY_TYPES, SC_MORE_ACTIVITIES_ICONS } from "../../ScMoreActivitiesConstants.js";
import { ScMoreActivitiesSocketExtractionActivityData } from "./ScMoreActivitiesSocketExtractionActivityData.js";
import { ScMoreActivitiesSocketExtractionActivityService } from "./ScMoreActivitiesSocketExtractionActivityService.js";
import { ScMoreActivitiesSocketExtractionActivitySheet } from "./ScMoreActivitiesSocketExtractionActivitySheet.js";

export class ScMoreActivitiesSocketExtractionActivity extends dnd5e.documents.activity.ActivityMixin(ScMoreActivitiesSocketExtractionActivityData) {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SCSockets.Integrations.ScMoreActivities.SocketExtraction"];

  static metadata = Object.freeze(
    foundry.utils.mergeObject(super.metadata, {
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_EXTRACTION,
      img: SC_MORE_ACTIVITIES_ICONS.SOCKET_EXTRACTION,
      title: "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Hint",
      sheetClass: ScMoreActivitiesSocketExtractionActivitySheet
    }, { inplace: false })
  );

  static defineSchema() {
    return ScMoreActivitiesSocketExtractionActivityData.defineSchema();
  }

  static availableForItem(item, ...args) {
    const base = typeof super.availableForItem === "function" ? super.availableForItem(item, ...args) : true;
    return base && ScMoreActivitiesIntegration.isTypeEnabled(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_EXTRACTION
    );
  }

  async use(usage = {}, dialog = {}, message = {}) {
    if (!ScMoreActivitiesIntegration.canUseType(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_EXTRACTION,
      "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Title"
    )) {
      return undefined;
    }

    const results = await super.use(usage, dialog, message);
    if (results === undefined) {
      return results;
    }

    return ScMoreActivitiesSocketExtractionActivityService.execute(this, { usage, dialog, message, results });
  }
}
