import { Constants } from "../Constants.js";
import { ModuleSettings } from "../settings/ModuleSettings.js";
import { SocketService } from "../services/SocketService.js";
import { SocketSlotConfigService } from "../services/SocketSlotConfigService.js";
import { SelectionController } from "./SelectionController.js";
import { normalizeSlotConfig, normalizeSlotColor } from "../helpers/socketSlotConfig.js";

export const DEFAULT_OPTIONS = {
  bypassWorldSocketLimit: false,
  ignoreMaxSockets: false,
  renderSheet: true,
  notifications: true,
  promptSlotConfig: false,
  slotConfig: {},
  targetValidator: null
};

const escapeHtml = (str) => {
  const textEditor = Constants.getTextEditor();
  return foundry.utils?.escapeHtml?.(str) ?? textEditor?.escapeHTML?.(str) ?? str;
};

const isSocketable = (item) => {
  return ModuleSettings.isItemSocketableByType(item);
};

const canEditItem = (item) => game.user.isGM || item?.isOwner;

const getSocketCount = (item) => {
  const slots = SocketService.getSlots(item);
  return Array.isArray(slots) ? slots.length : 0;
};

const resolveDialogForm = (button, dialog) => {
  if (button?.form instanceof HTMLFormElement) return button.form;
  if (dialog?.form instanceof HTMLFormElement) return dialog.form;
  if (typeof dialog?.element?.querySelector === "function") {
    const form = dialog.element.querySelector("form");
    if (form instanceof HTMLFormElement) return form;
  }
  return null;
};

const readFieldValue = (form, name) => {
  if (!(form instanceof HTMLElement)) return "";
  const field = form.querySelector(`[name="${name}"]`);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return String(field.value ?? "");
  }
  return "";
};

const valueOrDefault = (value, fallback) => (
  String(value ?? "").trim().length ? value : fallback
);

const colorOrDefault = (value, fallback) => {
  const raw = String(value ?? "").trim();
  if (!raw.length) {
    return fallback;
  }

  const normalized = normalizeSlotColor(raw);
  return normalized || fallback;
};

