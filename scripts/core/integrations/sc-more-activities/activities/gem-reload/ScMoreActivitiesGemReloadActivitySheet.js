import { Constants } from "../../../../Constants.js";

const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-gem-reload-effect.hbs`;

export class ScMoreActivitiesGemReloadActivitySheet extends dnd5e.applications.activity.ActivitySheet {
  static DEFAULT_OPTIONS = {
    classes: [
      "dnd5e2",
      "sheet",
      "activity-sheet",
      "sc-sockets",
      "sc-sockets-scma-activity--gem-reload"
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

    const gemMode = this.activity?.reload?.gemMode ?? "prompt";
    const targetMode = this.activity?.reload?.targetMode === "self" ? "self" : "select";
    context.reload = {
      cursorImage: this.activity?.reload?.cursorImage ?? "",
      gemMode,
      gemQuery: this.activity?.reload?.gemQuery ?? "",
      slotMode: this.activity?.reload?.slotMode ?? "ordered",
      targetMode
    };
    context.targetModeOptions = [
      {
        value: "select",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.GemReload.Fields.TargetMode.Choices.Select")
      },
      {
        value: "self",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.GemReload.Fields.TargetMode.Choices.Self")
      }
    ];
    context.isSelfTarget = targetMode === "self";
    context.targetingHint = game.i18n.localize(
      targetMode === "self"
        ? "SCSockets.Integrations.ScMoreActivities.GemReload.Fields.TargetingHintSelf"
        : "SCSockets.Integrations.ScMoreActivities.GemReload.Fields.TargetingHint"
    );
    context.gemModeOptions = [
      {
        value: "prompt",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.GemReload.Fields.GemMode.Choices.Prompt")
      },
      {
        value: "name",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.GemReload.Fields.GemMode.Choices.Name")
      },
      {
        value: "match",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.GemReload.Fields.GemMode.Choices.Match")
      }
    ];
    context.slotModeOptions = [
      {
        value: "ordered",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.GemReload.Fields.SlotMode.Choices.Ordered")
      },
      {
        value: "prompt",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.GemReload.Fields.SlotMode.Choices.Prompt")
      }
    ];
    context.needsGemQuery = gemMode === "name" || gemMode === "match";
    context.gemQueryHint = game.i18n.localize(
      gemMode === "match"
        ? "SCSockets.Integrations.ScMoreActivities.GemReload.Fields.GemQuery.HintMatch"
        : "SCSockets.Integrations.ScMoreActivities.GemReload.Fields.GemQuery.HintName"
    );
    context.gemQueryPlaceholder = game.i18n.localize(
      gemMode === "match"
        ? "SCSockets.Integrations.ScMoreActivities.GemReload.Fields.GemQuery.PlaceholderMatch"
        : "SCSockets.Integrations.ScMoreActivities.GemReload.Fields.GemQuery.PlaceholderName"
    );

    return context;
  }
}
