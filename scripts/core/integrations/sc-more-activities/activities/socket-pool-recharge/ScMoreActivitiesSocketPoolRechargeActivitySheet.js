import { Constants } from "../../../../Constants.js";

const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-pool-recharge-effect.hbs`;

export class ScMoreActivitiesSocketPoolRechargeActivitySheet extends dnd5e.applications.activity.ActivitySheet {
  static DEFAULT_OPTIONS = {
    classes: [
      "dnd5e2",
      "sheet",
      "activity-sheet",
      "sc-sockets",
      "sc-sockets-scma-activity--pool-recharge"
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
    context.recharge = {
      cursorImage: this.activity?.recharge?.cursorImage ?? "",
      formula: this.activity?.recharge?.formula ?? "",
      resourceKey: this.activity?.recharge?.resourceKey ?? "",
      check: {
        type: this.activity?.recharge?.check?.type ?? "none",
        ability: this.activity?.recharge?.check?.ability ?? "",
        skill: this.activity?.recharge?.check?.skill ?? "",
        dc: this.activity?.recharge?.check?.dc ?? "10"
      }
    };
    context.checkTypeOptions = [
      {
        value: "none",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketRecharge.Fields.Check.Type.Choices.None")
      },
      {
        value: "ability",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketRecharge.Fields.Check.Type.Choices.Ability")
      },
      {
        value: "skill",
        label: game.i18n.localize("SCSockets.Integrations.ScMoreActivities.SocketRecharge.Fields.Check.Type.Choices.Skill")
      }
    ];
    context.abilityOptions = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([value, config]) => ({
      value,
      label: config?.label ?? value
    }));
    context.skillOptions = Object.entries(CONFIG.DND5E?.skills ?? {}).map(([value, config]) => ({
      value,
      label: config?.label ?? value
    }));
    context.isAbilityCheck = context.recharge.check.type === "ability";
    context.isSkillCheck = context.recharge.check.type === "skill";
    context.hasCheck = context.recharge.check.type !== "none";

    return context;
  }
}
