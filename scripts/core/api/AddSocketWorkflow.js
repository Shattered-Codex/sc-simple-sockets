import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { SocketService } from "../services/SocketService.js";
import { SelectionController } from "./SelectionController.js";
import { ItemSocketExtension } from "../ItemSocketExtension.js";

export const DEFAULT_OPTIONS = {
  renderSheet: true,
  notifications: true
};

const escapeHtml = (str) => foundry.utils?.escapeHtml?.(str) ?? TextEditor?.escapeHTML?.(str) ?? str;

const isSocketable = (item) => {
  const type = item?.type ?? item?.system?.type?.value;
  return ["weapon", "equipment"].includes(type);
};

const canEditItem = (item) => game.user.isGM || item?.isOwner;

const getSocketCount = (item) => {
  const slots = SocketService.getSlots(item);
  return Array.isArray(slots) ? slots.length : 0;
};

export class AddSocketWorkflow {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  #notify(level, key, fallback, data) {
    if (!this.options.notifications) return;
    const message = data ? (game.i18n?.format?.(key, data) ?? fallback) : Constants.localize(key, fallback);
    ui.notifications?.[level]?.(message);
  }

  async run() {
    const hasModulePermission = ModuleSettings.canAddOrRemoveSocket(game.user);

    const { DialogV2 } = foundry.applications.api;

    while (true) {
      const item = await SelectionController.selectItem(this.options);

      if (!item) {
        this.#notify(
          "info",
          "SCSockets.Macro.AddSocket.Cancelled",
          "Selection cancelled."
        );
        return { success: false, reason: "cancelled" };
      }

      const name = escapeHtml(item.name ?? "");

      if (!canEditItem(item)) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Macro.AddSocket.ItemPermissionTitle",
              "Cannot Edit Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Macro.AddSocket.ItemPermissionBody",
              { name }
            ) ?? `You do not have permission to edit ${name}.`}</p>
            <p>${Constants.localize(
              "SCSockets.Macro.AddSocket.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return { success: false, reason: "item-permission" };
        continue;
      }

      if (!isSocketable(item)) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Macro.AddSocket.InvalidTypeTitle",
              "Unsupported Item"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Macro.AddSocket.InvalidTypeBody",
              { name }
            ) ?? `${name} cannot receive sockets.`}</p>
            <p>${Constants.localize(
              "SCSockets.Macro.AddSocket.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return { success: false, reason: "invalid-type" };
        continue;
      }

      const max = ModuleSettings.getMaxSockets();
      const count = getSocketCount(item);
      if (Number.isFinite(max) && count >= max) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Macro.AddSocket.MaxReachedTitle",
              "Maximum Reached"
            )
          },
          content: `
            <p>${game.i18n?.format?.(
              "SCSockets.Macro.AddSocket.MaxReachedBody",
              { name, count, max }
            ) ?? `${name} already has ${count} sockets (limit ${max}).`}</p>
            <p>${Constants.localize(
              "SCSockets.Macro.AddSocket.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return { success: false, reason: "max-reached" };
        continue;
      }

      const confirmed = await DialogV2.confirm({
        window: {
          title: Constants.localize(
            "SCSockets.Macro.AddSocket.ConfirmTitle",
            "Add Socket"
          )
        },
        content: `
          <p>${game.i18n?.format?.(
            "SCSockets.Macro.AddSocket.ConfirmBody",
            { name }
          ) ?? `Add a new socket to ${name}?`}</p>
        `,
        modal: true
      });

      if (!confirmed) {
        const retry = await DialogV2.confirm({
          window: {
            title: Constants.localize(
              "SCSockets.Macro.AddSocket.SelectAnotherTitle",
              "Select Another Item"
            )
          },
          content: `
            <p>${Constants.localize(
              "SCSockets.Macro.AddSocket.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return { success: false, reason: "cancelled" };
        continue;
      }

      try {
        await SocketService.addSlot(item, { bypassPermission: !hasModulePermission });
        this.#notify(
          "info",
          "SCSockets.Macro.AddSocket.Success",
          "A socket was added.",
          { name: item.name }
        );
        return { success: true, reason: "added", item };
      } catch (error) {
        console.error(`[${Constants.MODULE_ID}] Failed to add socket via macro workflow`, error);
        this.#notify(
          "error",
          "SCSockets.Macro.AddSocket.Error",
          "Failed to add socket. See console for details."
        );
        return { success: false, reason: "error", error };
      }
    }
  }
}