export class AddSocketWorkflow {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      slotConfig: normalizeSlotConfig(options.slotConfig ?? DEFAULT_OPTIONS.slotConfig)
    };
  }

  #notify(level, key, fallback, data) {
    if (!this.options.notifications) return;
    const message = data ? (game.i18n?.format?.(key, data) ?? fallback) : Constants.localize(key, fallback);
    ui.notifications?.[level]?.(message);
  }

  #validateSlotConfig(slotConfig) {
    const validation = SocketSlotConfigService.validateCondition(slotConfig?.condition);
    if (validation.valid) {
      return true;
    }

    const invalidConditionLabel = Constants.localize(
      "SCSockets.SocketSlotConfig.Validation.InvalidCondition",
      "The slot condition has invalid code."
    );
    const errorMessage = validation.error?.message
      ? `${invalidConditionLabel} ${validation.error.message}`
      : invalidConditionLabel;
    ui.notifications?.warn?.(errorMessage);
    return false;
  }

  async #validateTargetItem(item) {
    if (typeof this.options.targetValidator !== "function") {
      return { ok: true };
    }

    try {
      const result = await this.options.targetValidator(item);
      if (result === false) {
        return {
          ok: false,
          reason: "target-validator-rejected",
          title: Constants.localize(
            "SCSockets.Macro.AddSocket.TargetConditionTitle",
            "Target Condition Failed"
          ),
          message: Constants.localize(
            "SCSockets.Macro.AddSocket.TargetConditionBody",
            "This item does not meet the socket activity target condition."
          )
        };
      }

      if (result && typeof result === "object") {
        return {
          ok: result.ok !== false,
          reason: result.reason ?? "target-validator-rejected",
          title: result.title ?? Constants.localize(
            "SCSockets.Macro.AddSocket.TargetConditionTitle",
            "Target Condition Failed"
          ),
          message: result.message ?? Constants.localize(
            "SCSockets.Macro.AddSocket.TargetConditionBody",
            "This item does not meet the socket activity target condition."
          )
        };
      }

      return { ok: true };
    } catch (error) {
      console.error(`[${Constants.MODULE_ID}] targetValidator failed`, error);
      return {
        ok: false,
        reason: "target-validator-error",
        title: Constants.localize(
          "SCSockets.Macro.AddSocket.TargetConditionErrorTitle",
          "Target Condition Error"
        ),
        message: `${Constants.localize(
          "SCSockets.Macro.AddSocket.TargetConditionErrorBody",
          "The target condition for this socket activity could not be evaluated."
        )} ${error?.message ?? ""}`.trim()
      };
    }
  }

  async #resolveSlotConfig() {
    if (!this.options.promptSlotConfig) {
      return this.#validateSlotConfig(this.options.slotConfig)
        ? this.options.slotConfig
        : null;
    }

    const { DialogV2 } = foundry.applications.api;
    if (!DialogV2?.wait) {
      return this.#validateSlotConfig(this.options.slotConfig)
        ? this.options.slotConfig
        : null;
    }

    const defaults = this.options.slotConfig;
    const title = Constants.localize(
      "SCSockets.SocketSlotConfig.Title",
      "Socket Slot Settings"
    );
    const submitLabel = Constants.localize(
      "SCSockets.SocketSlotConfig.Save",
      "Save and Close"
    );
    const cancelLabel = Constants.localize(
      "SCSockets.SocketSlotConfig.Cancel",
      "Cancel"
    );
    const helpText = Constants.localize(
      "SCSockets.SocketSlotConfig.Subtitle",
      "Configure rules, description, and tint for this slot."
    );
    while (true) {
      const result = await DialogV2.wait({
        window: { title },
        content: `
          <form class="standard-form">
            <p>${escapeHtml(helpText)}</p>
            <div class="form-group">
              <label>${escapeHtml(Constants.localize("SCSockets.SocketSlotConfig.SlotNameLabel", "Slot name"))}</label>
              <div class="form-fields">
                <input type="text" name="slotName" value="${escapeHtml(defaults.name)}" />
              </div>
            </div>
            <div class="form-group">
              <label>${escapeHtml(Constants.localize("SCSockets.SocketSlotConfig.Description.Label", "Slot description"))}</label>
              <div class="form-fields">
                <textarea name="slotDescription" rows="4">${escapeHtml(defaults.description)}</textarea>
              </div>
            </div>
            <div class="form-group">
              <label>${escapeHtml(Constants.localize("SCSockets.SocketSlotConfig.Condition.Label", "Slot condition"))}</label>
              <div class="form-fields">
                <textarea name="slotCondition" rows="6" placeholder="${escapeHtml(Constants.localize("SCSockets.SocketSlotConfig.Condition.Placeholder", "Example: return hasGemTag('poison');"))}">${escapeHtml(defaults.condition)}</textarea>
              </div>
            </div>
            <div class="form-group">
              <label>${escapeHtml(Constants.localize("SCSockets.SocketSlotConfig.Color.Label", "Slot color"))}</label>
              <div class="form-fields">
                <input
                  type="text"
                  name="slotColor"
                  value="${escapeHtml(defaults.color)}"
                  placeholder="${escapeHtml(Constants.localize("SCSockets.SocketSlotConfig.Color.HexLabel", "Hex"))}"
                />
              </div>
            </div>
            <div class="form-group">
              <label>${escapeHtml(Constants.localize("SCSockets.SocketSlotConfig.DeleteGemOnRemoval.Label", "Delete gem on removal"))}</label>
              <div class="form-fields">
                <label class="checkbox">
                  <input
                    type="checkbox"
                    name="slotDeleteGemOnRemoval"
                    ${defaults.deleteGemOnRemoval ? "checked" : ""}
                  />
                  ${escapeHtml(Constants.localize(
                    "SCSockets.SocketSlotConfig.DeleteGemOnRemoval.Hint",
                    "When enabled, this slot deletes its gem when unsocketed even if the global setting is disabled."
                  ))}
                </label>
              </div>
            </div>
          </form>
        `,
        buttons: [
          {
            action: "save",
            label: submitLabel,
            icon: "fas fa-floppy-disk",
            default: true,
            callback: (_event, button, dialog) => {
              const form = resolveDialogForm(button, dialog);
              return {
                name: readFieldValue(form, "slotName"),
                description: readFieldValue(form, "slotDescription"),
                condition: readFieldValue(form, "slotCondition"),
                color: readFieldValue(form, "slotColor"),
                deleteGemOnRemoval: form?.querySelector?.('[name="slotDeleteGemOnRemoval"]')?.checked === true
              };
            }
          },
          {
            action: "cancel",
            label: cancelLabel,
            icon: "fas fa-xmark",
            callback: () => null
          }
        ]
      }, { rejectClose: false });

      if (!result) {
        return null;
      }

      const slotConfig = normalizeSlotConfig({
        ...defaults,
        name: valueOrDefault(result.name, defaults.name),
        description: valueOrDefault(result.description, defaults.description),
        condition: valueOrDefault(result.condition, defaults.condition),
        color: colorOrDefault(result.color, defaults.color),
        deleteGemOnRemoval: result.deleteGemOnRemoval === true
      });

      if (!this.#validateSlotConfig(slotConfig)) {
        continue;
      }

      return slotConfig;
    }
  }

  async run() {
    const hasModulePermission = ModuleSettings.canAddOrRemoveSocket(game.user);
    const bypassWorldSocketLimit = this.options.bypassWorldSocketLimit === true || this.options.ignoreMaxSockets === true;

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
      if (!bypassWorldSocketLimit && Number.isFinite(max) && count >= max) {
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

      const targetValidation = await this.#validateTargetItem(item);
      if (targetValidation.ok === false) {
        const retry = await DialogV2.confirm({
          window: {
            title: targetValidation.title
          },
          content: `
            <p>${escapeHtml(targetValidation.message ?? Constants.localize(
              "SCSockets.Macro.AddSocket.TargetConditionBody",
              "This item does not meet the socket activity target condition."
            ))}</p>
            <p>${Constants.localize(
              "SCSockets.Macro.AddSocket.SelectAnother",
              "Do you want to select another item?"
            )}</p>
          `,
          modal: true
        });

        if (!retry) return { success: false, reason: targetValidation.reason ?? "target-condition" };
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
        const slotConfig = await this.#resolveSlotConfig();
        if (slotConfig === null) {
          return { success: false, reason: "cancelled" };
        }

        await SocketService.addSlot(item, {
          ignoreMaxSockets: bypassWorldSocketLimit,
          bypassWorldSocketLimit,
          bypassPermission: !hasModulePermission,
          slotConfig
        });
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
