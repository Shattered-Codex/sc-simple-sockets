import { Constants } from "../../../../Constants.js";
import { SelectionController } from "../../../../api/SelectionController.js";
import { SocketAPI } from "../../../../api/SocketAPI.js";
import { ModuleSettings } from "../../../../settings/ModuleSettings.js";
import { GemResourceService } from "../../../../../domain/gems/GemResourceService.js";
import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { ScMoreActivitiesSlotPickerApp } from "../../ScMoreActivitiesSlotPickerApp.js";
import { ScMoreActivitiesRechargeRolls } from "../shared/ScMoreActivitiesRechargeRolls.js";

const escapeHtml = (str) => foundry.utils?.escapeHtml?.(str) ?? String(str ?? "");
const canEditItem = (item) => game.user?.isGM === true || item?.isOwner === true;

export class ScMoreActivitiesSocketRechargeActivityService {
  static async execute(activity, usageContext = {}) {
    if (!ScMoreActivitiesRechargeRolls.ensureActorForCheck(activity)) {
      return usageContext.results;
    }

    const selection = await ScMoreActivitiesSocketRechargeActivityService.#selectTargetItem(activity);
    if (!selection) {
      return usageContext.results;
    }

    const { item, slots } = selection;
    if (slots.length === 1) {
      const result = await ScMoreActivitiesSocketRechargeActivityService.#recharge(activity, item, slots[0].slotIndex);
      ScMoreActivitiesSocketRechargeActivityService.#notify(result);
      return result;
    }

    new ScMoreActivitiesSlotPickerApp({
      confirmLabel: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketRecharge.App.Confirm",
        "Recharge selected gem"
      ),
      emptyMessage: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.NoRechargeableGems",
        "The target item has no socketed gems with missing charges."
      ),
      onConfirm: async (slotIndex) => {
        const result = await ScMoreActivitiesSocketRechargeActivityService.#recharge(activity, item, slotIndex);
        ScMoreActivitiesSocketRechargeActivityService.#notify(result);
        return result;
      },
      slots,
      subtitle: game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.SocketRecharge.App.Subtitle",
        { count: slots.length, item: item?.name ?? "" }
      ) ?? `${item?.name ?? "The item"} has ${slots.length} rechargeable gems. Choose which one to recharge.`,
      title: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketRecharge.App.Title",
        "Choose Gem to Recharge"
      )
    }).render(true);

    return usageContext.results;
  }

  static #getResourceKeyFilter(activity) {
    return String(activity?.recharge?.resourceKey ?? "").trim();
  }

  static async #selectTargetItem(activity) {
    const { DialogV2 } = foundry.applications.api;
    const resourceKey = ScMoreActivitiesSocketRechargeActivityService.#getResourceKeyFilter(activity);

    while (true) {
      const item = await SelectionController.selectItem({
        cursorClass: SelectionController.CURSOR_CLASS,
        cursorUrl: String(activity?.recharge?.cursorImage ?? "").trim(),
        messageKey: "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Selection.Prompt",
        messageFallback: "Click the item whose socketed gem should be recharged. Press Esc to cancel.",
        notifications: true
      });

      if (!item) {
        ui.notifications?.info?.(
          Constants.localize(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Selection.Cancelled",
            "Selection cancelled."
          )
        );
        return null;
      }

      const itemName = escapeHtml(item?.name ?? "");
      if (!canEditItem(item)) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.ItemPermissionTitle",
              "Cannot Edit Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.ItemPermissionBody",
              { name: itemName }
            ) ?? `You do not have permission to edit ${itemName}.`}</p>
            <p>${Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.Common.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return null;
        continue;
      }

      if (!ModuleSettings.isItemSocketableByType(item)) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.InvalidTypeTitle",
              "Unsupported Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.InvalidTypeBody",
              { name: itemName }
            ) ?? `${itemName} cannot use sockets.`}</p>
            <p>${Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.Common.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return null;
        continue;
      }

      const slots = await ScMoreActivitiesSocketRechargeActivityService.#listRechargeableSlots(item, resourceKey);
      if (!slots.length) {
        const body = resourceKey.length
          ? game.i18n?.format?.(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.NoMatchingGemsBody",
            { name: itemName, key: escapeHtml(resourceKey) }
          ) ?? `${itemName} has no socketed gems with missing "${escapeHtml(resourceKey)}" charges.`
          : game.i18n?.format?.(
            "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.NoRechargeableGemsBody",
            { name: itemName }
          ) ?? `${itemName} has no socketed gems with missing charges.`;

        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Dialogs.NoRechargeableGemsTitle",
              "No Rechargeable Gems"
            )
          },
          content: `
            <p>${body}</p>
            <p>${Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.Common.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return null;
        continue;
      }

      return { item, slots };
    }
  }

  static async #listRechargeableSlots(item, resourceKey = "") {
    const wantedKey = String(resourceKey ?? "").trim().toLowerCase();
    const entries = await SocketAPI.getItemSlots(item.uuid, { includeSnapshots: true });
    return (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.hasGem === true)
      .map((entry) => {
        const resource = GemResourceService.getSlotResource(entry.slot);
        if (!resource || resource.max <= 0 || resource.value >= resource.max) {
          return null;
        }
        if (wantedKey.length && resource.key.toLowerCase() !== wantedKey) {
          return null;
        }

        const summary = ScMoreActivitiesIntegration.toSlotSummary(entry);
        const chargesLabel = `${resource.key} ${resource.value}/${resource.max}`;
        return {
          ...summary,
          chargesLabel,
          gemName: summary.gemName ? `${summary.gemName} (${chargesLabel})` : chargesLabel
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.slotIndex - right.slotIndex);
  }

  static async #recharge(activity, item, slotIndex) {
    const check = await ScMoreActivitiesRechargeRolls.performCheck(activity);
    if (!check.ok) {
      return check;
    }

    if (!check.success) {
      return Object.freeze({
        ok: true,
        changed: false,
        reason: "check-failed",
        message: Constants.localize(
          "SCSockets.Integrations.ScMoreActivities.SocketRecharge.Warnings.CheckFailed",
          "The recharge attempt failed. No charges were restored."
        )
      });
    }

    const amount = await ScMoreActivitiesRechargeRolls.rollAmount(activity);
    if (amount === false) {
      return { ok: false, reason: "roll-cancelled" };
    }

    return ScMoreActivitiesIntegration.rechargeGem(activity, slotIndex, { amount, item });
  }

  static #notify(result) {
    if (!result?.message) {
      return;
    }

    if (result.ok === true && result.changed !== false) {
      ui.notifications?.info?.(result.message);
      return;
    }

    ui.notifications?.warn?.(result.message);
  }
}
