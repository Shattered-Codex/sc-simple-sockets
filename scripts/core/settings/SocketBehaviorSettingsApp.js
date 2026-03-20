import { Constants } from "../Constants.js";
import { ModuleSettings } from "./ModuleSettings.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render SocketBehaviorSettingsApp.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/settings/socket-behavior.hbs`;

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, form, formData);
}

export class SocketBehaviorSettingsApp extends BaseApplication {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-socket-behavior-settings`,
      tag: "form",
      classes: ["sc-sockets", "sc-sockets-settings-theme", "socket-behavior-settings"],
      position: { width: 760, height: 640 },
      window: {
        title: Constants.localize(
          "SCSockets.Settings.SocketBehaviorMenu.Name",
          "Socket settings"
        ),
        icon: "fas fa-gears",
        contentClasses: ["sc-sockets-settings-theme"]
      },
      form: {
        handler: handleFormSubmit,
        closeOnSubmit: true,
        submitOnChange: false
      }
    },
    { inplace: false }
  );

  static PARTS = {
    form: {
      template: TEMPLATE_PATH
    }
  };

  async _preparePartContext(partId, context = {}, options) {
    const base = await super._preparePartContext?.(partId, context, options) ?? context;
    if (partId !== "form") {
      return base;
    }

    return foundry.utils.mergeObject(base ?? {}, this.#buildContext(), { inplace: false });
  }

  async _processSubmitData(_event, form, _formData) {
    await this.#saveForm(form);
    ui.notifications.info(
      Constants.localize(
        "SCSockets.Settings.SocketBehaviorMenu.Saved",
        "Socket settings saved."
      )
    );
    return {};
  }

  async _updateObject(event, formData) {
    await this._processSubmitData(event, this.form, formData);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const root = this.form ?? this.element;
    if (!root) return;
    if (root.dataset.scSocketsBehaviorBound === "true") return;
    root.dataset.scSocketsBehaviorBound = "true";

    root.addEventListener("click", (event) => {
      const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
      if (!(actionTarget instanceof HTMLElement)) return;
      if (actionTarget.dataset.action !== "close") return;

      event.preventDefault();
      void this.close();
    });
  }

  #buildContext() {
    const editPermissionChoices = Object.entries(ModuleSettings.getEditSocketPermissionChoices()).map(([value, label]) => ({
      value,
      label,
      selected: Number(value) === Number(game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_EDIT_SOCKET))
    }));

    const layoutChoices = [
      {
        value: ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
        label: Constants.localize("SCSockets.Settings.SocketTabLayout.Options.List", "Default list"),
        selected: ModuleSettings.getSocketTabLayout() === ModuleSettings.SOCKET_TAB_LAYOUT_LIST
      },
      {
        value: ModuleSettings.SOCKET_TAB_LAYOUT_GRID,
        label: Constants.localize("SCSockets.Settings.SocketTabLayout.Options.Grid", "Grid"),
        selected: ModuleSettings.getSocketTabLayout() === ModuleSettings.SOCKET_TAB_LAYOUT_GRID
      }
    ];

    return {
      description: Constants.localize(
        "SCSockets.Settings.SocketBehaviorMenu.Description",
        "Manage socket permissions, limits, and display behavior in one place."
      ),
      sections: [
        {
          title: Constants.localize(
            "SCSockets.Settings.SocketBehaviorMenu.Sections.Rules",
            "Socket rules"
          ),
          hint: Constants.localize(
            "SCSockets.Settings.SocketBehaviorMenu.Sections.RulesHint",
            "Control who can edit sockets and how gems behave when attached or removed."
          ),
          fields: [
            {
              key: ModuleSettings.SETTING_EDIT_SOCKET,
              name: Constants.localize("SCSockets.Settings.EditPermission.Name", "Edit Socket Permission"),
              hint: Constants.localize(
                "SCSockets.Settings.EditPermission.Hint",
                "The minimum role required to add or remove sockets from items."
              ),
              isSelect: true,
              choices: editPermissionChoices
            },
            {
              key: ModuleSettings.SETTING_MAX_SOCKETS,
              name: Constants.localize(
                "SCSockets.Settings.MaxSockets.Name",
                "Maximum Number of Sockets per Item"
              ),
              hint: Constants.localize(
                "SCSockets.Settings.MaxSockets.Hint",
                "Maximum number of sockets an item can have. Use -1 for unlimited."
              ),
              isNumber: true,
              value: Number(game.settings.get(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS) ?? 6)
            },
            {
              key: ModuleSettings.SETTING_DELETE_ON_REMOVE,
              name: Constants.localize(
                "SCSockets.Settings.DeleteOnRemoval.Name",
                "Delete Gem on Removal"
              ),
              hint: Constants.localize(
                "SCSockets.Settings.DeleteOnRemoval.Hint",
                "If enabled, a gem is destroyed when removed from a socket; otherwise it's returned to the player's inventory."
              ),
              isCheckbox: true,
              checked: ModuleSettings.shouldDeleteGemOnRemoval()
            }
          ]
        },
        {
          title: Constants.localize(
            "SCSockets.Settings.SocketBehaviorMenu.Sections.Display",
            "Display"
          ),
          hint: Constants.localize(
            "SCSockets.Settings.SocketBehaviorMenu.Sections.DisplayHint",
            "Adjust how gem damage and the socket tab are presented in the UI."
          ),
          fields: [
            {
              key: ModuleSettings.SETTING_GEM_ROLL_LAYOUT,
              name: Constants.localize(
                "SCSockets.Settings.GemRollLayout.Name",
                "Gem damage layout in roll dialog"
              ),
              hint: Constants.localize(
                "SCSockets.Settings.GemRollLayout.Hint",
                "Enable the grouped-by-gem layout in the damage roll configuration dialog."
              ),
              isCheckbox: true,
              checked: ModuleSettings.shouldUseGemRollLayout()
            },
            {
              key: ModuleSettings.SETTING_SOCKET_TAB_LAYOUT,
              name: Constants.localize("SCSockets.Settings.SocketTabLayout.Name", "Socket tab layout"),
              hint: Constants.localize(
                "SCSockets.Settings.SocketTabLayout.Hint",
                "Choose how the sockets tab is displayed."
              ),
              isSelect: true,
              choices: layoutChoices
            }
          ]
        }
      ],
      strings: {
        submit: Constants.localize("SCSockets.Settings.SocketBehaviorMenu.Save", "Save and Close"),
        cancel: Constants.localize("SCSockets.Settings.SocketBehaviorMenu.Cancel", "Cancel")
      }
    };
  }

  async #saveForm(form) {
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const editPermissionField = form.elements.namedItem(ModuleSettings.SETTING_EDIT_SOCKET);
    const maxSocketsField = form.elements.namedItem(ModuleSettings.SETTING_MAX_SOCKETS);
    const deleteOnRemovalField = form.elements.namedItem(ModuleSettings.SETTING_DELETE_ON_REMOVE);
    const gemRollLayoutField = form.elements.namedItem(ModuleSettings.SETTING_GEM_ROLL_LAYOUT);
    const socketTabLayoutField = form.elements.namedItem(ModuleSettings.SETTING_SOCKET_TAB_LAYOUT);

    const roleChoices = ModuleSettings.getEditSocketPermissionChoices();
    const editPermissionValue = String(editPermissionField?.value ?? "");
    const normalizedPermission = Object.hasOwn(roleChoices, editPermissionValue)
      ? Number(editPermissionValue)
      : 4;

    const parsedMaxSockets = Number.parseInt(String(maxSocketsField?.value ?? ""), 10);
    const normalizedMaxSockets = Number.isInteger(parsedMaxSockets) ? parsedMaxSockets : 6;

    const deleteOnRemoval = deleteOnRemovalField instanceof HTMLInputElement
      ? deleteOnRemovalField.checked
      : false;
    const gemRollLayout = gemRollLayoutField instanceof HTMLInputElement
      ? gemRollLayoutField.checked
      : true;

    const socketTabLayoutValue = String(socketTabLayoutField?.value ?? "").trim().toLowerCase();
    const normalizedSocketTabLayout = [
      ModuleSettings.SOCKET_TAB_LAYOUT_LIST,
      ModuleSettings.SOCKET_TAB_LAYOUT_GRID
    ].includes(socketTabLayoutValue)
      ? socketTabLayoutValue
      : ModuleSettings.SOCKET_TAB_LAYOUT_LIST;

    await game.settings.set(
      Constants.MODULE_ID,
      ModuleSettings.SETTING_EDIT_SOCKET,
      Number.isFinite(normalizedPermission) ? normalizedPermission : 4
    );
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_MAX_SOCKETS, normalizedMaxSockets);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_DELETE_ON_REMOVE, deleteOnRemoval);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_GEM_ROLL_LAYOUT, gemRollLayout);
    await game.settings.set(Constants.MODULE_ID, ModuleSettings.SETTING_SOCKET_TAB_LAYOUT, normalizedSocketTabLayout);
  }
}
