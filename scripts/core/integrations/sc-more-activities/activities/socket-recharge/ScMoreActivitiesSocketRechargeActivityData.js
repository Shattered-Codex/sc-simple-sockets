import { buildRechargeSchema } from "../shared/ScMoreActivitiesRechargeFields.js";

export class ScMoreActivitiesSocketRechargeActivityData extends dnd5e.dataModels.activity.BaseActivityData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      recharge: buildRechargeSchema()
    };
  }
}
