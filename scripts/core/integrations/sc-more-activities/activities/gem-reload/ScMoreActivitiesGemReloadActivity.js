import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { SC_MORE_ACTIVITIES_ACTIVITY_TYPES, SC_MORE_ACTIVITIES_ICONS } from "../../ScMoreActivitiesConstants.js";
import { ScMoreActivitiesGemReloadActivityData } from "./ScMoreActivitiesGemReloadActivityData.js";
import { ScMoreActivitiesGemReloadActivityService } from "./ScMoreActivitiesGemReloadActivityService.js";
import { ScMoreActivitiesGemReloadActivitySheet } from "./ScMoreActivitiesGemReloadActivitySheet.js";

export class ScMoreActivitiesGemReloadActivity extends dnd5e.documents.activity.ActivityMixin(ScMoreActivitiesGemReloadActivityData) {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SCSockets.Integrations.ScMoreActivities.GemReload"];

  static metadata = Object.freeze(
    foundry.utils.mergeObject(super.metadata, {
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_RELOAD,
      img: SC_MORE_ACTIVITIES_ICONS.GEM_RELOAD,
      title: "SCSockets.Integrations.ScMoreActivities.GemReload.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.GemReload.Hint",
      sheetClass: ScMoreActivitiesGemReloadActivitySheet
    }, { inplace: false })
  );

  static defineSchema() {
    return ScMoreActivitiesGemReloadActivityData.defineSchema();
  }

  static availableForItem(item, ...args) {
    const base = typeof super.availableForItem === "function" ? super.availableForItem(item, ...args) : true;
    return base && ScMoreActivitiesIntegration.isTypeEnabled(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_RELOAD
    );
  }

  async use(usage = {}, dialog = {}, message = {}) {
    if (!ScMoreActivitiesIntegration.canUseType(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_RELOAD,
      "SCSockets.Integrations.ScMoreActivities.GemReload.Title"
    )) {
      return undefined;
    }

    const results = await super.use(usage, dialog, message);
    if (results === undefined) {
      return results;
    }

    return ScMoreActivitiesGemReloadActivityService.execute(this, { usage, dialog, message, results });
  }
}
