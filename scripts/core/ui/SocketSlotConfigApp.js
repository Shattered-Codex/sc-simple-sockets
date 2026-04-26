import { Constants } from "../Constants.js";
import { SocketSlotConfigService } from "../services/SocketSlotConfigService.js";
import { SocketGemSheetService } from "../services/SocketGemSheetService.js";
import { normalizeSlotColor } from "../helpers/socketSlotConfig.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render SocketSlotConfigApp.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/socket-slot-config.hbs`;

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, form, formData);
}

export class SocketSlotConfigApp extends BaseApplication {
  #hostItem;
  #slotIndex;
  #parentApp;
  #editable;
  #boundRoot = null;
  #inputListener;
  #clickListener;

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-socket-slot-config`,
      tag: "form",
      classes: ["sc-sockets", "sc-sockets-settings-theme", "socket-slot-config-app"],
      position: { width: 840, height: 780 },
      window: {
        title: Constants.localize(
          "SCSockets.SocketSlotConfig.Title",
          "Socket Slot Settings"
        ),
        icon: "fas fa-pen-to-square",
        contentClasses: ["sc-sockets-settings-theme"],
        resizable: true
      },
      form: {
        handler: handleFormSubmit,
        closeOnSubmit: false,
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

  constructor(hostItem, slotIndex, { parentApp = null, editable = true, ...options } = {}) {
    const safeUuid = String(hostItem?.uuid ?? hostItem?.id ?? "item")
      .replace(/[^a-z0-9_-]/gi, "-")
      .replace(/-+/g, "-");
    super({
      ...options,
      id: `${Constants.MODULE_ID}-socket-slot-config-${safeUuid}-${slotIndex}`
    });
    this.#hostItem = hostItem ?? null;
    this.#slotIndex = Number.isInteger(slotIndex) ? slotIndex : Number(slotIndex ?? -1);
    this.#parentApp = parentApp ?? null;
    this.#editable = Boolean(editable);
    this.#inputListener = (event) => this.#handleInput(event);
    this.#clickListener = (event) => this.#handleClick(event);
  }

  static open(hostItem, slotIndex, options = {}) {
    const app = new SocketSlotConfigApp(hostItem, slotIndex, options);
    app.render(true);
    return app;
  }

  async _preparePartContext(partId, context = {}, renderOptions) {
    const base = await super._preparePartContext?.(partId, context, renderOptions) ?? context;
    if (partId !== "form") {
      return base;
    }

    return foundry.utils.mergeObject(base ?? {}, await this.#buildContext(), { inplace: false });
  }

  async _processSubmitData(_event, form) {
    if (!this.#editable) {
      return {};
    }

    const payload = this.#readForm(form);
    const validation = SocketSlotConfigService.validateCondition(payload.condition);
    if (!validation.valid) {
      const message = validation.error?.message
        ? `${Constants.localize("SCSockets.SocketSlotConfig.Validation.InvalidCondition", "The slot condition has invalid code.")} ${validation.error.message}`
        : Constants.localize("SCSockets.SocketSlotConfig.Validation.InvalidCondition", "The slot condition has invalid code.");
      ui.notifications?.error?.(message);
      return false;
    }

    const updated = await SocketSlotConfigService.updateConfig(this.#hostItem, this.#slotIndex, payload);
    if (!updated) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Notifications.InvalidSocketIndex",
          "Invalid socket index."
        )
      );
      return false;
    }

    this.#parentApp?.render?.(true);
    ui.notifications?.info?.(
      Constants.localize(
        "SCSockets.SocketSlotConfig.Saved",
        "Slot settings saved."
      )
    );
    await this.close();
    return {};
  }

  async _updateObject(event, formData) {
    await this._processSubmitData(event, this.form, formData);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#bindRoot();
    this.#refreshPreview();
    window.requestAnimationFrame(() => this.#applyLayoutBounds());
  }

  activateListeners(html) {
    super.activateListeners(html);
    queueMicrotask(() => this.#bindRoot());
  }

  deactivateListeners(html) {
    this.#unbindRoot();
    super.deactivateListeners?.(html);
  }

  async #buildContext() {
    const slot = SocketSlotConfigService.getSlot(this.#hostItem, this.#slotIndex) ?? {};
    const slotConfig = SocketSlotConfigService.getConfig(slot);
    const slotNumber = Number.isInteger(this.#slotIndex) ? this.#slotIndex + 1 : null;
    const canInspectGem = Boolean(slot?.gem || slot?._gemData);
    const textEditor = Constants.getTextEditor();
    const descriptionEnriched = await textEditor?.enrichHTML?.(slotConfig.description, {
      secrets: this.#hostItem?.isOwner ?? false,
      relativeTo: this.#hostItem,
      rollData: this.#hostItem?.getRollData?.()
    }) ?? "";

    return {
      editable: this.#editable,
      hostItemName: this.#hostItem?.name ?? "",
      hostItemImg: this.#hostItem?.img ?? Constants.SOCKET_SLOT_IMG,
      hostItemUuid: this.#hostItem?.uuid ?? "",
      canInspectHost: typeof this.#hostItem?.sheet?.render === "function",
      slotIndex: this.#slotIndex,
      slotNumber,
      slotName: slot?.name ?? Constants.localize("SCSockets.SocketEmptyName", "Empty"),
      hasGem: Boolean(slot?.gem || slot?._gemData),
      gemName: slot?.gem?.name ?? slot?._gemData?.name ?? "",
      gemImg: slot?.gem?.img ?? slot?._gemData?.img ?? "",
      canInspectGem,
      slotConfigName: slotConfig.name,
      hidden: slotConfig.hidden,
      condition: slotConfig.condition,
      description: slotConfig.description,
      descriptionEnriched,
      color: slotConfig.color,
      colorPickerValue: slotConfig.color || "#FFFFFF",
      previewHasTint: Boolean(slotConfig.color),
      previewStyle: slotConfig.color ? `--sc-sockets-slot-color:${slotConfig.color};` : "",
      slotFrameImg: Constants.SOCKET_SLOT_IMG,
      conditionWikiUrl: `${Constants.MODULE_WIKI_URL}#slot-condition`,
      strings: {
        subtitle: Constants.localize(
          "SCSockets.SocketSlotConfig.Subtitle",
          "Configure rules, description, and tint for this slot."
        ),
        slotLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.SlotLabel",
          "Slot"
        ),
        hostLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.HostLabel",
          "Host item"
        ),
        gemLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.GemLabel",
          "Socketed gem"
        ),
        slotNameLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.SlotNameLabel",
          "Slot name"
        ),
        hiddenLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.Hidden.Label",
          "Hide slot"
        ),
        hiddenHint: Constants.localize(
          "SCSockets.SocketSlotConfig.Hidden.Hint",
          "Only GMs can see this slot and its socket description."
        ),
        conditionLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.Condition.Label",
          "Slot condition"
        ),
        conditionHint: Constants.localize(
          "SCSockets.SocketSlotConfig.Condition.Hint",
          "Use JavaScript. Available variables: gem, gemItem, hostItem, item, actor, user, slot, slotConfig, slotIndex, source, getProperty, hasProperty, deepClone."
        ),
        conditionPlaceholder: Constants.localize(
          "SCSockets.SocketSlotConfig.Condition.Placeholder",
          "Example: return gem.name?.includes('Ruby') && getProperty(gem, 'flags.world.rarity') === 'rare';"
        ),
        conditionWiki: Constants.localize(
          "SCSockets.SocketSlotConfig.Condition.Wiki",
          "Open wiki"
        ),
        descriptionLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.Description.Label",
          "Slot description"
        ),
        descriptionHint: Constants.localize(
          "SCSockets.SocketSlotConfig.Description.Hint",
          "Shown in Socket Descriptions while the slot is empty. When a gem is added, the gem description takes over."
        ),
        colorLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.Color.Label",
          "Slot color"
        ),
        colorHint: Constants.localize(
          "SCSockets.SocketSlotConfig.Color.Hint",
          "Applied only to the empty socket frame."
        ),
        previewLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.Color.Preview",
          "Preview"
        ),
        colorHexLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.Color.HexLabel",
          "Hex"
        ),
        colorPickerLabel: Constants.localize(
          "SCSockets.SocketSlotConfig.Color.PickerLabel",
          "Color picker"
        ),
        clearColor: Constants.localize(
          "SCSockets.SocketSlotConfig.Color.Clear",
          "Clear"
        ),
        inspectHost: Constants.localize(
          "SCSockets.SocketSlotConfig.InspectHost",
          "Open Host Item"
        ),
        inspectHostHint: Constants.localize(
          "SCSockets.SocketSlotConfig.InspectHostHint",
          "Opens the host item sheet."
        ),
        inspectGem: Constants.localize(
          "SCSockets.SocketSlotConfig.InspectGem",
          "Inspect Gem"
        ),
        emptySlot: Constants.localize(
          "SCSockets.SocketSlotConfig.EmptySlot",
          "Empty slot"
        ),
        noGem: Constants.localize(
          "SCSockets.SocketSlotConfig.NoGem",
          "No gem is currently socketed in this slot."
        ),
        save: Constants.localize("SCSockets.SocketSlotConfig.Save", "Save and Close"),
        cancel: Constants.localize("SCSockets.SocketSlotConfig.Cancel", "Cancel")
      }
    };
  }

  #bindRoot() {
    const root = this.form ?? this.element;
    if (!root || this.#boundRoot === root) {
      return;
    }

    this.#unbindRoot();
    root.addEventListener("input", this.#inputListener);
    root.addEventListener("change", this.#inputListener);
    root.addEventListener("click", this.#clickListener);
    this.#boundRoot = root;
  }

  #unbindRoot() {
    if (!this.#boundRoot) {
      return;
    }

    this.#boundRoot.removeEventListener("input", this.#inputListener);
    this.#boundRoot.removeEventListener("change", this.#inputListener);
    this.#boundRoot.removeEventListener("click", this.#clickListener);
    this.#boundRoot = null;
  }

  #handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const hexInput = this.#queryNamedInput("slotConfig.colorHex");
    const pickerInput = this.#queryNamedInput("slotConfig.colorPicker");
    if (!(hexInput instanceof HTMLInputElement) || !(pickerInput instanceof HTMLInputElement)) {
      return;
    }

    if (target === pickerInput) {
      hexInput.value = pickerInput.value;
      this.#refreshPreview();
      return;
    }

    if (target !== hexInput) {
      return;
    }

    const normalized = normalizeSlotColor(hexInput.value);
    if (normalized) {
      pickerInput.value = normalized;
    }

    this.#refreshPreview();
  }

  #handleClick(event) {
    const actionTarget = event.target instanceof HTMLElement
      ? event.target.closest("[data-action]")
      : null;
    if (!(actionTarget instanceof HTMLElement)) {
      return;
    }

    switch (actionTarget.dataset.action) {
      case "close":
        event.preventDefault();
        void this.close();
        break;
      case "clearColor":
        event.preventDefault();
        this.#clearColorInputs();
        this.#refreshPreview();
        break;
      case "inspectGem":
        event.preventDefault();
        void SocketGemSheetService.inspectFromHost(this.#hostItem, this.#slotIndex);
        break;
      case "inspectHost":
        event.preventDefault();
        this.#hostItem?.sheet?.render?.(true);
        break;
      default:
        break;
    }
  }

  #readForm(form) {
    if (!(form instanceof HTMLFormElement)) {
      return {
        name: "",
        hidden: false,
        condition: "",
        description: "",
        color: ""
      };
    }

    return {
      name: this.#readFieldValue("slotConfig.name"),
      hidden: this.#readCheckboxValue("slotConfig.hidden"),
      condition: this.#readFieldValue("slotConfig.condition"),
      description: this.#readFieldValue("slotConfig.description"),
      color: normalizeSlotColor(this.#readFieldValue("slotConfig.colorHex"))
    };
  }

  #clearColorInputs() {
    const hexInput = this.#queryNamedInput("slotConfig.colorHex");
    const pickerInput = this.#queryNamedInput("slotConfig.colorPicker");
    if (hexInput instanceof HTMLInputElement) {
      hexInput.value = "";
    }
    if (pickerInput instanceof HTMLInputElement) {
      pickerInput.value = "#FFFFFF";
    }
  }

  #queryNamedInput(name) {
    return this.form?.elements?.namedItem?.(name) ?? null;
  }

  #readFieldValue(name) {
    const field = this.form?.elements?.namedItem?.(name) ?? this.form?.querySelector?.(`[name="${name}"]`) ?? null;
    if (!field) {
      return "";
    }

    if (typeof field.value === "string") {
      return field.value;
    }

    const attributeValue = field.getAttribute?.("value");
    return typeof attributeValue === "string" ? attributeValue : "";
  }

  #readCheckboxValue(name) {
    const field = this.form?.elements?.namedItem?.(name) ?? this.form?.querySelector?.(`[name="${name}"]`) ?? null;
    if (field instanceof HTMLInputElement) {
      return field.checked;
    }
    return false;
  }

  #refreshPreview() {
    const preview = this.element?.querySelector?.("[data-slot-color-preview]");
    if (!(preview instanceof HTMLElement)) {
      return;
    }

    const hexInput = this.#queryNamedInput("slotConfig.colorHex");
    const color = normalizeSlotColor(hexInput?.value ?? "");
    const frame = preview.querySelector(".sc-sockets-slot-frame");
    preview.classList.toggle("has-slot-tint", Boolean(color));
    frame?.classList?.toggle?.("is-tinted", Boolean(color));
    if (color) {
      preview.style.setProperty("--sc-sockets-slot-color", color);
    } else {
      preview.style.removeProperty("--sc-sockets-slot-color");
    }
  }

  #applyLayoutBounds() {
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
    const maxWidth = Math.max(760, viewportWidth - 48);
    const targetWidth = Math.max(760, Math.min(920, maxWidth));
    const maxHeight = Math.max(620, viewportHeight - 48);
    const app = this.element?.querySelector?.(".socket-slot-config-layout");
    const naturalHeight = (app?.scrollHeight ?? 700) + 72;
    const targetHeight = Math.max(680, Math.min(860, maxHeight, naturalHeight));
    this.setPosition?.({ width: targetWidth, height: targetHeight });
  }
}
