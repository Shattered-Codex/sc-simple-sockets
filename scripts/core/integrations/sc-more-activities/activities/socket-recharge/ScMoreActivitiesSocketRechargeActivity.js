import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { SC_MORE_ACTIVITIES_ACTIVITY_TYPES, SC_MORE_ACTIVITIES_ICONS } from "../../ScMoreActivitiesConstants.js";
import { ScMoreActivitiesSocketRechargeActivityData } from "./ScMoreActivitiesSocketRechargeActivityData.js";
import { ScMoreActivitiesSocketRechargeActivityService } from "./ScMoreActivitiesSocketRechargeActivityService.js";
import { ScMoreActivitiesSocketRechargeActivitySheet } from "./ScMoreActivitiesSocketRechargeActivitySheet.js";

export class ScMoreActivitiesSocketRechargeActivity extends dnd5e.documents.activity.ActivityMixin(ScMoreActivitiesSocketRechargeActivityData) {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SCSockets.Integrations.ScMoreActivities.SocketRecharge"];

  static metadata = Object.freeze(
    foundry.utils.mergeObject(super.metadata, {
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_RECHARGE,
      img: SC_MORE_ACTIVITIES_ICONS.SOCKET_RECHARGE,
      title: "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Hint",
      sheetClass: ScMoreActivitiesSocketRechargeActivitySheet
    }, { inplace: false })
  );

  static defineSchema() {
    return ScMoreActivitiesSocketRechargeActivityData.defineSchema();
  }

  static availableForItem(item, ...args) {
    const base = typeof super.availableForItem === "function" ? super.availableForItem(item, ...args) : true;
    return base && ScMoreActivitiesIntegration.isTypeEnabled(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_RECHARGE
    );
  }

  async use(usage = {}, dialog = {}, message = {}) {
    if (!ScMoreActivitiesIntegration.canUseType(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_RECHARGE,
      "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Title"
    )) {
      return undefined;
    }

    const results = await super.use(usage, dialog, message);
    if (results === undefined) {
      return results;
    }

    return ScMoreActivitiesSocketRechargeActivityService.execute(this, { usage, dialog, message, results });
  }
}
