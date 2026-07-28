import { Constants } from "../Constants.js";
import { SocketStore } from "../SocketStore.js";
import { SocketSlotConfigService } from "../services/SocketSlotConfigService.js";
import { SocketService } from "../services/SocketService.js";
import { SocketGemSheetService } from "../services/SocketGemSheetService.js";
import { normalizeSlotColor } from "../helpers/socketSlotConfig.js";
import { GemResourceService } from "../../domain/gems/GemResourceService.js";
import { GemDetailsBuilder } from "../../domain/gems/GemDetailsBuilder.js";
import { DialogHelper } from "../../helpers/DialogHelper.js";
import { DebugTrace } from "../support/DebugTrace.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.FormApplicationV2 ?? api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;
if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required to render SocketSlotConfigApp.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/socket-slot-config.hbs`;
const TINT_SWATCHES = [
  "#D4AF37", "#C89853", "#E0683A", "#C94F4F", "#9C6CD8",
  "#4A8CD1", "#33937F", "#8AA64A", "#8A949E", "#CCCCCC"
];

function handleFormSubmit(event, form, formData) {
  return this._processSubmitData(event, form, formData);
}

export class SocketSlotConfigApp extends BaseApplication {
  #hostItem;
  #slotIndex;
  #parentApp;
  #editable;
  #activeTab = "desc";
  #drafts = new Map();
  #boundRoot = null;
  #inputListener;
  #clickListener;

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      id: `${Constants.MODULE_ID}-socket-slot-config`,
      tag: "form",
      classes: ["sc-sockets", "socket-slot-config-app"],
      position: { width: 1140, height: 680 },
      window: {
        title: Constants.localize(
          "SCSockets.SocketSlotConfig.Title",
          "Socket Slot Settings"
        ),
        icon: "fas fa-pen-to-square",
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
    super({
      ...options,
      id: SocketSlotConfigApp.#buildId(hostItem)
    });
    this.#hostItem = hostItem ?? null;
    this.#slotIndex = Number.isInteger(slotIndex) ? slotIndex : Number(slotIndex ?? -1);
    this.#parentApp = parentApp ?? null;
    this.#editable = Boolean(editable);
    this.#inputListener = (event) => this.#handleInput(event);
    this.#clickListener = (event) => this.#handleClick(event);
  }

  static #buildId(hostItem) {
    const safeUuid = String(hostItem?.uuid ?? hostItem?.id ?? "item")
      .replace(/[^a-z0-9_-]/gi, "-")
      .replace(/-+/g, "-");
    return `${Constants.MODULE_ID}-socket-slot-config-${safeUuid}`;
  }

  static open(hostItem, slotIndex, options = {}) {
    const existing = foundry.applications?.instances?.get?.(SocketSlotConfigApp.#buildId(hostItem));
    if (existing instanceof SocketSlotConfigApp) {
      existing.selectSlot(slotIndex);
      existing.bringToFront?.();
      return existing;
    }

    const app = new SocketSlotConfigApp(hostItem, slotIndex, options);
    app.render(true);
    return app;
  }

  get title() {
    const base = Constants.localize("SCSockets.SocketSlotConfig.Title", "Socket Slot Settings");
    const hostName = this.#hostItem?.name;
    return hostName ? `${base} · ${hostName}` : base;
  }

  /** Switches the detail view to another slot, keeping unsaved edits as drafts. */
  selectSlot(slotIndex) {
    const index = Number.isInteger(slotIndex) ? slotIndex : Number(slotIndex ?? -1);
    if (index === this.#slotIndex) {
      return;
    }
    this.#captureDraft();
    this.#slotIndex = index;
    this.render();
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

    this.#captureDraft(form);

    for (const [index, payload] of this.#drafts) {
      const validation = SocketSlotConfigService.validateCondition(payload.condition);
      if (!validation.valid) {
        const base = Constants.localize("SCSockets.SocketSlotConfig.Validation.InvalidCondition", "The slot condition has invalid code.");
        const slotRef = `${Constants.localize("SCSockets.SocketSlotConfig.SlotLabel", "Slot")} ${index + 1}`;
        const message = validation.error?.message
          ? `${slotRef}: ${base} ${validation.error.message}`
          : `${slotRef}: ${base}`;
        ui.notifications?.error?.(message);
        if (index !== this.#slotIndex) {
          this.#slotIndex = index;
          this.#activeTab = "cond";
          this.render();
        }
        return false;
      }
    }

    let failed = false;
    for (const [index, payload] of this.#drafts) {
      const updated = await SocketSlotConfigService.updateConfigAndResource(
        this.#hostItem,
        index,
        payload,
        { value: payload.gemResourceValue, recovery: payload.gemResourceRecovery },
        {
          [Constants.MODULE_ID]: {
            [Constants.UPDATE_OPTION_SKIP_ITEM_SHEET_SYNC]: true
          }
        }
      );
      if (!updated) {
        failed = true;
      }
    }
    if (failed) {
      ui.notifications?.warn?.(
        Constants.localize(
          "SCSockets.Notifications.InvalidSocketIndex",
          "Invalid socket index."
        )
      );
      return false;
    }

    DebugTrace.log("socket-slot-config.save", {
      hostItem: DebugTrace.describeItem(this.#hostItem),
      slotIndexes: Array.from(this.#drafts.keys()),
      parentApp: DebugTrace.describeApp(this.#parentApp)
    });
    ui.notifications?.info?.(
      Constants.localize(
        "SCSockets.SocketSlotConfig.Saved",
        "Slot settings saved."
      )
    );
    this.#drafts.clear();
    await this.close();
    return {};
  }

  async _updateObject(event, formData) {
    await this._processSubmitData(event, this.form, formData);
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    window.requestAnimationFrame(() => this.#applyLayoutBounds());
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#bindRoot();
    this.#bindDropZone();
    this.#refreshPreview();
    this.#refreshRecoveryControls();
    this.#refreshChargesBar();
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
    const slots = SocketStore.peekSlots(this.#hostItem);
    if (slots.length && (!Number.isInteger(this.#slotIndex) || this.#slotIndex < 0 || this.#slotIndex >= slots.length)) {
      this.#slotIndex = 0;
    }

    const slot = SocketSlotConfigService.getSlot(this.#hostItem, this.#slotIndex) ?? {};
    const slotConfig = SocketSlotConfigService.getConfig(slot);
    const draft = this.#drafts.get(this.#slotIndex) ?? null;
    const gemResource = GemResourceService.getSlotResource(slot);
    const slotNumber = Number.isInteger(this.#slotIndex) ? this.#slotIndex + 1 : null;
    const canInspectGem = Boolean(slot?.gem || slot?._gemData);

    const name = draft?.name ?? slotConfig.name;
    const color = normalizeSlotColor(draft?.color ?? slotConfig.color);
    const hidden = draft ? draft.hidden : slotConfig.hidden;
    const deleteGemOnRemoval = draft ? draft.deleteGemOnRemoval : slotConfig.deleteGemOnRemoval;
    const condition = draft?.condition ?? slotConfig.condition;
    const description = draft?.description ?? slotConfig.description;

    const resourceValue = draft?.gemResourceValue !== undefined && draft?.gemResourceValue !== ""
      ? Number(draft.gemResourceValue)
      : gemResource?.value;
    const resourceRecovery = draft?.gemResourceRecovery ?? gemResource?.recovery ?? null;
    const resourceContext = gemResource
      ? {
        ...gemResource,
        value: resourceValue,
        recovery: {
          ...gemResource.recovery,
          ...(resourceRecovery ?? {})
        }
      }
      : null;
    const gemChargesPct = resourceContext?.max > 0
      ? Math.max(0, Math.min(100, Math.round((Number(resourceContext.value) / Number(resourceContext.max)) * 100)))
      : 0;

    const textEditor = Constants.getTextEditor();
    const descriptionEnriched = await textEditor?.enrichHTML?.(description, {
      secrets: this.#hostItem?.isOwner ?? false,
      relativeTo: this.#hostItem,
      rollData: this.#hostItem?.getRollData?.()
    }) ?? "";

    const strings = this.#buildStrings();
    const railSlots = slots.map((railSlot, index) => {
      const railConfig = SocketSlotConfigService.getConfig(railSlot);
      const railDraft = this.#drafts.get(index);
      const railName = (index === this.#slotIndex ? name : railDraft?.name ?? railConfig.name)
        || `${strings.slotLabel} ${index + 1}`;
      const railGemName = railSlot?.gem?.name ?? railSlot?._gemData?.name ?? "";
      return {
        index,
        active: index === this.#slotIndex,
        name: railName,
        gemLabel: railGemName || strings.emptySlot,
        color: normalizeSlotColor(index === this.#slotIndex ? color : railDraft?.color ?? railConfig.color),
        hidden: index === this.#slotIndex ? hidden : railDraft ? railDraft.hidden : railConfig.hidden
      };
    });

    return {
      appId: this.id,
      editable: this.#editable,
      hostItemName: this.#hostItem?.name ?? "",
      hostItemImg: this.#hostItem?.img ?? Constants.SOCKET_SLOT_IMG,
      hostItemUuid: this.#hostItem?.uuid ?? "",
      canInspectHost: typeof this.#hostItem?.sheet?.render === "function",
      slotIndex: this.#slotIndex,
      slotNumber,
      railSlots,
      canAddSocket: this.#editable,
      tabDescActive: this.#activeTab !== "cond",
      tabCondActive: this.#activeTab === "cond",
      hasGem: Boolean(slot?.gem || slot?._gemData),
      gemName: slot?.gem?.name ?? slot?._gemData?.name ?? "",
      gemImg: slot?.gem?.img ?? slot?._gemData?.img ?? "",
      canInspectGem,
      canUnsocketGem: this.#editable && canInspectGem,
      hasGemResource: Boolean(gemResource),
      gemResource: resourceContext,
      gemChargesPct,
      gemRecoveryPeriodGroups: GemDetailsBuilder.buildRecoveryPeriodGroups(
        resourceContext?.recovery?.period ?? ""
      ),
      gemRecoveryTypeOptions: GemDetailsBuilder.buildRecoveryTypeOptions(
        resourceContext?.recovery?.type ?? "recoverAll"
      ),
      gemRecoveryIsRecharge: resourceContext?.recovery?.period === "recharge",
      gemRecoveryShowFormula: resourceContext?.recovery?.type === "formula",
      slotConfigName: name,
      hidden,
      deleteGemOnRemoval,
      canEditVisibility: this.#canEditVisibility(),
      condition,
      conditionVars: this.#buildConditionVars(),
      description,
      descriptionEnriched,
      color,
      colorPickerValue: color || "#FFFFFF",
      tintSwatches: TINT_SWATCHES.map((value) => ({
        value,
        active: color.toUpperCase() === value
      })),
      previewHasTint: Boolean(color),
      previewStyle: color ? `--sc-sockets-slot-color:${color};` : "",
      slotFrameImg: Constants.SOCKET_SLOT_IMG,
      conditionWikiUrl: `${Constants.MODULE_WIKI_URL}#slot-condition`,
      strings
    };
  }

  #buildConditionVars() {
    const defs = [
      ["gem", "gem", "Gem", "The gem item document being socketed (alias of gemItem)."],
      ["gemTags", "gemTags", "GemTags", "Array with the gem's tags."],
      ["hasGemTag('')", "hasGemTag('')", "HasGemTag", "Returns true when the gem has the given tag."],
      ["hostItem", "hostItem", "HostItem", "The item that owns this socket (alias: item)."],
      ["actor", "actor", "Actor", "The actor holding the host item, or null."],
      ["user", "user", "User", "The user socketing the gem."],
      ["slot", "slot", "Slot", "Raw data of this slot."],
      ["slotConfig", "slotConfig", "SlotConfig", "This slot's configuration (name, color, hidden…)."],
      ["slotIndex", "slotIndex", "SlotIndex", "Zero-based index of this slot."],
      ["source", "source", "Source", "Source data of the gem before it is socketed."],
      ["getProperty()", "getProperty()", "GetProperty", "Reads a property by path, e.g. getProperty(gem, 'system.rarity')."],
      ["hasProperty()", "hasProperty()", "HasProperty", "Checks whether a property exists at the given path."]
    ];
    return defs.map(([label, snippet, key, fallback]) => ({
      label,
      snippet,
      tooltip: Constants.localize(`SCSockets.SocketSlotConfig.Condition.Insert.Vars.${key}`, fallback)
    }));
  }

  #buildStrings() {
    return {
      subtitle: Constants.localize(
        "SCSockets.SocketSlotConfig.Subtitle",
        "Configure rules, description, and tint for this slot."
      ),
      railTitle: Constants.localize(
        "SCSockets.SocketSlotConfig.Sockets",
        "Sockets"
      ),
      addSocket: Constants.localize(
        "SCSockets.SocketSlotConfig.AddSocket",
        "Add socket"
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
        "Gem in slot"
      ),
      slotNameLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.SlotNameLabel",
        "Slot name"
      ),
      slotNameHint: Constants.localize(
        "SCSockets.SocketSlotConfig.SlotNameHint",
        "Leave blank to number it automatically."
      ),
      contentsLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.Contents",
        "Contents"
      ),
      rulesLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.Rules",
        "Rules"
      ),
      socketedBadge: Constants.localize(
        "SCSockets.SocketSlotConfig.SocketedBadge",
        "Socketed"
      ),
      emptyBadge: Constants.localize(
        "SCSockets.SocketSlotConfig.EmptyBadge",
        "Empty"
      ),
      tabDescription: Constants.localize(
        "SCSockets.SocketSlotConfig.Tabs.Description",
        "Description"
      ),
      tabCondition: Constants.localize(
        "SCSockets.SocketSlotConfig.Tabs.Condition",
        "Condition"
      ),
      hiddenLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.Hidden.Label",
        "Hide slot"
      ),
      hiddenHint: Constants.localize(
        "SCSockets.SocketSlotConfig.Hidden.Hint",
        "Only GMs can see this slot and its socket description."
      ),
      hiddenBadge: Constants.localize(
        "SCSockets.SocketSlotConfig.Hidden.Badge",
        "GM only"
      ),
      deleteGemOnRemovalLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.DeleteGemOnRemoval.Label",
        "Delete gem on removal"
      ),
      deleteGemOnRemovalHint: Constants.localize(
        "SCSockets.SocketSlotConfig.DeleteGemOnRemoval.Hint",
        "When enabled, this slot deletes its gem when unsocketed even if the global setting is disabled."
      ),
      destructiveBadge: Constants.localize(
        "SCSockets.SocketSlotConfig.DeleteGemOnRemoval.Badge",
        "Destructive"
      ),
      unsocketGem: Constants.localize(
        "SCSockets.SocketSlotConfig.UnsocketGem",
        "Unsocket gem"
      ),
      conditionLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.Condition.Label",
        "Slot condition"
      ),
      conditionHint: Constants.localize(
        "SCSockets.SocketSlotConfig.Condition.Hint",
        "Use JavaScript. Gem tags are available through gemTags and hasGemTag(tag). Other variables: gem, gemItem, hostItem, item, actor, user, slot, slotConfig, slotIndex, source, getProperty, hasProperty, deepClone."
      ),
      conditionPlaceholder: Constants.localize(
        "SCSockets.SocketSlotConfig.Condition.Placeholder",
        "Example: return hasGemTag('poison');"
      ),
      conditionWiki: Constants.localize(
        "SCSockets.SocketSlotConfig.Condition.Wiki",
        "Open wiki"
      ),
      insertLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.Condition.Insert.Label",
        "Click to insert"
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
      gemChargesLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.GemCharges.Label",
        "Gem charges"
      ),
      gemChargesHint: Constants.localize(
        "SCSockets.SocketSlotConfig.GemCharges.Hint",
        "Current charges of the socketed gem. The maximum is configured on the gem itself."
      ),
      copyKeyHint: Constants.localize(
        "SCSockets.SocketSlotConfig.GemCharges.CopyKeyHint",
        "Click to copy the charge identifier."
      ),
      gemRecoveryLabel: Constants.localize(
        "SCSockets.SocketSlotConfig.GemRecovery.Label",
        "Recharge"
      ),
      gemRecoveryHint: Constants.localize(
        "SCSockets.SocketSlotConfig.GemRecovery.Hint",
        "When and how this gem's charges change automatically during rests: recover all charges, lose all charges, or roll a custom formula."
      ),
      gemRecoveryFormulaPlaceholder: Constants.localize(
        "SCSockets.SocketSlotConfig.GemRecovery.FormulaPlaceholder",
        "e.g. 1d4"
      ),
      emptySlot: Constants.localize(
        "SCSockets.SocketSlotConfig.EmptySlot",
        "Empty slot"
      ),
      noGem: Constants.localize(
        "SCSockets.SocketSlotConfig.NoGem",
        "No gem is currently socketed in this slot."
      ),
      dropGemHint: Constants.localize(
        "SCSockets.SocketSlotConfig.DropGemHint",
        "Drag a gem here to socket it."
      ),
      save: Constants.localize("SCSockets.SocketSlotConfig.Save", "Save and Close"),
      cancel: Constants.localize("SCSockets.SocketSlotConfig.Cancel", "Cancel")
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

    const targetName = target.getAttribute?.("name");
    if (targetName === "gemResource.recovery.type" || targetName === "gemResource.recovery.period") {
      this.#refreshRecoveryControls();
      return;
    }

    if (targetName === "gemResource.value") {
      this.#refreshChargesBar();
      return;
    }

    if (targetName === "slotConfig.name") {
      this.#refreshRailName(target.value);
      return;
    }

    if (targetName === "slotConfig.hidden" || targetName === "slotConfig.deleteGemOnRemoval") {
      this.#refreshRuleBadges();
      return;
    }

    const hexInput = this.#queryNamedInput("slotConfig.colorHex");
    const pickerInput = this.#queryNamedInput("slotConfig.colorPicker");
    if (!(hexInput instanceof HTMLInputElement) || !(pickerInput instanceof HTMLInputElement)) {
      return;
    }

    if (target === pickerInput) {
      hexInput.value = pickerInput.value.toUpperCase();
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
      case "selectSlot":
        event.preventDefault();
        this.selectSlot(Number(actionTarget.dataset.index));
        break;
      case "switchTab":
        event.preventDefault();
        this.#switchTab(actionTarget.dataset.tab);
        break;
      case "pickTint":
        event.preventDefault();
        this.#applyTint(actionTarget.dataset.color ?? "");
        break;
      case "insertConditionVar":
        event.preventDefault();
        this.#insertConditionVar(actionTarget.dataset.insert ?? "");
        break;
      case "copyResourceKey":
        event.preventDefault();
        void this.#copyResourceKey(actionTarget.dataset.key ?? "");
        break;
      case "gemChargeDelta":
        event.preventDefault();
        this.#applyChargeDelta(Number(actionTarget.dataset.delta ?? 0));
        break;
      case "addSocket":
        event.preventDefault();
        void this.#addSocket();
        break;
      case "unsocketGem":
        event.preventDefault();
        void this.#unsocketGem(event);
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

  #switchTab(tab) {
    const nextTab = tab === "cond" ? "cond" : "desc";
    if (nextTab === this.#activeTab) {
      return;
    }
    this.#activeTab = nextTab;

    const root = this.element;
    root?.querySelectorAll?.("[data-tab-pane]")?.forEach((pane) => {
      pane.hidden = pane.dataset.tabPane !== nextTab;
    });
    root?.querySelectorAll?.(".slotcfg-tab")?.forEach((button) => {
      const active = button.dataset.tab === nextTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  #applyTint(color) {
    if (!this.#editable) {
      return;
    }
    const normalized = normalizeSlotColor(color);
    const hexInput = this.#queryNamedInput("slotConfig.colorHex");
    const pickerInput = this.#queryNamedInput("slotConfig.colorPicker");
    if (hexInput instanceof HTMLInputElement) {
      hexInput.value = normalized;
    }
    if (pickerInput instanceof HTMLInputElement && normalized) {
      pickerInput.value = normalized;
    }
    this.#refreshPreview();
  }

  async #copyResourceKey(key) {
    const value = String(key ?? "").trim();
    if (!value) {
      return;
    }

    try {
      if (typeof game.clipboard?.copyPlainText === "function") {
        await game.clipboard.copyPlainText(value);
      } else {
        await navigator.clipboard?.writeText?.(value);
      }
      const template = Constants.localize(
        "SCSockets.SocketSlotConfig.GemCharges.KeyCopied",
        "\"{key}\" copied to clipboard."
      );
      ui.notifications?.info?.(template.replace("{key}", value));
    } catch (error) {
      console.warn(`[${Constants.MODULE_ID}] failed to copy resource key`, error);
    }
  }

  #insertConditionVar(snippet) {
    if (!this.#editable || !snippet) {
      return;
    }
    const field = this.form?.querySelector?.('[name="slotConfig.condition"]');
    if (!field) {
      return;
    }
    const current = String(field.value ?? "");
    const needsSpace = current.length > 0 && !/\s$/.test(current);
    field.value = `${current}${needsSpace ? " " : ""}${snippet}`;
    field.focus?.();
  }

  #applyChargeDelta(delta) {
    if (!this.#editable || !Number.isFinite(delta)) {
      return;
    }
    const input = this.#queryNamedInput("gemResource.value");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const max = Number(input.max);
    const current = Number(input.value) || 0;
    const upper = Number.isFinite(max) && max > 0 ? max : Number.POSITIVE_INFINITY;
    input.value = String(Math.max(0, Math.min(upper, current + delta)));
    this.#refreshChargesBar();
  }

  #bindDropZone() {
    if (!this.#editable) {
      return;
    }
    const zone = this.element?.querySelector?.('[data-dropzone="slotcfg-gem"]');
    if (!(zone instanceof HTMLElement) || zone.dataset.scSocketsDropBound === "true") {
      return;
    }

    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("is-dragover");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("is-dragover");
    });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-dragover");

      let data = null;
      try {
        const text = event.dataTransfer?.getData("text/plain");
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      void this.#dropGem(data);
    });
    zone.dataset.scSocketsDropBound = "true";
  }

  async #dropGem(data) {
    if (!this.#editable || !data) {
      return;
    }

    DebugTrace.log("socket-slot-config.dropGem", {
      hostItem: DebugTrace.describeItem(this.#hostItem),
      slotIndex: this.#slotIndex
    });
    this.#captureDraft();
    await SocketService.addGem(this.#hostItem, this.#slotIndex, data);
    this.#parentApp?.render?.();
    this.render();
  }

  async #addSocket() {
    if (!this.#editable) {
      return;
    }
    this.#captureDraft();
    const before = SocketStore.peekSlots(this.#hostItem).length;
    await SocketService.addSlot(this.#hostItem);
    const after = SocketStore.peekSlots(this.#hostItem).length;
    if (after > before) {
      this.#slotIndex = after - 1;
      this.#parentApp?.render?.();
    }
    this.render();
  }

  async #unsocketGem(event) {
    if (!this.#editable) {
      return;
    }

    if (!event?.shiftKey) {
      const ok = await DialogHelper.confirmGeneric(
        "SCSockets.Dialogs.RemoveGem.Title",
        "SCSockets.Dialogs.RemoveGem.Message"
      );
      if (!ok) {
        return;
      }
    }

    this.#captureDraft();
    await SocketService.removeGem(this.#hostItem, this.#slotIndex);
    this.#parentApp?.render?.();
    this.render();
  }

  /** Snapshots the current form values so slot switches keep unsaved edits. */
  #captureDraft(form = this.form) {
    if (!this.#editable || !(form instanceof HTMLFormElement)) {
      return;
    }
    if (!SocketSlotConfigService.getSlot(this.#hostItem, this.#slotIndex)) {
      return;
    }
    this.#drafts.set(this.#slotIndex, this.#readForm(form));
  }

  #readForm(form) {
    if (!(form instanceof HTMLFormElement)) {
      return {
        name: "",
        hidden: this.#currentHiddenValue(),
        deleteGemOnRemoval: this.#currentDeleteGemOnRemovalValue(),
        condition: "",
        description: "",
        color: ""
      };
    }

    return {
      name: this.#readFieldValue("slotConfig.name"),
      hidden: this.#canEditVisibility() ? this.#readCheckboxValue("slotConfig.hidden") : this.#currentHiddenValue(),
      deleteGemOnRemoval: this.#readCheckboxValue("slotConfig.deleteGemOnRemoval"),
      condition: this.#readFieldValue("slotConfig.condition"),
      description: this.#readFieldValue("slotConfig.description"),
      color: normalizeSlotColor(this.#readFieldValue("slotConfig.colorHex")),
      gemResourceValue: this.#readFieldValue("gemResource.value"),
      gemResourceRecovery: this.#readGemRecovery()
    };
  }

  #readGemRecovery() {
    const periodField = this.form?.elements?.namedItem?.("gemResource.recovery.period")
      ?? this.form?.querySelector?.('[name="gemResource.recovery.period"]');
    if (!periodField) {
      return null;
    }
    return {
      period: this.#readFieldValue("gemResource.recovery.period"),
      type: this.#readFieldValue("gemResource.recovery.type"),
      formula: this.#readFieldValue("gemResource.recovery.formula"),
      threshold: this.#readFieldValue("gemResource.recovery.threshold")
    };
  }

  #canEditVisibility() {
    return Boolean(this.#editable && game.user?.isGM);
  }

  #currentHiddenValue() {
    const slot = SocketSlotConfigService.getSlot(this.#hostItem, this.#slotIndex) ?? {};
    return SocketSlotConfigService.getConfig(slot).hidden;
  }

  #currentDeleteGemOnRemovalValue() {
    const slot = SocketSlotConfigService.getSlot(this.#hostItem, this.#slotIndex) ?? {};
    return SocketSlotConfigService.getConfig(slot).deleteGemOnRemoval;
  }

  /**
   * The d6 threshold input only applies to the recharge period, the formula
   * input only to the formula recovery type, and recharge cannot lose charges.
   */
  #refreshRecoveryControls() {
    const periodField = this.form?.querySelector?.('[name="gemResource.recovery.period"]');
    const typeField = this.form?.querySelector?.('[name="gemResource.recovery.type"]');
    const thresholdInput = this.form?.querySelector?.('[name="gemResource.recovery.threshold"]');
    const formulaInput = this.form?.querySelector?.('[name="gemResource.recovery.formula"]');
    const controls = this.form?.querySelector?.(".slotcfg-recovery-controls");
    const isRecharge = periodField?.value === "recharge";
    const hasFormula = typeField?.value === "formula";

    if (thresholdInput instanceof HTMLInputElement) {
      thresholdInput.hidden = !isRecharge;
    }
    if (typeField instanceof HTMLSelectElement) {
      const loseAllOption = typeField.querySelector('option[value="loseAll"]');
      if (loseAllOption) {
        loseAllOption.hidden = isRecharge;
        loseAllOption.disabled = isRecharge;
      }
      if (isRecharge && typeField.value === "loseAll") {
        typeField.value = "recoverAll";
      }
    }
    if (formulaInput instanceof HTMLInputElement) {
      formulaInput.hidden = !hasFormula;
    }
    if (controls instanceof HTMLElement) {
      controls.classList.toggle("is-recharge", isRecharge);
      controls.classList.toggle("is-periodic", !isRecharge);
      controls.classList.toggle("has-formula", hasFormula);
    }
  }

  #refreshChargesBar() {
    const bar = this.element?.querySelector?.("[data-gem-charges-bar]");
    const input = this.#queryNamedInput("gemResource.value");
    if (!(bar instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
      return;
    }
    const max = Number(input.max);
    const value = Number(input.value) || 0;
    const pct = Number.isFinite(max) && max > 0
      ? Math.max(0, Math.min(100, Math.round((value / max) * 100)))
      : 0;
    bar.style.width = `${pct}%`;
  }

  #refreshRailName(rawName) {
    const nameNode = this.element?.querySelector?.(".slotcfg-rail-item.is-active .slotcfg-rail-name");
    if (!(nameNode instanceof HTMLElement)) {
      return;
    }
    const fallback = `${Constants.localize("SCSockets.SocketSlotConfig.SlotLabel", "Slot")} ${this.#slotIndex + 1}`;
    nameNode.textContent = String(rawName ?? "").trim() || fallback;
  }

  #refreshRuleBadges() {
    const hiddenBadge = this.element?.querySelector?.("[data-hidden-badge]");
    if (hiddenBadge instanceof HTMLElement) {
      hiddenBadge.hidden = !this.#readCheckboxValue("slotConfig.hidden");
    }
    const deleteBadge = this.element?.querySelector?.("[data-delete-gem-badge]");
    if (deleteBadge instanceof HTMLElement) {
      deleteBadge.hidden = !this.#readCheckboxValue("slotConfig.deleteGemOnRemoval");
    }
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
    const root = this.element;
    const hexInput = this.#queryNamedInput("slotConfig.colorHex");
    const color = normalizeSlotColor(hexInput?.value ?? "");

    const preview = root?.querySelector?.("[data-slot-color-preview]");
    if (preview instanceof HTMLElement) {
      const frame = preview.querySelector(".sc-sockets-slot-frame");
      preview.classList.toggle("has-slot-tint", Boolean(color));
      frame?.classList?.toggle?.("is-tinted", Boolean(color));
      if (color) {
        preview.style.setProperty("--sc-sockets-slot-color", color);
      } else {
        preview.style.removeProperty("--sc-sockets-slot-color");
      }
    }

    root?.querySelectorAll?.(".slotcfg-swatch")?.forEach((swatch) => {
      swatch.classList.toggle(
        "is-active",
        Boolean(color) && swatch.dataset.color?.toUpperCase() === color
      );
    });

    const diamond = root?.querySelector?.(".slotcfg-rail-item.is-active .slotcfg-rail-diamond");
    if (diamond instanceof HTMLElement) {
      if (color) {
        diamond.style.setProperty("--slotcfg-tint", color);
      } else {
        diamond.style.removeProperty("--slotcfg-tint");
      }
    }
  }

  #applyLayoutBounds() {
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
    const targetWidth = Math.max(880, Math.min(1140, viewportWidth - 48));
    const targetHeight = Math.max(600, Math.min(700, viewportHeight - 48));
    this.setPosition?.({ width: targetWidth, height: targetHeight });
  }
}
