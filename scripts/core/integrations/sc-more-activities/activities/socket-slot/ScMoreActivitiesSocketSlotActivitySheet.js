import { Constants } from "../../../../Constants.js";
import { normalizeSlotColor } from "../../../../helpers/socketSlotConfig.js";

const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-slot-effect.hbs`;

export class ScMoreActivitiesSocketSlotActivitySheet extends dnd5e.applications.activity.ActivitySheet {
  static DEFAULT_OPTIONS = {
    classes: [
      "dnd5e2",
      "sheet",
      "activity-sheet",
      "sc-sockets",
      "sc-sockets-scma-activity--slot"
    ]
  };

  static PARTS = {
    ...super.PARTS,
    effect: {
      template: TEMPLATE_PATH,
      templates: [...super.PARTS.effect.templates]
    }
  };

  async _prepareEffectContext(context, options) {
    context = await super._prepareEffectContext(context, options);

    const slot = this.activity?.slot ?? {};
    const operation = slot.operation ?? "add";
    const textEditor = Constants.getTextEditor();
    const hostItem = this.activity?.item ?? null;
    const descriptionEnriched = await textEditor?.enrichHTML?.(slot.description ?? "", {
      secrets: hostItem?.isOwner ?? false,
      relativeTo: hostItem,
      rollData: hostItem?.getRollData?.()
    }) ?? "";

    context.slot = {
      color: slot.color ?? "",
      cursorImage: slot.cursorImage ?? "",
      condition: slot.condition ?? "",
      deleteGemOnRemoval: slot.deleteGemOnRemoval === true,
      description: slot.description ?? "",
      hidden: slot.hidden === true,
      ignoreMaxSockets: slot.ignoreMaxSockets === true,
      name: slot.name ?? "",
      targetCondition: slot.targetCondition ?? "",
      operation
    };
    context.conditionLabel = game.i18n.localize("SCSockets.SocketSlotConfig.Condition.Label");
    context.conditionHint = game.i18n.localize("SCSockets.SocketSlotConfig.Condition.Hint");
    context.conditionPlaceholder = game.i18n.localize("SCSockets.SocketSlotConfig.Condition.Placeholder");
    context.conditionWiki = game.i18n.localize("SCSockets.SocketSlotConfig.Condition.Wiki");
    context.conditionWikiUrl = `${Constants.MODULE_WIKI_URL}#slot-condition`;
    context.colorHint = game.i18n.localize("SCSockets.SocketSlotConfig.Color.Hint");
    context.colorPickerLabel = game.i18n.localize("SCSockets.SocketSlotConfig.Color.PickerLabel");
    context.colorPickerValue = normalizeSlotColor(slot.color) || "#C44D24";
    context.targetConditionLabel = game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketSlot.Fields.TargetCondition.Label");
    context.targetConditionHint = game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketSlot.Fields.TargetCondition.Hint");
    context.targetConditionPlaceholder = game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketSlot.Fields.TargetCondition.Placeholder");
    context.descriptionEnriched = descriptionEnriched;
    context.hasCodeMirrorEditor = Boolean(globalThis.customElements?.get?.("code-mirror"));
    context.hasProseMirrorEditor = Boolean(globalThis.customElements?.get?.("prose-mirror"));
    context.hostItemUuid = hostItem?.uuid ?? "";
    context.ignoreMaxSocketsLabel = Constants.localize(
      "SCSockets.Integrations.ScMoreActivities.SocketSlot.Fields.IgnoreMaxSockets.Label",
      "Ignore socket limit"
    );
    context.ignoreMaxSocketsHint = Constants.localize(
      "SCSockets.Integrations.ScMoreActivities.SocketSlot.Fields.IgnoreMaxSockets.Hint",
      "When enabled, this activity can add a socket even if the item is already at the world socket limit."
    );
    context.isAddOperation = operation === "add";
    context.isRemoveOperation = operation === "remove-empty";
    context.operationOptions = [
      {
        value: "add",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketSlot.Fields.Operation.Choices.Add")
      },
      {
        value: "remove-empty",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketSlot.Fields.Operation.Choices.RemoveEmpty")
      }
    ];

    return context;
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    this.#bindColorInputs();
    this.#resetDescriptionEditorScroll();
  }

  _prepareSubmitData(event, formData) {
    const submitData = super._prepareSubmitData(event, formData);

    const descriptionEditor = this.#getDescriptionEditor();
    const descriptionValue = this.#getDescriptionEditorValue(descriptionEditor);
    if (typeof descriptionValue === "string") {
      foundry.utils.setProperty(submitData, "slot.description", descriptionValue);
    }

    const conditionEditor = this.#getConditionEditor();
    const conditionValue = this.#getConditionEditorValue(conditionEditor);
    if (typeof conditionValue === "string") {
      foundry.utils.setProperty(submitData, "slot.condition", conditionValue);
    }

    const targetConditionEditor = this.#getTargetConditionEditor();
    const targetConditionValue = this.#getConditionEditorValue(targetConditionEditor);
    if (typeof targetConditionValue === "string") {
      foundry.utils.setProperty(submitData, "slot.targetCondition", targetConditionValue);
    }

    return submitData;
  }

  #getConditionEditor() {
    return this.element?.querySelector?.('[name="slot.condition"]') ?? null;
  }

  #getConditionEditorValue(editor) {
    if (!editor) {
      return undefined;
    }
    return editor.value ?? editor.textContent ?? undefined;
  }

  #getDescriptionEditor() {
    return this.element?.querySelector?.('[name="slot.description"]') ?? null;
  }

  #getDescriptionEditorValue(editor) {
    if (!editor) {
      return undefined;
    }
    return editor.value ?? undefined;
  }

  #getTargetConditionEditor() {
    return this.element?.querySelector?.('[name="slot.targetCondition"]') ?? null;
  }

  #bindColorInputs() {
    const textInput = this.element?.querySelector?.('[data-slot-color-text]') ?? null;
    const pickerInput = this.element?.querySelector?.('[data-slot-color-picker]') ?? null;
    if (!(textInput instanceof HTMLInputElement) || !(pickerInput instanceof HTMLInputElement)) {
      return;
    }

    const syncPickerFromText = () => {
      const normalized = normalizeSlotColor(textInput.value);
      if (normalized) {
        pickerInput.value = normalized;
      }
    };

    textInput.addEventListener("input", syncPickerFromText);
    textInput.addEventListener("change", syncPickerFromText);
    pickerInput.addEventListener("input", () => {
      textInput.value = pickerInput.value;
    });
    pickerInput.addEventListener("change", () => {
      textInput.value = pickerInput.value;
    });
  }

  #resetDescriptionEditorScroll() {
    const editorHost = this.#getDescriptionEditor();
    if (!editorHost) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;
    const reset = () => {
      if (!editorHost.isConnected) {
        return;
      }

      const scrollTargets = this.#getDescriptionEditorScrollTargets(editorHost);
      for (const element of scrollTargets) {
        element.scrollTop = 0;
      }

      const hasNestedEditorSurface = scrollTargets.length > 1;
      const isTextareaFallback = editorHost instanceof HTMLTextAreaElement;
      if (!hasNestedEditorSurface && !isTextareaFallback && attempts < maxAttempts) {
        attempts += 1;
        requestAnimationFrame(reset);
      }
    };

    queueMicrotask(reset);
    requestAnimationFrame(reset);
  }

  #getDescriptionEditorScrollTargets(editorHost) {
    const targets = new Set();
    const collect = (root) => {
      if (!root?.querySelectorAll) {
        return;
      }

      for (const element of root.querySelectorAll(".editor-content, .ProseMirror, .editor-container, [contenteditable='true']")) {
        if ("scrollTop" in element) {
          targets.add(element);
        }
      }
    };

    if ("scrollTop" in editorHost) {
      targets.add(editorHost);
    }
    collect(editorHost);
    collect(editorHost.shadowRoot);

    return [...targets];
  }
}
