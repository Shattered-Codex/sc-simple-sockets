import { Constants } from "../../Constants.js";

const api = foundry?.applications?.api ?? {};
const BaseV2 = api.ApplicationV2;
const HandlebarsMixin = api.HandlebarsApplicationMixin;

if (!BaseV2 || typeof HandlebarsMixin !== "function") {
  throw new Error(`${Constants.MODULE_ID}: HandlebarsApplicationMixin + ApplicationV2 are required for ScMoreActivitiesSlotPickerApp.`);
}

const BaseApplication = HandlebarsMixin(BaseV2);
const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/slot-picker.hbs`;

export class ScMoreActivitiesSlotPickerApp extends BaseApplication {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    foundry.utils.deepClone(super.DEFAULT_OPTIONS ?? {}),
    {
      tag: "section",
      classes: ["dnd5e2", "sc-sockets", "sc-sockets-view", "sc-sockets-scma-picker"],
      position: {
        width: 560,
        height: "auto"
      }
    },
    { inplace: false }
  );

  static PARTS = {
    body: {
      template: TEMPLATE_PATH
    }
  };

  #closeLabel;
  #confirmLabel;
  #destructive;
  #emptyMessage;
  #onConfirm;
  #slots;
  #submittingIndex = null;
  #subtitle;

  constructor({
    closeLabel = Constants.localize("SCSockets.SocketSlotConfig.Cancel", "Cancel"),
    confirmLabel = Constants.localize("SCSockets.Integrations.ScMoreActivities.Common.Select", "Select"),
    destructive = false,
    emptyMessage = "",
    onConfirm = null,
    slots = [],
    subtitle = "",
    title = ""
  } = {}, options = {}) {
    super({
      ...options,
      window: {
        title
      }
    });

    this.#closeLabel = closeLabel;
    this.#confirmLabel = confirmLabel;
    this.#destructive = destructive === true;
    this.#emptyMessage = String(emptyMessage ?? "");
    this.#onConfirm = typeof onConfirm === "function" ? onConfirm : null;
    this.#slots = Array.isArray(slots) ? slots : [];
    this.#subtitle = String(subtitle ?? "");
  }

  async _preparePartContext(partId, context = {}, renderOptions) {
    const base = await super._preparePartContext?.(partId, context, renderOptions) ?? context;
    if (partId !== "body") {
      return base;
    }

    return foundry.utils.mergeObject(base, {
      closeLabel: this.#closeLabel,
      confirmLabel: this.#confirmLabel,
      destructive: this.#destructive,
      emptyMessage: this.#emptyMessage,
      hasSlots: this.#slots.length > 0,
      slots: this.#slots.map((slot) => {
        const color = String(slot?.color ?? "").trim();
        const gemName = String(slot?.gemName ?? "").trim();
        const slotName = String(slot?.name ?? "").trim();
        const slotLabel = String(slot?.slotLabel ?? "").trim();
        const primaryLabel = gemName || slotName || Constants.localize("SCSockets.SocketEmptyName", "Empty");
        const slotFrameImg = String(slot?.slotFrameImg ?? Constants.SOCKET_SLOT_IMG).trim() || Constants.SOCKET_SLOT_IMG;
        const gemImg = String(slot?.gemImg ?? slot?.img ?? "").trim();

        return {
          ...slot,
          ariaLabel: [slotLabel, primaryLabel, this.#confirmLabel].filter(Boolean).join(". "),
          gemImg,
          hasGemVisual: Boolean(gemName && gemImg),
          hasSlotTint: Boolean(color),
          isSubmitting: this.#submittingIndex === slot.slotIndex,
          primaryLabel,
          slotFrameImg,
          slotMaskStyle: color ? `--sc-sockets-slot-color:${color};` : "",
          titleText: String(slot?.description ?? "").trim() || primaryLabel
        };
      }),
      subtitle: this.#subtitle
    }, { inplace: false });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element?.querySelector('[data-action="close"]')?.addEventListener("click", () => {
      void this.close();
    });

    this.element?.querySelectorAll("[data-slot-index]")?.forEach((button) => {
      button.addEventListener("click", async (event) => {
        const slotIndex = Number(event.currentTarget?.dataset?.slotIndex);
        if (!Number.isInteger(slotIndex) || !this.#onConfirm) {
          return;
        }

        this.#submittingIndex = slotIndex;
        this.render();

        try {
          const result = await this.#onConfirm(slotIndex);
          if (result?.ok !== false) {
            await this.close();
            return;
          }
        } finally {
          this.#submittingIndex = null;
          if (this.rendered) {
            this.render();
          }
        }
      });
    });
  }
}
