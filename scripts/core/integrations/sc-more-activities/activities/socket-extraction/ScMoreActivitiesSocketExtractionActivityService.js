import { Constants } from "../../../../Constants.js";
import { SelectionController } from "../../../../api/SelectionController.js";
import { ModuleSettings } from "../../../../settings/ModuleSettings.js";
import { ScMoreActivitiesIntegration } from "../../ScMoreActivitiesIntegration.js";
import { ScMoreActivitiesSlotPickerApp } from "../../ScMoreActivitiesSlotPickerApp.js";

const escapeHtml = (str) => foundry.utils?.escapeHtml?.(str) ?? String(str ?? "");
const canEditItem = (item) => game.user?.isGM === true || item?.isOwner === true;

export class ScMoreActivitiesSocketExtractionActivityService {
  static async execute(activity, usageContext = {}) {
    const selection = await ScMoreActivitiesSocketExtractionActivityService.#selectTargetItem(activity);
    if (!selection) {
      return usageContext.results;
    }

    const { item, slots } = selection;
    if (slots.length === 1) {
      const result = await ScMoreActivitiesSocketExtractionActivityService.#extract(activity, item, slots[0].slotIndex);
      ScMoreActivitiesSocketExtractionActivityService.#notify(result);
      return result;
    }

    new ScMoreActivitiesSlotPickerApp({
      confirmLabel: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketExtraction.App.Confirm",
        "Remove selected gem"
      ),
      destructive: ScMoreActivitiesSocketExtractionActivityService.#getMode(activity) === "delete",
      emptyMessage: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Warnings.NoSocketedGems",
        "The target item has no socketed gems to remove."
      ),
      onConfirm: async (slotIndex) => {
        const result = await ScMoreActivitiesSocketExtractionActivityService.#extract(activity, item, slotIndex);
        ScMoreActivitiesSocketExtractionActivityService.#notify(result);
        return result;
      },
      slots,
      subtitle: game.i18n?.format?.(
        "SCSockets.Integrations.ScMoreActivities.SocketExtraction.App.Subtitle",
        { count: slots.length, item: item?.name ?? "" }
      ) ?? `${item?.name ?? "The item"} has ${slots.length} socketed gems. Choose which one to remove.`,
      title: Constants.localize(
        "SCSockets.Integrations.ScMoreActivities.SocketExtraction.App.Title",
        "Choose Gem to Remove"
      )
    }).render(true);

    return usageContext.results;
  }

  static async #selectTargetItem(activity) {
    const { DialogV2 } = foundry.applications.api;
    const mode = ScMoreActivitiesSocketExtractionActivityService.#getMode(activity);

    while (true) {
      const item = await SelectionController.selectItem({
        cursorClass: SelectionController.EXTRACT_CURSOR_CLASS,
        cursorUrl: String(activity?.extraction?.cursorImage ?? "").trim(),
        messageKey: "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Selection.Prompt",
        messageFallback: "Click the item whose socketed gem should be removed. Press Esc to cancel.",
        notifications: true
      });

      if (!item) {
        ui.notifications?.info?.(
          Constants.localize(
            "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Selection.Cancelled",
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
              "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.ItemPermissionTitle",
              "Cannot Edit Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.ItemPermissionBody",
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
              "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.InvalidTypeTitle",
              "Unsupported Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.InvalidTypeBody",
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

      const slots = await ScMoreActivitiesSocketExtractionActivityService.#listFilledSlots(item);
      if (!slots.length) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.NoSocketedGemsTitle",
              "No Socketed Gems"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.NoSocketedGemsBody",
              { name: itemName }
            ) ?? `${itemName} has no socketed gems to remove.`}</p>
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

      const confirmed = await DialogV2.confirm({
        window: {
          title: Constants.localize(
            mode === "delete"
              ? "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.ConfirmTitleDelete"
              : "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.ConfirmTitleKeep",
            mode === "delete" ? "Delete Socketed Gem" : "Extract Socketed Gem"
          )
        },
        content: `
          <p>${game.i18n?.format?.(
            mode === "delete"
              ? "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.ConfirmBodyDelete"
              : "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.ConfirmBodyKeep",
            { name: itemName }
          ) ?? (mode === "delete"
            ? `Use ${itemName} as the target and delete the removed gem?`
            : `Use ${itemName} as the target and keep the removed gem?`)}</p>
          <p>${Constants.localize(
            "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Dialogs.OverrideHint",
            "This activity ignores global and slot removal settings."
          )}</p>
        `,
        modal: true
      });

      if (!confirmed) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Integrations.ScMoreActivities.Common.SelectAnotherTitle",
              "Select Another Item"
            )
          },
          content: `
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

  static async #listFilledSlots(item) {
    return ScMoreActivitiesIntegration.listItemSlots(item, { state: "filled" });
  }

  static async #extract(activity, item, slotIndex) {
    return ScMoreActivitiesIntegration.extractGem(activity, slotIndex, {
      item,
      mode: ScMoreActivitiesSocketExtractionActivityService.#getMode(activity)
    });
  }

  static #getMode(activity) {
    return String(activity?.extraction?.mode ?? "keep").trim() === "delete" ? "delete" : "keep";
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
}
