import { Constants } from "../../../../Constants.js";
import { GemCheckService } from "../../../../services/GemCheckService.js";

const TEMPLATE_PATH = `modules/${Constants.MODULE_ID}/templates/integrations/sc-more-activities/socket-gem-repair-effect.hbs`;
const I18N = "SCSockets.Integrations.ScMoreActivities.GemRepair";

export class ScMoreActivitiesGemRepairActivitySheet extends dnd5e.applications.activity.ActivitySheet {
  static DEFAULT_OPTIONS = {
    classes: [
      "dnd5e2",
      "sheet",
      "activity-sheet",
      "sc-sockets",
      "sc-sockets-scma-activity--repair"
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

    const check = this.activity?.repair?.check ?? {};
    const type = String(check.type ?? GemCheckService.TYPE_NONE);
    const dcMode = GemCheckService.normalizeDcMode(check.dcMode);
    const rarity = GemCheckService.normalizeRarityDcs(check.rarity);

    const amount = this.activity?.repair?.amount ?? {};
    const amountMode = amount.mode === "all" ? "all" : "count";

    context.repair = {
      action: this.activity?.repair?.action === "break" ? "break" : "repair",
      amount: {
        mode: amountMode,
        count: amount.count ?? 1
      },
      check: {
        type,
        ability: check.ability ?? "",
        skill: check.skill ?? "",
        tool: check.tool ?? "",
        dcMode,
        dc: check.dc ?? GemCheckService.DEFAULT_DC,
        formula: check.formula ?? ""
      }
    };
    context.actionOptions = ["repair", "break"].map((value) => ({
      value,
      label: game.i18n.localize(`${I18N}.Fields.Action.Choices.${value.charAt(0).toUpperCase()}${value.slice(1)}`)
    }));
    context.amountModeOptions = ["count", "all"].map((value) => ({
      value,
      label: game.i18n.localize(`${I18N}.Fields.Amount.Mode.Choices.${value.charAt(0).toUpperCase()}${value.slice(1)}`)
    }));
    context.isCountAmount = amountMode === "count";
    context.checkTypeOptions = [
      GemCheckService.TYPE_NONE,
      GemCheckService.TYPE_TOOL,
      GemCheckService.TYPE_SKILL,
      GemCheckService.TYPE_ABILITY,
      GemCheckService.TYPE_FLAT
    ].map((value) => ({
      value,
      label: game.i18n.localize(`${I18N}.Fields.Check.Type.Choices.${value.charAt(0).toUpperCase()}${value.slice(1)}`)
    }));
    context.abilityOptions = GemCheckService.listAbilityOptions();
    context.skillOptions = GemCheckService.listSkillOptions();
    context.toolOptions = GemCheckService.listToolOptions();
    context.dcModeOptions = GemCheckService.DC_MODES.map((value) => ({
      value,
      label: game.i18n.localize(`SCSockets.GemCheck.DcModes.${value.charAt(0).toUpperCase()}${value.slice(1)}`)
    }));
    context.rarityDcs = GemCheckService.listRarityOptions().map((option) => ({
      ...option,
      dc: rarity[option.value]
    }));

    context.hasCheck = type !== GemCheckService.TYPE_NONE;
    context.isAbilityCheck = type === GemCheckService.TYPE_ABILITY;
    context.isSkillCheck = type === GemCheckService.TYPE_SKILL;
    context.isToolCheck = type === GemCheckService.TYPE_TOOL;
    context.isFixedDc = dcMode === GemCheckService.DC_MODE_FIXED;
    context.isFormulaDc = dcMode === GemCheckService.DC_MODE_FORMULA;
    context.isRarityDc = dcMode === GemCheckService.DC_MODE_RARITY;

    return context;
  }
}
