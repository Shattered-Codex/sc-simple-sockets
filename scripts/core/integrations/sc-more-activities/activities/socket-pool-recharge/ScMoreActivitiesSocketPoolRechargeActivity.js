import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { SC_MORE_ACTIVITIES_ACTIVITY_TYPES, SC_MORE_ACTIVITIES_ICONS } from "../../ScMoreActivitiesConstants.js";
import { ScMoreActivitiesSocketPoolRechargeActivityData } from "./ScMoreActivitiesSocketPoolRechargeActivityData.js";
import { ScMoreActivitiesSocketPoolRechargeActivityService } from "./ScMoreActivitiesSocketPoolRechargeActivityService.js";
import { ScMoreActivitiesSocketPoolRechargeActivitySheet } from "./ScMoreActivitiesSocketPoolRechargeActivitySheet.js";

export class ScMoreActivitiesSocketPoolRechargeActivity extends dnd5e.documents.activity.ActivityMixin(ScMoreActivitiesSocketPoolRechargeActivityData) {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge"];

  static metadata = Object.freeze(
    foundry.utils.mergeObject(super.metadata, {
      type: SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_POOL_RECHARGE,
      img: SC_MORE_ACTIVITIES_ICONS.SOCKET_POOL_RECHARGE,
      title: "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Title",
      hint: "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Hint",
      sheetClass: ScMoreActivitiesSocketPoolRechargeActivitySheet
    }, { inplace: false })
  );

  static defineSchema() {
    return ScMoreActivitiesSocketPoolRechargeActivityData.defineSchema();
  }

  static availableForItem(item, ...args) {
    const base = typeof super.availableForItem === "function" ? super.availableForItem(item, ...args) : true;
    return base && ScMoreActivitiesIntegration.isTypeEnabled(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_POOL_RECHARGE
    );
  }

  async use(usage = {}, dialog = {}, message = {}) {
    if (!ScMoreActivitiesIntegration.canUseType(
      SC_MORE_ACTIVITIES_ACTIVITY_TYPES.SOCKET_POOL_RECHARGE,
      "SCSockets.Integrations.ScMoreActivities.SocketPoolRecharge.Title"
    )) {
      return undefined;
    }

    const results = await super.use(usage, dialog, message);
    if (results === undefined) {
      return results;
    }

    return ScMoreActivitiesSocketPoolRechargeActivityService.execute(this, { usage, dialog, message, results });
  }
}
