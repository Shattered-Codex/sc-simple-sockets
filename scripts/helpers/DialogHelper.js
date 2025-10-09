import { Constants } from "../core/Constants.js";

export class DialogHelper {
  static async confirmDeleteSocket() {
    const { DialogV2 } = foundry.applications.api;
    const title = Constants.localize("SCSockets.Dialogs.DeleteSocket.Title", "Delete Socket");
    const message = Constants.localize("SCSockets.Dialogs.DeleteSocket.Message", "Are you sure you want to delete this socket?");
    const warning = Constants.localize("SCSockets.Dialogs.DeleteSocket.Warning", "This action cannot be undone.");
    const hint = Constants.localize("SCSockets.Dialogs.DeleteSocket.Hint", "Hold Shift to bypass this prompt.");

    return DialogV2.confirm({
      window: { title },
      content: `
        <p><strong>${message}</strong></p>
        <p>${warning}</p>
        <p class="hint">${hint}</p>
      `,
      modal: true,
      classes: ["dialog"]
    });
  }

  static async confirmGeneric(titleKey, messageKey, { modal = true } = {}) {
    const { DialogV2 } = foundry.applications.api;
    const title = Constants.localize(titleKey, titleKey);
    const body = Constants.localize(messageKey, messageKey);
    return DialogV2.confirm({
      window: { title },
      content: `<p>${body}</p>`,
      modal,
      classes: ["dialog"]
    });
  }

  static async promptInput(title, label) {
    const { DialogV2 } = foundry.applications.api;
    return DialogV2.prompt({
      window: { title },
      content: `
        <label>${label}</label>
        <input type="text" name="value" />
      `,
      modal: true,
      callback: (html) => html.querySelector("input[name='value']").value
    });
  }
}
