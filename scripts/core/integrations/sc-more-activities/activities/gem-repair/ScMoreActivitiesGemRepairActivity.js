import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { SC_MORE_ACTIVITIES_ACTIVITY_TYPES, SC_MORE_ACTIVITIES_ICONS } from "../../ScMoreActivitiesConstants.js";
import { ScMoreActivitiesGemRepairActivityData } from "./ScMoreActivitiesGemRepairActivityData.js";
import { ScMoreActivitiesGemRepairActivityService } from "./ScMoreActivitiesGemRepairActivityService.js";
import { ScMoreActivitiesGemRepairActivitySheet } from "./ScMoreActivitiesGemRepairActivitySheet.js";

export class ScMoreActivitiesGemRepairActivity extends dnd5e.documents.activity.ActivityMixin(ScMoreActivitiesGemRepairActivityData) {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SCSockets.Integrations.ScMoreActivities.GemRepair"];

  static metadata = Object.freeze(
    foundry.utils.mergeObject(super.metadata, {
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_REPAIR,
      img: SC_MORE_ACTIVITIES_ICONS.GEM_REPAIR,
      title: "SCSockets.Integrations.ScMoreActivities.GemRepair.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.GemRepair.Hint",
      sheetClass: ScMoreActivitiesGemRepairActivitySheet
    }, { inplace: false })
  );

  static defineSchema() {
    return ScMoreActivitiesGemRepairActivityData.defineSchema();
  }

  static availableForItem(item, ...args) {
    const base = typeof super.availableForItem === "function" ? super.availableForItem(item, ...args) : true;
    return base && ScMoreActivitiesIntegration.isTypeEnabled(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_REPAIR
    );
  }

  async use(usage = {}, dialog = {}, message = {}) {
    if (!ScMoreActivitiesIntegration.canUseType(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.GEM_REPAIR,
      "SCSockets.Integrations.ScMoreActivities.GemRepair.Title"
    )) {
      return undefined;
    }

    // Checked before the activity is used, so a use without anything to
    // repair does not spend its uses or resources.
    if (!ScMoreActivitiesGemRepairActivityService.ensureRepairable(this)) {
      return undefined;
    }

    const results = await super.use(usage, dialog, message);
    if (results === undefined) {
      return results;
    }

    return ScMoreActivitiesGemRepairActivityService.execute(this, { usage, dialog, message, results });
  }
}
