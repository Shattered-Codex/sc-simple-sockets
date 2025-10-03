// ui/DialogHelper.js
export class DialogHelper {
  static async confirmDeleteSocket() {
    const { DialogV2 } = foundry.applications.api;
    return DialogV2.confirm({
      window: { title: game.i18n.localize("GBSockets.DeleteSocketTitle") },
      content: `
        <p><strong>${game.i18n.localize("AreYouSure")}</strong>
        ${game.i18n.localize("DND5E.DeleteWarning")}</p>
        <p class="hint">${game.i18n.localize("DND5E.HintShiftClickToBypass")}</p>
      `,
      modal: true,
      classes: ["dialog"]
    });
  }

  static async confirmGeneric(titleKey, message, { modal = true } = {}) {
    const { DialogV2 } = foundry.applications.api;
    return DialogV2.confirm({
      window: { title: game.i18n.localize(titleKey) },
      content: `<p>${message}</p>`,
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
