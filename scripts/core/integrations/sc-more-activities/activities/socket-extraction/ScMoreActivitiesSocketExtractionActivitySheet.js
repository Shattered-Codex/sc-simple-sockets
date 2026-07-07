import { Constants } from "../../../../Constants.js";

const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-extraction-effect.hbs`;

export class ScMoreActivitiesSocketExtractionActivitySheet extends dnd5e.applications.activity.ActivitySheet {
  static DEFAULT_OPTIONS = {
    classes: [
      "dnd5e2",
      "sheet",
      "activity-sheet",
      "sc-sockets",
      "sc-sockets-scma-activity--extraction"
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

    const targetMode = this.activity?.extraction?.targetMode === "self" ? "self" : "select";
    context.extraction = {
      cursorImage: this.activity?.extraction?.cursorImage ?? "",
      mode: this.activity?.extraction?.mode ?? "keep",
      targetMode
    };
    context.targetModeOptions = [
      {
        value: "select",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.TargetMode.Choices.Select")
      },
      {
        value: "self",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.TargetMode.Choices.Self")
      }
    ];
    context.isSelfTarget = targetMode === "self";
    context.targetingHint = game.i18n.localize(
      targetMode === "self"
        ? "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.TargetingHintSelf"
        : "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.TargetingHint"
    );
    context.modeHint = game.i18n.localize(
      targetMode === "self"
        ? "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.Mode.HintSelf"
        : "SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.Mode.Hint"
    );
    context.modeOptions = [
      {
        value: "keep",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.Mode.Choices.Keep")
      },
      {
        value: "delete",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketExtraction.Fields.Mode.Choices.Delete")
      }
    ];

    return context;
  }
}
