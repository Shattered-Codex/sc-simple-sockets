import { Constants } from "../../../../Constants.js";
import { AddSocketWorkflow } from "../../../../api/AddSocketWorkflow.js";
import { SocketSlotConfigService } from "../../../../services/SocketSlotConfigService.js";
import { SocketService } from "../../../../services/SocketService.js";
import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { ScMoreActivitiesSlotPickerApp } from "../../ScMoreActivitiesSlotPickerApp.js";

const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

export class ScMoreActivitiesSocketSlotActivityService {
  static async execute(activity, usageContext = {}) {
    const operation = String(activity?.slot?.operation ?? "add").trim();
    if (operation === "remove-empty") {
      return ScMoreActivitiesSocketSlotActivityService.#removeEmptySlot(activity, usageContext);
    }

    return ScMoreActivitiesSocketSlotActivityService.#addSocketToSelectedItem(activity, usageContext);
  }

  static async #addSocketToSelectedItem(activity, usageContext = {}) {
    const validation = SocketSlotConfigService.validateCondition(activity?.slot?.targetCondition ?? "");
    if (!validation.valid) {
      const message = validation.error?.message
        ? `${Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.TargetConditionInvalid",
          "The target item condition has invalid code."
        )} ${validation.error.message}`
        : Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.TargetConditionInvalid",
          "The target item condition has invalid code."
        );
      ui.notifications?.warn?.(message);
      return usageContext.results;
    }

    const workflow = new AddSocketWorkflow({
      ignoreMaxSockets: activity?.slot?.ignoreMaxSockets === true || activity?.slot?.bypassWorldSocketLimit === true,
      notifications: true,
      promptSlotConfig: false,
      cursorUrl: String(activity?.slot?.cursorImage ?? "").trim(),
      slotConfig: activity?.slot ?? {},
      targetValidator: async (item) => ScMoreActivitiesSocketSlotActivityService.#validateTargetItem(item, activity)
    });
    const result = await workflow.run();
    return result ?? usageContext.results;
  }

  static async #removeEmptySlot(activity, usageContext = {}) {
    const slots = await ScMoreActivitiesIntegration.listSlots(activity, { state: "empty" });
    if (!slots.length) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.NoEmptySlots",
          "This item has no empty slots to remove."
        )
      );
      return usageContext.results;
    }

    if (slots.length === 1) {
      const result = await ScMoreActivitiesIntegration.removeEmptySlot(activity, slots[0].slotIndex);
      ScMoreActivitiesSocketSlotActivityService.#notify(result);
      return result;
    }

    const itemName = activity?.item?.name ?? "";
    new ScMoreActivitiesSlotPickerApp({
      confirmLabel: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketSlot.App.Confirm",
        "Remove empty slot"
      ),
      destructive: true,
      emptyMessage: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.NoEmptySlots",
        "This item has no empty slots to remove."
      ),
      onConfirm: async (slotIndex) => {
        const result = await ScMoreActivitiesIntegration.removeEmptySlot(activity, slotIndex);
        ScMoreActivitiesSocketSlotActivityService.#notify(result);
        return result;
      },
      slots,
      subtitle: game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.SocketSlot.App.Subtitle",
        { count: slots.length, item: itemName }
      ) ?? `${itemName} has ${slots.length} empty slots available.`,
      title: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketSlot.App.Title",
        "Choose Empty Slot"
      )
    }).render(true);

    return usageContext.results;
  }

  static #notify(result) {
    if (result?.ok) {
      ui.notifications?.info?.(result.message);
      return;
    }

    if (result?.message) {
      ui.notifications?.warn?.(result.message);
    }
  }

  static async #validateTargetItem(item, activity) {
    const code = String(activity?.slot?.targetCondition ?? "").trim();
    if (!code.length) {
      return { ok: true };
    }

    const socketCount = Array.isArray(SocketService.getSlots(item))
      ? SocketService.getSlots(item).length
      : 0;

    try {
      const runner = new AsyncFunction(
        "context",
        `"use strict";
const {
  actor,
  deepClone,
  game,
  getProperty,
  hasProperty,
  hostItem,
  item,
  moduleId,
  socketCount,
  targetItem,
  user
} = context;
${/\breturn\b/.test(code) ? code : `return (${code});`}`
      );

      const allowed = await runner({
        actor: item?.actor ?? null,
        deepClone: foundry.utils.deepClone.bind(foundry.utils),
        game,
        getProperty: foundry.utils.getProperty.bind(foundry.utils),
        hasProperty: foundry.utils.hasProperty.bind(foundry.utils),
        hostItem: activity?.item ?? null,
        item,
        moduleId: Constants.MODULE_ID,
        socketCount,
        targetItem: item,
        user: game.user ?? null
      });

      if (allowed) {
        return { ok: true };
      }

      return {
        ok: false,
        reason: "target-condition-failed",
        title: Constants.localize(
          "SCSockets.Macro.AddSocket.TargetConditionTitle",
          "Target Condition Failed"
        ),
        message: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.TargetConditionFailed",
          "The clicked item does not match the target condition for this socket activity."
        )
      };
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] target item condition evaluation failed`, error);
      return {
        ok: false,
        reason: "target-condition-error",
        title: Constants.localize(
          "SCSockets.Macro.AddSocket.TargetConditionErrorTitle",
          "Target Condition Error"
        ),
        message: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketSlot.Warnings.TargetConditionError",
          "The target item condition for this socket activity could not be evaluated."
        )
      };
    }
  }
}
