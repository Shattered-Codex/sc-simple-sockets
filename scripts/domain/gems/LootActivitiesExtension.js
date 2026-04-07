import { Constants } from "../../core/Constants.js";

export class LootActivitiesExtension {
  static #extended = false;
  static #setupHooked = false;

  static ensure() {
    if (LootActivitiesExtension.#extended) {
      return;
    }

    const itemModels = dnd5e?.dataModels?.item;
    const lootModel = CONFIG?.Item?.dataModels?.[Constants.ITEM_TYPE_LOOT];
    const activitiesTemplate = itemModels?.ActivitiesTemplate;
    if (!itemModels || !lootModel || !activitiesTemplate) {
      LootActivitiesExtension.#scheduleRetry();
      return;
    }

    const templates = lootModel?._schemaTemplates;
    const alreadyExtended = Array.isArray(templates) && templates.includes(activitiesTemplate);
    if (alreadyExtended) {
      LootActivitiesExtension.#extended = true;
      return;
    }

    try {
      const MixedLootModel = lootModel.mixin(activitiesTemplate);
      class LootWithActivities extends MixedLootModel {
        constructor(data, options) {
          // ActivitiesTemplate marks `activities` and `uses` as required (non-nullable).
          // Existing loot items saved before this extension was applied will lack these
          // fields in their raw source, causing a DataModelValidationError during any
          // actor reset (e.g. when effects are deleted). Providing empty-object defaults
          // lets the schema initialise with its own field defaults instead of throwing.
          const normalized = data ? { ...data } : {};
          if (normalized.activities === undefined) normalized.activities = {};
          if (normalized.uses === undefined) normalized.uses = { spent: 0, max: "", recovery: [] };
          super(normalized, options);
        }

        prepareFinalData(...args) {
          if (typeof super.prepareFinalData === "function") {
            super.prepareFinalData(...args);
          }
          const rollData = this.parent?.getRollData?.({ deterministic: true }) ?? {};
          if (typeof this.prepareFinalActivityData === "function") {
            this.prepareFinalActivityData(rollData);
          }
        }
      }

      CONFIG.Item.dataModels[Constants.ITEM_TYPE_LOOT] = LootWithActivities;
      if (itemModels.config) {
        try {
          itemModels.config[Constants.ITEM_TYPE_LOOT] = LootWithActivities;
        } catch (error) {
          console.warn(`[${Constants.MODULE_ID}] Unable to update itemModels.config loot entry:`, error);
        }
      }
      try {
        itemModels.LootData = LootWithActivities;
      } catch (error) {
        if (error instanceof TypeError) {
          if (Constants.isDebugEnabled()) {
            console.debug(`[${Constants.MODULE_ID}] itemModels.LootData is read-only, skipping direct assignment.`);
          }
        } else {
          throw error;
        }
      }

      LootActivitiesExtension.#extended = true;
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] Failed to extend loot data model:`, error);
    }
  }

  static #scheduleRetry() {
    if (LootActivitiesExtension.#setupHooked) {
      return;
    }
    LootActivitiesExtension.#setupHooked = true;
    Hooks.once("setup", () => {
      LootActivitiesExtension.#setupHooked = false;
      LootActivitiesExtension.ensure();
    });
  }
}
